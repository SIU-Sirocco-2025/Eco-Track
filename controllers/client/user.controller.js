const User = require('../../models/user.model');
const md5 = require('md5')
// [GET] /login
module.exports.login = (req, res) => {
    res.render('client/pages/auth/login.pug', { title: 'Đăng nhập' });
}
// [GET] /register
module.exports.register = (req, res) => {
    res.render('client/pages/auth/register.pug', { title: 'Đăng ký' });
}
// [POST] /register
module.exports.registerPost = async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;

        // Validate input
        if (!fullName || !email || !password || !confirmPassword) {
            req.flash('error', 'Vui lòng điền đầy đủ thông tin!');
            res.redirect(req.get('Referrer') || '/');
        }

        if (password !== confirmPassword) {
            req.flash('error', 'Mật khẩu xác nhận không khớp!');
            return res.redirect(req.get('Referrer') || '/');
        }

        if (password.length < 6) {
            req.flash('error', 'Mật khẩu phải có ít nhất 6 ký tự!');
            return res.redirect(req.get('Referrer') || '/');
        }

        if (req.body.acceptTerms !== 'on') {
            req.flash('error', 'Bạn phải đồng ý với các điều khoản dịch vụ!');
            return res.redirect(req.get('Referrer') || '/');
        }

        // Check if email already exists
        const existingUser = await User.findOne({
            email: email,
            deleted: false
        });

        if (existingUser) {
            req.flash('error', 'Email đã được sử dụng!');
            return res.redirect(req.get('Referrer') || '/');
        }

        // Create new user
        const newUser = new User({
            fullName: fullName,
            email: email,
            password: md5(password)
        });

        await newUser.save();

        req.flash('success', 'Đăng ký tài khoản thành công!');
        res.redirect('/auth/login');

    } catch (error) {
        console.error('Register error:', error);
        req.flash('error', 'Có lỗi xảy ra, vui lòng thử lại!');
        res.redirect(req.get('Referrer') || '/');
    }
}

// [POST] /login
module.exports.loginPost = async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password) {
            req.flash('error', 'Vui lòng nhập email và mật khẩu!');
            return res.redirect(req.get('Referrer') || '/auth/login');
        }

        const user = await User.findOne({
            email: email,
            deleted: false
        }).lean();

        if (!user) {
            req.flash('error', 'Email không tồn tại hoặc đã bị khóa!');
            return res.redirect(req.get('Referrer') || '/auth/login');
        }

        if (user.password !== md5(password)) {
            req.flash('error', 'Mật khẩu không đúng!');
            return res.redirect(req.get('Referrer') || '/auth/login');
        }

        // (Tuỳ chọn) kiểm tra trạng thái nếu có trường status
        if (user.status && user.status !== 'active') {
            req.flash('error', 'Tài khoản chưa được kích hoạt!');
            return res.redirect(req.get('Referrer') || '/auth/login');
        }

        // Lưu thông tin cơ bản vào session
        req.session.user = {
            _id: user._id,
            fullName: user.fullName,
            email: user.email
        };

        // Remember -> kéo dài phiên
        if (remember === 'on') {
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 ngày
        }

        req.flash('success', 'Đăng nhập thành công!');
        return res.redirect('/'); // điều hướng sau đăng nhập

    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'Có lỗi xảy ra, vui lòng thử lại!');
        return res.redirect(req.get('Referrer') || '/auth/login');
    }
}

// [GET] /logout
module.exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
};

module.exports.settings = async (req, res) => {
  if (!req.session?.user?._id) {
    req.flash('error', 'Bạn cần đăng nhập!');
    return res.redirect('/auth/login');
  }
  try {
    const user = await User.findById(req.session.user._id)
      .select('fullName email apiKey')
      .lean();

    if (!user) {
      req.flash('error', 'Tài khoản không tồn tại!');
      return res.redirect('/auth/login');
    }

    // Render với dữ liệu mới nhất (ghi đè currentUser nếu middleware có set cũ)
    return res.render('client/pages/auth/settings.pug', {
      title: 'Cài đặt tài khoản',
      currentUser: user
    });
  } catch (err) {
    console.error('Settings error:', err.message);
    req.flash('error', 'Không tải được thông tin tài khoản!');
    return res.redirect('/');
  }
};

// [POST] /auth/settings/profile
module.exports.updateProfile = async (req, res) => {
  if (!req.session?.user?._id) {
    req.flash('error', 'Bạn cần đăng nhập!');
    return res.redirect('/auth/login');
  }
  try {
    const { fullName, email } = req.body;
    if (!fullName || !email) {
      req.flash('error', 'Thiếu họ tên hoặc email!');
      return res.redirect('/auth/settings');
    }

    // Email đã dùng bởi user khác?
    const exists = await User.findOne({
      _id: { $ne: req.session.user._id },
      email,
      deleted: false
    }).lean();
    if (exists) {
      req.flash('error', 'Email đã được sử dụng bởi tài khoản khác!');
      return res.redirect('/auth/settings');
    }

    const updated = await User.findByIdAndUpdate(
      req.session.user._id,
      { fullName, email },
      { new: true }
    ).lean();

    if (!updated) {
      req.flash('error', 'Không tìm thấy tài khoản!');
      return res.redirect('/auth/settings');
    }

    // Cập nhật lại session
    req.session.user.fullName = updated.fullName;
    req.session.user.email = updated.email;

    req.flash('success', 'Cập nhật thông tin thành công!');
    return res.redirect('/auth/settings');
  } catch (e) {
    console.error('Update profile error:', e);
    req.flash('error', 'Có lỗi xảy ra khi cập nhật!');
    return res.redirect('/auth/settings');
  }
};

// [POST] /auth/settings/password
module.exports.updatePassword = async (req, res) => {
  if (!req.session?.user?._id) {
    req.flash('error', 'Bạn cần đăng nhập!');
    return res.redirect('/auth/login');
  }
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash('error', 'Vui lòng nhập đầy đủ các trường mật khẩu!');
      return res.redirect('/auth/settings');
    }
    if (newPassword !== confirmPassword) {
      req.flash('error', 'Xác nhận mật khẩu mới không khớp!');
      return res.redirect('/auth/settings');
    }
    if (newPassword.length < 6) {
      req.flash('error', 'Mật khẩu mới phải >= 6 ký tự!');
      return res.redirect('/auth/settings');
    }

    const user = await User.findById(req.session.user._id).lean();
    if (!user) {
      req.flash('error', 'Không tìm thấy tài khoản!');
      return res.redirect('/auth/settings');
    }
    if (user.password !== md5(currentPassword)) {
      req.flash('error', 'Mật khẩu hiện tại không đúng!');
      return res.redirect('/auth/settings');
    }

    await User.findByIdAndUpdate(user._id, { password: md5(newPassword) });
    req.flash('success', 'Đổi mật khẩu thành công!');
    return res.redirect('/auth/settings');
  } catch (e) {
    console.error('Update password error:', e);
    req.flash('error', 'Có lỗi xảy ra khi đổi mật khẩu!');
    return res.redirect('/auth/settings');
  }
};