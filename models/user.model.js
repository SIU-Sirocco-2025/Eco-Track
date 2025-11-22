const mongoose = require('mongoose');
const md5 = require('md5');

const Schema = mongoose.Schema;

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

// Hash password using md5 before save if modified
UserSchema.pre('save', function (next) {
  if (this.isModified('password')) {
    this.password = md5(this.password);
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
