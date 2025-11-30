// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const User = require('../models/user.model');

module.exports.injectUser = (req, res, next) => {
  res.locals.currentUser = req.session?.user || null;
  next();
};

module.exports.ensureAuth = (req, res, next) => {
  if (!req.session?.user) {
    req.flash('error', 'Vui lòng đăng nhập trước!');
    return res.redirect('/auth/login');
  }
  next();
};

// Middleware xác thực API key từ header hoặc query
module.exports.validateApiKey = async (req, res, next) => {
  try {
    // Lấy API key từ header Authorization hoặc query parameter
    let apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    // Hỗ trợ Bearer token format
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }

    if (!apiKey) {
      return res.status(401).json({ 
        success: false, 
        message: 'API key is required. Please provide via x-api-key header, Authorization Bearer token, or apiKey query parameter.' 
      });
    }

    // Tìm user với API key này
    const user = await User.findOne({ 
      apiKey: apiKey,
      deleted: false,
      status: 'active'
    }).select('_id email fullName apiKey').lean();

    if (!user) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid or inactive API key.' 
      });
    }

    // Gắn thông tin user vào request để sử dụng trong controller
    req.apiUser = user;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error validating API key.',
      error: error.message 
    });
  }
};