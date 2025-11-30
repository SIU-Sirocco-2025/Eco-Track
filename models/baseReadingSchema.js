// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const mongoose = require('mongoose');

module.exports = function buildBaseReadingSchema() {
  const schema = new mongoose.Schema({
    city: { type: String },
    state: { type: String },
    country: { type: String },

    location: {
      type: { type: String },          // "Point"
      coordinates: { type: [Number] }  // [lon, lat]
    },

    current: {
      pollution: {
        ts: { type: Date, index: true },
        aqius: { type: Number },
        mainus: { type: String },
        aqicn: { type: Number },
        maincn: { type: String }
      },
      weather: {
        ts: { type: Date },
        ic: { type: String },      // icon code
        hu: { type: Number },      // humidity
        pr: { type: Number },      // pressure
        tp: { type: Number },      // temperature
        wd: { type: Number },      // wind direction
        ws: { type: Number },      // wind speed
        heatIndex: { type: Number }
      }
    },

    // Lưu toàn bộ payload gốc nếu cần đối chiếu
    raw: { type: Object, select: false }
  }, {
    collection: null,  // set tại từng district model
    timestamps: false
  });

  // ĐÃ có index ở trường ts (current.pollution.ts) bằng "index: true" phía trên.
  // Tránh tạo trùng index gây cảnh báo của Mongoose.
  return schema;
};