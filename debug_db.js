require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');
const UploadBatch = require('./models/UploadBatch');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://GAZI:gazi1234@resultify.crrmpzp.mongodb.net/';

(async () => {
  try {
    console.log('Connecting to', MONGODB_URI);
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected.');

    const studentCount = await Student.countDocuments();
    const batchCount = await UploadBatch.countDocuments();

    console.log('Student count:', studentCount);
    console.log('Batch count:', batchCount);

    const students = await Student.find().limit(5).lean();
    const batches = await UploadBatch.find().limit(5).lean();

    console.log('\nSample students:');
    console.dir(students, { depth: 4, colors: false });

    console.log('\nSample batches:');
    console.dir(batches, { depth: 4, colors: false });

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Debug DB error:', err);
    process.exit(1);
  }
})();
