const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['student', 'teacher']
  },
  stats: {
        points: { type: Number, default: 0 },
        streak: { type: Number, default: 0 }
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
