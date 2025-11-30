// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
module.exports.requireAuth = (req, res, next) => {
    if (!req.session?.adminUser) {
        req.flash('error', 'Vui lòng đăng nhập để tiếp tục!');
        return res.redirect(req.app.locals.prefixAdmin + '/auth/login');
    }
    
    // Inject adminUser vào res.locals để dùng trong views
    res.locals.adminUser = req.session.adminUser;
    next();
};

module.exports.injectAdminUser = (req, res, next) => {
    res.locals.adminUser = req.session?.adminUser || null;
    next();
};