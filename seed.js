require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://GAZI:gazi1234@resultify.crrmpzp.mongodb.net/';

async function run() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB for seeding');

  const username = 'admin';
  const password = 'admin123';

  const existing = await User.findOne({ username });
  if (existing) {
    console.log('Demo user already exists');
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({ username, passwordHash, role: 'admin' });
  await user.save();

  console.log('Demo admin user created:', username);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
