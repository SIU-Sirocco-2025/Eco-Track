// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

const mongoose = require('mongoose');
require('dotenv').config();

const models = {
  HCMCReading: require('../models/hcmc.model'),
  District1Reading: require('../models/district1.model'),
  District2Reading: require('../models/district2.model'),
  District3Reading: require('../models/district3.model'),
  District4Reading: require('../models/district4.model'),
  District5Reading: require('../models/district5.model'),
  District6Reading: require('../models/district6.model'),
  District7Reading: require('../models/district7.model'),
  District9Reading: require('../models/district9.model'),
  District10Reading: require('../models/district10.model'),
  District11Reading: require('../models/district11.model'),
  BinhThanhReading: require('../models/binhThanh.model'),
  PhuNhuanReading: require('../models/phuNhuan.model'),
  TanPhuReading: require('../models/tanPhu.model'),
  ThuDucReading: require('../models/thuDuc.model'),
  BinhTanReading: require('../models/binhTan.model')
};

const stationNames = {
  HCMCReading: 'Ho Chi Minh City',
  District1Reading: 'District 1',
  District2Reading: 'District 2',
  District3Reading: 'District 3',
  District4Reading: 'District 4',
  District5Reading: 'District 5',
  District6Reading: 'District 6',
  District7Reading: 'District 7',
  District9Reading: 'District 9',
  District10Reading: 'District 10',
  District11Reading: 'District 11',
  BinhThanhReading: 'Binh Thanh',
  PhuNhuanReading: 'Phu Nhuan',
  TanPhuReading: 'Tan Phu',
  ThuDucReading: 'Thu Duc',
  BinhTanReading: 'Binh Tan'
};

// Random AQI từ 50-80
function getRandomAQI() {
  return Math.floor(Math.random() * (80 - 50 + 1)) + 50;
}

// Random weather data
function getRandomWeather() {
  return {
    tp: Math.floor(Math.random() * (35 - 25 + 1)) + 25, // Temperature 25-35°C
    hu: Math.floor(Math.random() * (90 - 60 + 1)) + 60, // Humidity 60-90%
    pr: Math.floor(Math.random() * (1020 - 1010 + 1)) + 1010, // Pressure 1010-1020 hPa
    ws: Math.floor(Math.random() * (15 - 5 + 1)) + 5, // Wind speed 5-15 km/h
    wd: Math.floor(Math.random() * 360) // Wind direction 0-360°
  };
}

// Tạo 72 bản ghi cho một model
async function seed72Records(Model, stationName) {
  console.log(`\n📊 Seeding ${stationName}...`);
  
  try {
    // Xóa dữ liệu cũ (nếu có)
    const deleteResult = await Model.deleteMany({});
    console.log(`   ✗ Đã xóa ${deleteResult.deletedCount} bản ghi cũ`);

    const records = [];
    const now = new Date();
    
    // Tạo 72 bản ghi (từ 72 giờ trước đến hiện tại)
    for (let i = 71; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Mỗi giờ cách nhau 1 tiếng
      const aqi = getRandomAQI();
      
      // Xác định main pollutant (p2 = PM2.5, p1 = PM10)
      const mainPollutants = ['p2', 'p1'];
      const mainus = mainPollutants[Math.floor(Math.random() * mainPollutants.length)];
      const maincn = mainus; // Giữ giống nhau cho đơn giản
      
      records.push({
        current: {
          pollution: {
            ts: timestamp,
            aqius: aqi,
            mainus: mainus,
            aqicn: aqi, // Giống aqius cho đơn giản
            maincn: maincn
          },
          weather: getRandomWeather()
        },
        station: {
          name: stationName
        }
      });
    }

    // Insert tất cả records
    const insertResult = await Model.insertMany(records);
    console.log(`   ✓ Đã thêm ${insertResult.length} bản ghi`);
    
    // Kiểm tra lại
    const count = await Model.countDocuments();
    const latest = await Model.findOne().sort({ 'current.pollution.ts': -1 });
    const oldest = await Model.findOne().sort({ 'current.pollution.ts': 1 });
    
    if (latest && oldest) {
      const hoursDiff = Math.round((latest.current.pollution.ts - oldest.current.pollution.ts) / (1000 * 60 * 60));
      console.log(`   ℹ Total: ${count} bản ghi (${hoursDiff} giờ)`);
      console.log(`   ℹ AQI range: ${oldest.current.pollution.aqius} - ${latest.current.pollution.aqius}`);
      console.log(`   ℹ Time: ${oldest.current.pollution.ts.toISOString()} → ${latest.current.pollution.ts.toISOString()}`);
    }
    
    return true;
  } catch (error) {
    console.error(`   ✗ Lỗi: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    console.log('==========================================');
    console.log('🌱 SEED 72H DATA FOR ALL STATIONS');
    console.log('==========================================');
    console.log(`📅 Thời gian: ${new Date().toISOString()}`);
    console.log(`🎲 AQI range: 50-80`);
    console.log(`⏱️  Tạo 72 bản ghi cho mỗi trạm (1 bản ghi/giờ)`);
    
    // Connect to MongoDB
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ Database connected');

    // Seed data cho tất cả các models
    let successCount = 0;
    let totalStations = Object.keys(models).length;

    for (const [modelName, Model] of Object.entries(models)) {
      const stationName = stationNames[modelName];
      const success = await seed72Records(Model, stationName);
      if (success) successCount++;
    }

    console.log('\n==========================================');
    console.log(`✅ HOÀN TẤT: ${successCount}/${totalStations} trạm`);
    console.log('==========================================');
    
    if (successCount === totalStations) {
      console.log('\n🎉 Tất cả trạm đã có đầy đủ 72 bản ghi!');
      console.log('💡 Giờ bạn có thể test API dự đoán:');
      console.log('   GET /api/prediction/forecast-24h/district1');
      console.log('   GET /api/prediction/forecast-24h/district3');
      console.log('   GET /api/prediction/forecast-24h/binhThanh');
    } else {
      console.log(`\n⚠️  Có ${totalStations - successCount} trạm bị lỗi, xem log ở trên`);
    }

  } catch (error) {
    console.error('\n❌ LỖI NGHIÊM TRỌNG:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database disconnected');
    process.exit(0);
  }
}

// Run
if (require.main === module) {
  main();
}

module.exports = { seed72Records };
