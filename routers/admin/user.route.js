// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/user.controller');

// Views
router.get('/', controller.index);

// APIs
router.get('/api/list', controller.getList);
router.post('/api/create', controller.create);
router.patch('/api/reset-password/:id', controller.resetPassword);
router.delete('/api/delete/:id', controller.remove);

module.exports = router;
