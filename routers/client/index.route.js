// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const homeRoute = require('./home.route');
const aqiRoute = require('./aqi.route');
const userRoute = require('./user.route');
const docsRoute = require('./docs.route');
const ticketRoute = require('./ticket.route');

module.exports = (app) => {
    app.use('/', homeRoute);
    app.use('/aqi', aqiRoute);
    app.use('/auth', userRoute);
    app.use('/api/docs', docsRoute);
    app.use('/ticket', ticketRoute);
};
