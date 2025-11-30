// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
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

const OTP = mongoose.model('OTP', otpSchema , 'otp')

module.exports = OTP;