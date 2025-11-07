const mongoose = require('mongoose');
const buildBaseReadingSchema = require('./baseReadingSchema');

const schema = buildBaseReadingSchema();
// Override collection for district1
schema.set('collection', 'district1_readings');

module.exports = mongoose.model('District1Reading', schema);
