const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  phone: {
    type: String,
    required: true
  },
  emergencyContacts: [{
    name: String,
    phone: String,
    email: String,
    relationship: String
  }],
  safetyPlan: {
    safeWord: String,
    safeLocations: [{
      name: String,
      address: String,
      contact: String
    }],
    emergencyProtocol: String
  },
  location: {
    latitude: Number,
    longitude: Number,
    lastUpdated: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('User', userSchema);