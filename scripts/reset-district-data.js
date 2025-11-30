// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

const mongoose = require('mongoose');
require('dotenv').config();
const models = require('../models');

async function resetDistrictData() {
  try {
    // Kết nối database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Database connected');

    const districtModels = [
      { name: 'HCMC', model: models.HCMCReading },
      { name: 'Quận 1', model: models.District1Reading },
      { name: 'Quận 2', model: models.District2Reading },
      { name: 'Quận 3', model: models.District3Reading },
      { name: 'Quận 4', model: models.District4Reading },
      { name: 'Quận 5', model: models.District5Reading },
      { name: 'Quận 6', model: models.District6Reading },
      { name: 'Quận 7', model: models.District7Reading },
      { name: 'Quận 9', model: models.District9Reading },
      { name: 'Quận 10', model: models.District10Reading },
      { name: 'Quận 11', model: models.District11Reading },
      { name: 'Bình Tân', model: models.BinhTanReading },
      { name: 'Phú Nhuận', model: models.PhuNhuanReading },
      { name: 'Bình Thạnh', model: models.BinhThanhReading },
      { name: 'Thủ Đức', model: models.ThuDucReading }
    ];

    console.log('\n🗑️  Deleting old data...\n');

    for (const district of districtModels) {
      const result = await district.model.deleteMany({});
      console.log(`   ${district.name}: Deleted ${result.deletedCount} records`);
    }

    console.log('\n✅ All district data has been reset!');
    console.log('\n💡 Now restart the server to sync fresh data with new logic.\n');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetDistrictData();
