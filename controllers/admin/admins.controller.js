// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const Account = require('../../models/account.model');
const md5 = require('md5');

async function index(req, res) {
  try {
    res.render('admin/pages/admins/index', {
      title: 'Quản lý Admin',
    });
  } catch (err) {
    res.status(500).send('Admin page render error');
  }
}

async function getList(req, res) {
  try {
    const admins = await Account.find({}, '-password').lean().exec();
    res.json({ success: true, admins });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}


async function create(req, res) {
  try {
    const { fullName, email, password, role } = req.body;
    
    if (!fullName || !email || !password) {
      return res.json({ success: false, message: 'Họ tên, email và password bắt buộc' });
    }

    if (password.length < 6) {
      return res.json({ success: false, message: 'Password phải có ít nhất 6 ký tự' });
    }

    const existAccount = await Account.findOne({ email });
    if (existAccount) {
      return res.json({ success: false, message: 'Email đã tồn tại' });
    }

    const account = new Account({ 
      fullName, 
      email, 
      password: md5(password),
      role: role || 'admin',
      status: 'active'
    });
    await account.save();
    
    res.json({ success: true, message: 'Tạo admin thành công', account });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { id } = req.params;
    const defaultPassword = '123456';
    
    const account = await Account.findByIdAndUpdate(
      id,
      { password: md5(defaultPassword) },
      { new: true }
    ).lean().exec();

    if (!account) {
      return res.json({ success: false, message: 'Admin không tồn tại' });
    }

    res.json({ success: true, message: 'Reset password thành công. Mật khẩu mới: 123456', account });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    
    // Không cho xóa chính mình
    if (id === req.session.adminUser._id.toString()) {
      return res.json({ success: false, message: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const account = await Account.findByIdAndDelete(id).lean().exec();
    if (!account) {
      return res.json({ success: false, message: 'Admin không tồn tại' });
    }

    res.json({ success: true, message: 'Xóa admin thành công' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
}

module.exports = {
  index,
  getList,
  create,
  resetPassword,
  remove
};