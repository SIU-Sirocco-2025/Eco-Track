require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    console.error('Missing MONGODB_URL in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUrl);
    const HCMCReading = require('../models/district3.model');

    const docs = await HCMCReading.find(
      { 'current.pollution.ts': { $exists: true } },
      { raw: 0 }
    )
      .sort({ 'current.pollution.ts': -1 })
      .limit(20)
      .lean();

    if (!docs.length) {
      console.log('No documents found in hcmc_readings yet.');
    } else {
      const simplified = docs.map(d => ({
        city: d.city,
        ts: d.current?.pollution?.ts,
        aqius: d.current?.pollution?.aqius,
      }));
      console.log(JSON.stringify(simplified, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
