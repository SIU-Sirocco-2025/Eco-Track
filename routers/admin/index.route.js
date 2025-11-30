// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const dashboardRoute = require('./dashboard.route');
const aqiRoute = require('./aqi.route');
const weatherRoute = require('./weather.route');
const usersRoute = require('./users.route');
const userRoute = require('./user.route');
const settingsRoute = require('./settings.route');
const authRoute = require('./auth.route')
const ticketRoute = require('./ticket.route');
const { requireAuth } = require('../../middlewares/admin.middleware');

module.exports = (app) => {
    const PATH_ADMIN = app.locals.prefixAdmin;
    
    // Route không cần auth
    app.use(PATH_ADMIN + '/auth', authRoute);
    
    // Áp dụng middleware cho các route cần auth
    app.use(PATH_ADMIN + '/dashboard', requireAuth, dashboardRoute);
    app.use(PATH_ADMIN + '/aqi', requireAuth, aqiRoute);
    app.use(PATH_ADMIN + '/weather', requireAuth, weatherRoute);
    app.use(PATH_ADMIN + '/users', requireAuth, usersRoute);
    app.use(PATH_ADMIN + '/user', requireAuth, userRoute);

    app.use(PATH_ADMIN + '/settings', requireAuth, settingsRoute);
    app.use(PATH_ADMIN + '/tickets', requireAuth, ticketRoute);

};
