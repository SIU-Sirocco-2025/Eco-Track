const mongoose = require('mongoose');
require('dotenv').config();
const HCMCAirHour = require('../models/hcmcAirHour.model');

async function checkLatestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to database\n');

    // Lấy 10 record mới nhất
    const latestRecords = await HCMCAirHour.find()
      .sort({ from: -1 })
      .limit(10)
      .select('from measurements.pm25.value');

    console.log('📊 Latest 10 records in hcmc_air_hours:\n');
    latestRecords.forEach((record, index) => {
      const date = new Date(record.from);
      const pm25 = record.measurements?.pm25?.value || 'N/A';
      console.log(`${index + 1}. ${date.toISOString()} (PM2.5: ${pm25})`);
    });

    // Kiểm tra có dữ liệu ngày 28 không
    const nov28Records = await HCMCAirHour.countDocuments({
      from: {
        $gte: new Date('2025-11-28T00:00:00Z'),
        $lt: new Date('2025-11-29T00:00:00Z')
      }
    });

    console.log(`\n📅 Records for November 28, 2025: ${nov28Records}`);

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkLatestData();
