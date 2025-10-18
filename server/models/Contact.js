const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  relationship: String,
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

contactSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

contactSchema.methods.correctPassword = async function(candidatePassword, contactPassword) {
  return await bcrypt.compare(candidatePassword, contactPassword);
};

module.exports = mongoose.model('Contact', contactSchema);