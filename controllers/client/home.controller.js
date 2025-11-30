// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const models = require('../../models');
// [GET] /
module.exports.index = async (req, res) => {
    try {
        const latestCity = await models.HCMCReading
            .findOne()
            .sort({ 'current.pollution.ts': -1 })
            .lean();

        const reading = latestCity ? {
            ts: latestCity.current?.pollution?.ts,
            aqius: latestCity.current?.pollution?.aqius,
            tp: latestCity.current?.weather?.tp,
            hu: latestCity.current?.weather?.hu,
            ws: latestCity.current?.weather?.ws
        } : null;

        res.render('client/pages/home/index', { title: 'Eco Track - Home', reading });
    } catch (e) {
        res.render('client/pages/home/index', { title: 'Eco Track - Home', reading: null });
    }
}
// [GET] /about
module.exports.about = (req, res) => {
    res.render('client/pages/home/about', { title: 'About Us' });
}
