const mongoose = require('mongoose');

// Base fields reused across districts
// You can add more fields later: pressure, visibility, etc.
module.exports = function buildBaseReadingSchema() {
  return new mongoose.Schema({
    ts: { type: Date, default: Date.now, index: true }, // timestamp of fetch
    aqius: { type: Number }, // US AQI
    mainus: { type: String }, // Main pollutant US
    aqicn: { type: Number }, // CN AQI (if API returns)
    maincn: { type: String }, // Main pollutant CN
    tempC: { type: Number }, // temperature C
    humidity: { type: Number }, // %
    wind: { type: Number }, // wind speed
    pressure: { type: Number },
    raw: { type: Object, select: false } // entire API payload (hidden by default)
  }, {
    collection: null, // set in each model file
    timestamps: false
  });
};
