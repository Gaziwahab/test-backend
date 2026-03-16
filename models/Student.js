const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  name: String,
  marks: Number,
  max: Number,
  grade: String
}, { _id: false });

const StudentSchema = new mongoose.Schema({
  college: { type: String, required: true },
  course: { type: String, required: true },
  roll_no: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  mobile_no: { type: String },
  subjects: { type: [SubjectSchema], default: [] },
  total: { type: Number },
  percentage: { type: Number },
  overallGrade: { type: String },
  rank: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema);
