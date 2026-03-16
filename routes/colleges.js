const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const router = express.Router();

// Test endpoint to check if any students exist
router.get('/test', async (req, res) => {
  try {
    const count = await Student.countDocuments();
    const sampleStudent = await Student.findOne().lean();
    res.json({
      studentCount: count,
      sampleStudent: sampleStudent ? {
        college: sampleStudent.college,
        course: sampleStudent.course
      } : null
    });
  } catch (err) {
    console.error('Test endpoint error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// GET /api/colleges - get all unique college names
router.get('/', async (req, res) => {
  try {
    console.log('Fetching colleges from database...');
    
    // Check if we have any students
    const studentCount = await Student.countDocuments();
    console.log('Total students in database:', studentCount);
    
    if (studentCount === 0) {
      console.log('No students found in database');
      return res.status(200).json([]);
    }

    // Get distinct colleges
    const colleges = await Student.distinct('college');
    console.log('Raw colleges from DB:', colleges);
    
    if (!Array.isArray(colleges)) {
      console.error('Invalid response from distinct query:', colleges);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Invalid response format from database'
      });
    }
    
    // Filter out null/undefined/empty values and sort
    const filteredColleges = colleges
      .filter(college => college && typeof college === 'string' && college.trim().length > 0)
      .map(college => college.trim())
      .sort((a, b) => a.localeCompare(b));
      
    console.log('Filtered and sorted colleges:', filteredColleges);
    
    // Set proper headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json(filteredColleges);
  } catch (err) {
    console.error('Get colleges error:', err);
    console.error('Error details:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Server error', 
      message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred while fetching colleges',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// GET /api/colleges/:college/courses - get all courses for a college
router.get('/:college/courses', async (req, res) => {
  try {
    const { college } = req.params;
    const courses = await Student.distinct('course', { college });
    res.json(courses.filter(Boolean).sort());
  } catch (err) {
    console.error('Get courses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;