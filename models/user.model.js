// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const mongoose = require('mongoose');
const generate = require('../helpers/generate');

const userSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    password: String, // Optional cho Google users
    googleId: String, // Thêm field mới
    avatar: String,
    tokenUser: {
        type: String,
        default: generate.generaterandomString(32)
    },
    apiKey: {
        type: String,
        default: generate.generaterandomString(64)
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    status: {
        type: String,
        default: 'active'
    },
    deleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
},{
    timestamps: true
})

const User = mongoose.model('User', userSchema , 'users')

module.exports = User;
