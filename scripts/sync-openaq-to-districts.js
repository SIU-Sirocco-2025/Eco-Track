// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const HCMCAirHour = require('../models/hcmcAirHour.model');
const models = require('../models');

// Kết nối database
mongoose.connect(process.env.MONGODB_URL).then(() => {
  console.log('✅ Database connected');
}).catch(err => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});

// Hàm tính AQI US từ PM2.5
function calculatePM25AQI(pm25) {
  if (pm25 == null || pm25 < 0) return null;
  
  const breakpoints = [
    { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
    { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (pm25 >= bp.cLow && pm25 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (pm25 > 500.4) return 500;
  return null;
}

// Hàm tính AQI từ PM10
function calculatePM10AQI(pm10) {
  if (pm10 == null || pm10 < 0) return null;
  
  const breakpoints = [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
    { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
    { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
    { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
    { cLow: 425, cHigh: 504, iLow: 301, iHigh: 400 },
    { cLow: 505, cHigh: 604, iLow: 401, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (pm10 >= bp.cLow && pm10 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm10 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (pm10 > 604) return 500;
  return null;
}

// Hàm tính AQI từ O3 (8-hour)
function calculateO3AQI(o3) {
  if (o3 == null || o3 < 0) return null;
  
  const breakpoints = [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
    { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
    { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
    { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 }
  ];

  for (const bp of breakpoints) {
    if (o3 >= bp.cLow && o3 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (o3 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (o3 > 200) return 300;
  return null;
}

// Hàm tính AQI từ NO2
function calculateNO2AQI(no2) {
  if (no2 == null || no2 < 0) return null;
  
  const breakpoints = [
    { cLow: 0, cHigh: 53, iLow: 0, iHigh: 50 },
    { cLow: 54, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 360, iLow: 101, iHigh: 150 },
    { cLow: 361, cHigh: 649, iLow: 151, iHigh: 200 },
    { cLow: 650, cHigh: 1249, iLow: 201, iHigh: 300 },
    { cLow: 1250, cHigh: 1649, iLow: 301, iHigh: 400 },
    { cLow: 1650, cHigh: 2049, iLow: 401, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (no2 >= bp.cLow && no2 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (no2 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (no2 > 2049) return 500;
  return null;
}

// Hàm tính AQI từ SO2
function calculateSO2AQI(so2) {
  if (so2 == null || so2 < 0) return null;
  
  const breakpoints = [
    { cLow: 0, cHigh: 35, iLow: 0, iHigh: 50 },
    { cLow: 36, cHigh: 75, iLow: 51, iHigh: 100 },
    { cLow: 76, cHigh: 185, iLow: 101, iHigh: 150 },
    { cLow: 186, cHigh: 304, iLow: 151, iHigh: 200 },
    { cLow: 305, cHigh: 604, iLow: 201, iHigh: 300 },
    { cLow: 605, cHigh: 804, iLow: 301, iHigh: 400 },
    { cLow: 805, cHigh: 1004, iLow: 401, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (so2 >= bp.cLow && so2 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (so2 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (so2 > 1004) return 500;
  return null;
}

// Hàm tính AQI từ CO (ppm -> ppb * 1000)
function calculateCOAQI(co) {
  if (co == null || co < 0) return null;
  
  // CO thường đo bằng ppm, cần convert sang ppb nếu cần
  const breakpoints = [
    { cLow: 0, cHigh: 4.4, iLow: 0, iHigh: 50 },
    { cLow: 4.5, cHigh: 9.4, iLow: 51, iHigh: 100 },
    { cLow: 9.5, cHigh: 12.4, iLow: 101, iHigh: 150 },
    { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
    { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
    { cLow: 30.5, cHigh: 40.4, iLow: 301, iHigh: 400 },
    { cLow: 40.5, cHigh: 50.4, iLow: 401, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (co >= bp.cLow && co <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (co - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  if (co > 50.4) return 500;
  return null;
}

// Hàm tính AQI tổng hợp từ tất cả các pollutants
function calculateOverallAQI(measurements) {
  const aqiValues = [];
  let mainPollutant = 'pm25';
  
  // Lấy giá trị measurements
  const pm25 = measurements?.pm25?.value;
  const pm10 = measurements?.pm10?.value;
  const o3 = measurements?.o3?.value;
  const no2 = measurements?.no2?.value;
  const so2 = measurements?.so2?.value;
  const co = measurements?.co?.value;

  // Tính AQI cho từng pollutant
  if (pm25 != null) {
    const aqi = calculatePM25AQI(pm25);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'pm25' });
  }
  
  if (pm10 != null) {
    const aqi = calculatePM10AQI(pm10);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'pm10' });
  }
  
  if (o3 != null) {
    const aqi = calculateO3AQI(o3);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'o3' });
  }
  
  if (no2 != null) {
    const aqi = calculateNO2AQI(no2);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'no2' });
  }
  
  if (so2 != null) {
    const aqi = calculateSO2AQI(so2);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'so2' });
  }
  
  if (co != null) {
    const aqi = calculateCOAQI(co);
    if (aqi != null) aqiValues.push({ aqi, pollutant: 'co' });
  }

  // Tìm AQI cao nhất (worst case)
  if (aqiValues.length === 0) return { aqius: null, mainus: null };
  
  aqiValues.sort((a, b) => b.aqi - a.aqi);
  return {
    aqius: aqiValues[0].aqi,
    mainus: aqiValues[0].pollutant
  };
}

// Hàm chuyển đổi từ OpenAQ sang định dạng district reading
function convertToDistrictReading(airHourData, districtInfo, isHCMC = false, hcmcAQI = null) {
  const { aqius, mainus } = calculateOverallAQI(airHourData.measurements);
  
  let finalAQI = aqius;
  if (!isHCMC && hcmcAQI != null) {
    const offset = (Math.random() * 2 - 1) * 12; // Random -12 đến +12
    finalAQI = Math.round(Math.max(0, hcmcAQI + offset));
  }
  
  // Tạo fake weather data (có thể integrate với weather API sau)
  const fakeWeather = {
    ts: airHourData.to,
    tp: 28 + Math.random() * 5, // 28-33°C
    hu: 60 + Math.random() * 20, // 60-80%
    pr: 1010 + Math.random() * 10, // 1010-1020 hPa
    ws: 2 + Math.random() * 3, // 2-5 m/s
    wd: Math.floor(Math.random() * 360)
  };

  return {
    city: districtInfo.city,
    state: districtInfo.state,
    country: districtInfo.country,
    location: {
      type: 'Point',
      coordinates: districtInfo.coordinates // [lon, lat]
    },
    current: {
      pollution: {
        ts: airHourData.to,
        aqius: finalAQI,
        mainus: mainus,
        aqicn: null,
        maincn: null
      },
      weather: fakeWeather
    }
  };
}

// Danh sách các quận và thông tin
const districtsList = [
  { model: models.HCMCReading, city: 'Ho Chi Minh City', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6297, 10.8231] },
  { model: models.District1Reading, city: 'Quận 1', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7009, 10.7756] },
  { model: models.District2Reading, city: 'Quận 2', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7425, 10.7915] },
  { model: models.District3Reading, city: 'Quận 3', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6828, 10.7829] },
  { model: models.District4Reading, city: 'Quận 4', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7025, 10.7543] },
  { model: models.District5Reading, city: 'Quận 5', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6508, 10.7544] },
  { model: models.District6Reading, city: 'Quận 6', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6347, 10.7490] },
  { model: models.District7Reading, city: 'Quận 7', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7197, 10.7335] },
  { model: models.District9Reading, city: 'Quận 9', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.8047, 10.8502] },
  { model: models.District10Reading, city: 'Quận 10', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6684, 10.7733] },
  { model: models.District11Reading, city: 'Quận 11', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6509, 10.7626] },
  { model: models.BinhTanReading, city: 'Quận Bình Tân', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6053, 10.7400] },
  { model: models.PhuNhuanReading, city: 'Quận Phú Nhuận', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6780, 10.7980] },
  { model: models.BinhThanhReading, city: 'Quận Bình Thạnh', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7123, 10.8058] },
  { model: models.ThuDucReading, city: 'Thủ Đức', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.7675, 10.8509] },
  { model: models.TanPhuReading, city: 'Quận Tân Phú', state: 'Ho Chi Minh City', country: 'Vietnam', coordinates: [106.6231, 10.7865] }
];

// Hàm chính để sync data
async function syncOpenAQToDistricts(hoursLimit = 72) {
  try {
    console.log('\n🚀 Starting sync process...\n');

    // Lấy dữ liệu mới nhất từ hcmc_air_hours
    const airHourRecords = await HCMCAirHour.find()
      .sort({ to: -1 })
      .limit(hoursLimit);

    if (!airHourRecords || airHourRecords.length === 0) {
      console.log('⚠️  No data found in hcmc_air_hours');
      return;
    }

    airHourRecords.reverse(); // Xử lý từ cũ đến mới

    console.log(`📊 Found ${airHourRecords.length} records from OpenAQ\n`);

    let totalSaved = 0;

    // Lưu từng record vào tất cả các quận
    for (const airHour of airHourRecords) {
      console.log(`⏰ Processing: ${airHour.to.toISOString()}`);
      const { aqius: hcmcAQI } = calculateOverallAQI(airHour.measurements);
      for (const district of districtsList) {
        try {
          // Xác định trạm thành phố (HCMC-wide) để không random offset
          const isHCMC = district.model === models.HCMCReading;
          // Check xem đã tồn tại chưa
          const existing = await district.model.findOne({
            'current.pollution.ts': airHour.to
          });

          if (existing) {
            // Update
            const reading = convertToDistrictReading(airHour, district, isHCMC, hcmcAQI);
            await district.model.updateOne(
              { _id: existing._id },
              { $set: reading }
            );
          } else {
            // Insert new
            const reading = convertToDistrictReading(airHour, district, isHCMC, hcmcAQI);
            await district.model.create(reading);
            totalSaved++;
          }
        } catch (err) {
          console.error(`   ❌ Error saving to ${district.city}:`, err.message);
        }
      }
      
      console.log(`   ✅ Saved to all districts`);
    }

    console.log(`\n✨ Sync completed! Total new records: ${totalSaved}`);
    console.log(`📈 Processed ${airHourRecords.length} hours across ${districtsList.length} districts\n`);

  } catch (error) {
    console.error('❌ Sync error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Chạy script
const hoursToSync = process.argv[2] ? parseInt(process.argv[2]) : 72;
console.log(`\n🔄 Syncing last ${hoursToSync} hours from OpenAQ to all districts...\n`);

syncOpenAQToDistricts(hoursToSync);
