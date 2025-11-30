// © 2025 SIU_Sirocco – Phát hành theo GPL-3.0
// This file is part of Eco-Track.
// Eco-Track is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License.
// Eco-Track is distributed WITHOUT ANY WARRANTY; see LICENSE for details.
// See LICENSE in the project root for full license text.
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/user.controller');
const { ensureAuth } = require('../../middlewares/auth.middleware');
router.get('/login', controller.login);

router.post('/login', controller.loginPost);

// Google OAuth routes
router.get('/google', controller.googleAuth);
router.get('/google/callback', controller.googleAuthCallback);


router.get('/register', controller.register);
router.post('/register/send-otp', controller.sendRegisterOTP);
router.post('/register', controller.registerPost);

router.get('/logout', controller.logout);


router.get('/settings', ensureAuth, controller.settings);
router.post('/settings/profile', ensureAuth, controller.updateProfile);
router.post('/settings/password', ensureAuth, controller.updatePassword);


// Forgot password + OTP
router.get('/forgot-password', controller.forgotPassword);
router.post('/forgot-password', controller.forgotPasswordPost);
router.get('/otp', controller.otp);
router.post('/otp', controller.verifyOtpAndReset);

// API Key management
router.get('/api-key', ensureAuth, controller.getApiKey);
router.post('/api-key/regenerate', ensureAuth, controller.regenerateApiKey);

module.exports = router;