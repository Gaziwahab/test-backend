const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const Student = require('../models/Student');
const UploadBatch = require('../models/UploadBatch');

const router = express.Router();

// Multer setup to handle file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/students/upload
router.post('/upload', upload.any(), async (req, res) => {
  try {
    const fileObj = (req.files && req.files[0]) || null;
    if (!fileObj) return res.status(400).json({ message: 'No file uploaded' });

    const workbook = xlsx.read(fileObj.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    // Normalize rows into student documents
    const students = data.map((row) => {
      // parse subjects robustly: handle strings like
      // "Physics:87/100(A), Mathematics:90/100(A+)" where commas separate subjects
      let subjects = [];
      if (row.subjects) {
        if (typeof row.subjects === 'string') {
          // split on commas that are NOT inside parentheses
          const parts = [];
          let buf = '';
          let depth = 0;
          for (let i = 0; i < row.subjects.length; i++) {
            const ch = row.subjects[i];
            if (ch === '(') depth++;
            if (ch === ')') depth = Math.max(0, depth - 1);
            if (ch === ',' && depth === 0) {
              parts.push(buf);
              buf = '';
              continue;
            }
            buf += ch;
          }
          if (buf.trim().length) parts.push(buf);

          subjects = parts.map((sub) => {
            const raw = String(sub || '').trim();
            if (!raw) return null;
            // name: marks/max (grade)
            const idx = raw.indexOf(':');
            if (idx === -1) return null;
            const namePart = raw.slice(0, idx).trim();
            const rest = raw.slice(idx + 1).trim();
            let marks = null;
            let max = null;
            let grade = null;
            if (rest) {
              // rest could be "87/100(A)" or "87/100 (A)"
              const m = rest.split(' ')[0];
              const [mm, M] = m.split('/').map((x) => parseFloat(x));
              marks = Number.isFinite(mm) ? mm : null;
              max = Number.isFinite(M) ? M : null;
              const g = rest.match(/\(([^)]+)\)/);
              if (g) grade = g[1].trim();
            }
            return { name: namePart, marks, max, grade };
          }).filter(Boolean);
        } else if (Array.isArray(row.subjects)) {
          subjects = row.subjects;
        }
      }

      const roll = row.roll_no != null ? String(row.roll_no).trim() : '';

      return {
        college: row.college || row.college_name || 'Unknown',
        course: row.course || row.course_name || 'Unknown',
        roll_no: roll,
        name: row.name || row.student_name || 'Unknown',
        mobile_no: row.mobile_no != null ? String(row.mobile_no) : null,
        subjects,
        total: row.total != null ? Number(row.total) : undefined,
        percentage: row.percentage != null ? Number(row.percentage) : undefined,
        overallGrade: row.overallGrade || row.grade || null,
        rank: row.rank != null ? Number(row.rank) : undefined
      };
    });

    // Filter valid rows with roll_no
    const valid = students.filter((s) => s.roll_no && s.roll_no.length > 0);
    const missing = students.length - valid.length;

    // Check existing roll_nos
    const rollNos = valid.map((s) => s.roll_no);
    const existing = rollNos.length ? await Student.find({ roll_no: { $in: rollNos } }).distinct('roll_no') : [];

    // If ?mode=replace is provided, upsert/replace existing documents (overwrite)
    const mode = (req.query.mode || '').toString().toLowerCase();
    let inserted = 0;
    let duplicates = 0;
    if (mode === 'replace') {
      // perform bulk upsert operations
      const ops = valid.map((s) => ({
        updateOne: {
          filter: { roll_no: s.roll_no },
          update: { $set: s },
          upsert: true
        }
      }));
      if (ops.length) {
        const res = await Student.bulkWrite(ops, { ordered: false });
        // bulkWrite result: upsertedCount + modifiedCount etc.
        inserted = (res.upsertedCount || 0);
        // consider existing ones as duplicates count
        duplicates = valid.length - inserted;
      }
    } else {
      const toInsert = valid.filter((s) => !existing.includes(s.roll_no));
      duplicates = valid.length - toInsert.length;

      if (toInsert.length) {
        try {
          const docs = await Student.insertMany(toInsert, { ordered: false });
          inserted = docs.length;
        } catch (err) {
          // insertMany can throw on duplicate keys in race conditions; compute how many were added
          console.error('insertMany error:', err && err.message);
        }
      }
    }

    // Create upload batch record
    const firstStudent = valid[0] || {};
    const batch = new UploadBatch({
      college: firstStudent.college || 'Unknown',
      course: firstStudent.course || 'Unknown',
      rowCount: inserted,
      published: false
    });
    await batch.save();

    res.status(200).json({ 
      message: 'Data import completed', 
      inserted, 
      missing, 
      duplicates,
      batchId: batch._id 
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Error importing data', error: err.message });
  }
});

module.exports = router;
