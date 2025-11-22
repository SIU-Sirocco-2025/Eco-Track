const mongoose = require('mongoose');
const generate = require('../helpers/generate');

const otpSchema = new mongoose.Schema({
    email: String,
    otp: String,
    expiresAt:{
        type: Date,
        expires: 300, // 5 minutes
    }
    
},{
    timestamps: true
})

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model('OTP', otpSchema , 'otp')

module.exports = OTP;