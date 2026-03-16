const mongoose = require('mongoose');

const UploadBatchSchema = new mongoose.Schema({
  college: String,
  course: String,
  rowCount: Number,
  timestamp: { type: Date, default: Date.now },
  published: { type: Boolean, default: false }
});

module.exports = mongoose.model('UploadBatch', UploadBatchSchema);
