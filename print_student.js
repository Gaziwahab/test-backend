const mongoose = require('mongoose');
const Student = require('./models/Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://GAZI:gazi1234@resultify.crrmpzp.mongodb.net/';

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const doc = await Student.findOne({ roll_no: '1005' }).lean();
  console.log('STUDENT:', JSON.stringify(doc, null, 2));
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
