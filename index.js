require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Student = require('./models/Student');
const UploadBatch = require('./models/UploadBatch');
const multer = require('multer');
const xlsx = require('xlsx');

// routes
const studentsUploadRouter = require('./routes/upload');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
// Configure CORS for deployment
app.use(cors({
  origin: [
    'http://localhost:5173',  // Local development
    'http://localhost:3000',  // Local production build
    'http://localhost:8080',  // Another local development port
    'https://resultify-portal.vercel.app', // Production deployment
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://GAZI:gazi1234@resultify.crrmpzp.mongodb.net/';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/api/health', (req, res) => res.json({ ok: true, msg: 'Resultify backend running' }));

// Get uploaded batches from DB
app.get('/api/admin/batches', async (req, res) => {
  try {
    const batches = await UploadBatch.find().sort({ timestamp: -1 }).lean();
    // attach id for frontend convenience
    const mapped = batches.map((b) => ({ ...b, id: b._id }));
    res.json(mapped);
  } catch (err) {
    console.error('Failed to fetch batches', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload Excel/CSV and store students
app.post('/api/admin/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

  const students = rows.map((r) => {
      // Expect columns: college, course, roll_no, name, mobile_no, total, percentage, overallGrade, rank, subjects
      // subjects can be JSON string or semicolon separated entries like "Physics:87/100;Math:90/100"
      let subjects = [];
      if (r.subjects) {
        try {
          if (typeof r.subjects === 'string' && r.subjects.trim().startsWith('[')) {
            subjects = JSON.parse(r.subjects);
          } else if (typeof r.subjects === 'string') {
            // parse semicolon-separated
            subjects = r.subjects.split(';').map((s) => {
              const [namePart, scorePart] = s.split(':').map((x) => x && x.trim());
              if (!namePart) return null;
              let marks = null, max = null;
              if (scorePart) {
                const m = scorePart.split('/').map((x) => parseFloat(x));
                marks = isNaN(m[0]) ? null : m[0];
                max = isNaN(m[1]) ? null : m[1];
              }
              return { name: namePart, marks, max };
            }).filter(Boolean);
          } else if (Array.isArray(r.subjects)) {
            subjects = r.subjects;
          }
        } catch (e) {
          subjects = [];
        }
      } else {
        // try to detect subject columns like subject1_name, subject1_marks
        const detected = [];
        Object.keys(r).forEach((k) => {
          const m = k.match(/subject_(\d+)_name/i);
          if (m) detected.push(m[1]);
        });
        if (detected.length) {
          subjects = detected.map((i) => ({
            name: r[`subject_${i}_name`] || '',
            marks: r[`subject_${i}_marks`] != null ? Number(r[`subject_${i}_marks`]) : null,
            max: r[`subject_${i}_max`] != null ? Number(r[`subject_${i}_max`]) : null
          }));
        }
      }

      return {
        college: r.college || r.college_name || 'Unknown',
        course: r.course || r.course_name || 'Unknown',
  roll_no: String(r.roll_no || r.rollno || r.Roll || '').trim(),
        name: r.name || r.student_name || 'Unknown',
        mobile_no: r.mobile_no || r.mobile || null,
        subjects,
        total: r.total != null ? Number(r.total) : undefined,
        percentage: r.percentage != null ? Number(r.percentage) : undefined,
        overallGrade: r.overallGrade || r.grade || null,
        rank: r.rank != null ? Number(r.rank) : undefined
      };
    });

  // Filter out rows without a roll_no
  const validStudents = students.filter((s) => s.roll_no && s.roll_no.length > 0);
  const skippedInvalid = students.length - validStudents.length; // missing roll_no

    // Find existing roll_no values to avoid inserting duplicates
    const rollNos = validStudents.map((s) => s.roll_no);
    const existingRolls = rollNos.length ? await Student.find({ roll_no: { $in: rollNos } }).distinct('roll_no') : [];

    const newStudents = validStudents.filter((s) => !existingRolls.includes(s.roll_no));
    const skippedDuplicates = validStudents.length - newStudents.length;

    // Insert only new students (do not upsert existing ones)
    if (newStudents.length) {
      try {
        await Student.insertMany(newStudents, { ordered: false });
      } catch (e) {
        // In case of race-condition duplicates, compute how many were inserted
        console.error('Partial insert error:', e.message || e);
      }
    }

    // Create upload batch record (counts reflect actual insertion attempts)
    const batch = new UploadBatch({
      college: req.body.college || (validStudents[0] && validStudents[0].college) || 'Unknown',
      course: req.body.course || (validStudents[0] && validStudents[0].course) || 'Unknown',
      rowCount: newStudents.length,
      published: false
    });
    await batch.save();

    res.json({ ok: true, imported: newStudents.length, skippedInvalid, skippedDuplicates, batchId: batch._id });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Publish a batch
app.post('/api/admin/batches/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await UploadBatch.findByIdAndUpdate(id, { published: true }, { new: true }).lean();
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json({ ok: true, batch: { ...batch, id: batch._id } });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Failed to publish batch' });
  }
});

// Mount students routes (upload + fetching)
const studentsRouter = require('./routes/students');
const collegesRouter = require('./routes/colleges');
app.use('/api/students', studentsRouter);
app.use('/api/students', studentsUploadRouter);
app.use('/api/colleges', collegesRouter);

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ sub: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple protected test route
app.get('/api/admin/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: payload });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

const server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

server.on('error', (err) => {
  console.error('Server listen error:', err);
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the process using it or set PORT to a different value.`);
  }
  // exit with failure so supervisors can restart or you can inspect logs
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  // optionally exit or attempt graceful shutdown
  process.exit(1);
});
