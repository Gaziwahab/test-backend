const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const Student = require('./models/Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://GAZI:gazi1234@resultify.crrmpzp.mongodb.net/';

function parseSubjects(subjectsRaw) {
  if (!subjectsRaw) return [];
  if (Array.isArray(subjectsRaw)) return subjectsRaw;
  const s = String(subjectsRaw);
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
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

  return parts.map((raw) => {
    const r = String(raw || '').trim();
    const idx = r.indexOf(':');
    if (idx === -1) return null;
    const name = r.slice(0, idx).trim();
    const rest = r.slice(idx + 1).trim();
    let marks = null;
    let max = null;
    let grade = null;
    if (rest) {
      const m = rest.split(' ')[0];
      const [mm, M] = m.split('/').map((x) => parseFloat(x));
      marks = Number.isFinite(mm) ? mm : null;
      max = Number.isFinite(M) ? M : null;
      const g = rest.match(/\(([^)]+)\)/);
      if (g) grade = g[1].trim();
    }
    return { name, marks, max, grade };
  }).filter(Boolean);
}

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const filePath = path.join(__dirname, '..', 'public', 'file', 'resultify_csv_template.csv');
  if (!fs.existsSync(filePath)) {
    console.error('CSV file not found:', filePath);
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  const students = rows.map((r) => {
    const roll = r.roll_no != null ? String(r.roll_no).trim() : '';
    return {
      college: r.college || 'Unknown',
      course: r.course || 'Unknown',
      roll_no: roll,
      name: r.name || 'Unknown',
      mobile_no: r.mobile_no != null ? String(r.mobile_no) : null,
      subjects: parseSubjects(r.subjects),
      total: r.total != null ? Number(r.total) : undefined,
      percentage: r.percentage != null ? Number(r.percentage) : undefined,
      overallGrade: r.overallGrade || r.grade || null,
      rank: r.rank != null ? Number(r.rank) : undefined
    };
  }).filter((s) => s.roll_no && s.roll_no.length > 0);

  if (!students.length) {
    console.log('No valid students found in CSV');
    process.exit(0);
  }

  const ops = students.map((s) => ({
    updateOne: {
      filter: { roll_no: s.roll_no },
      update: { $set: s },
      upsert: true
    }
  }));

  const res = await Student.bulkWrite(ops, { ordered: false });
  console.log('bulkWrite result:', res.result || res);

  // print inserted/upserted docs
  for (const s of students) {
    const doc = await Student.findOne({ roll_no: s.roll_no }).lean();
    console.log('Stored:', s.roll_no, 'subjects:', doc.subjects);
  }

  await mongoose.disconnect();
  console.log('Done');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
