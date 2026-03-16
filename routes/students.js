const express = require('express');
const Student = require('../models/Student');

const router = express.Router();

function toMongoLike(doc) {
  if (!doc) return null;
  const d = {
    _id: { $oid: String(doc._id) },
    roll_no: doc.roll_no,
    __v: doc.__v || 0,
    college: doc.college,
    course: doc.course,
    createdAt: { $date: doc.createdAt ? new Date(doc.createdAt).toISOString() : null },
    mobile_no: doc.mobile_no || null,
    name: doc.name,
    overallGrade: doc.overallGrade || null,
    percentage: doc.percentage != null ? doc.percentage : null,
    rank: doc.rank != null ? doc.rank : null,
    subjects: doc.subjects || [],
    total: doc.total != null ? doc.total : null,
    updatedAt: { $date: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null }
  };
  return d;
}

// GET /api/students/:roll_no - get a single student by roll_no
router.get('/:roll_no', async (req, res) => {
  try {
    const { roll_no } = req.params;
    const { college, course } = req.query;
    const query = { roll_no };
    if (college) query.college = college;
    if (course) query.course = course;
    const doc = await Student.findOne(query).lean();
    if (!doc) return res.status(404).json({ error: 'Student not found' });
    return res.json(toMongoLike(doc));
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/students - optional ?limit= & ?skip=
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = parseInt(req.query.skip) || 0;
    const docs = await Student.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    const data = docs.map(toMongoLike);
    res.json({ count: data.length, data });
  } catch (err) {
    console.error('List students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
