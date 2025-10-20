const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, required: true, trim: true },
  emergencyContacts: [{
    contactId: mongoose.Schema.Types.ObjectId,
    name: String,
    phone: String,
    email: String,
    relationship: String
  }],
  safetyPlan: {
    safeWord: { type: String, default: 'bluebird' },
    safeLocations: [{
      name: String,
      address: String,
      contact: String
    }],
    emergencyProtocol: String
  },
  profile: {
    avatar: String,
    emergencySettings: {
      autoShareLocation: { type: Boolean, default: true },
      notifyAllContacts: { type: Boolean, default: true }
    }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);