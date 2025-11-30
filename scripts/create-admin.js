// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.

require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('../models/account.model');
const md5 = require('md5');

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('✓ Connected to database');

        const email = 'admin@ecotrack.com';
        const password = 'admin123'; // Đổi mật khẩu này

        // Kiểm tra đã tồn tại chưa
        const existingAdmin = await Account.findOne({ email });
        if (existingAdmin) {
            console.log('⚠️  Admin account already exists!');
            process.exit(0);
        }

        // Tạo admin mới
        const admin = new Account({
            fullName: 'Administrator',
            email: email,
            password: md5(password),
            role: 'admin',
            status: 'active'
        });

        await admin.save();
        console.log('✓ Admin account created successfully!');
        console.log(`  Email: ${email}`);
        console.log(`  Password: ${password}`);
        console.log('\n⚠️  PLEASE CHANGE THE PASSWORD AFTER FIRST LOGIN!');

        process.exit(0);
    } catch (error) {
        console.error('✗ Error:', error);
        process.exit(1);
    }
}

createAdmin();