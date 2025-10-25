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
    required: true, 
    trim: true 
  },
  phone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  relationship: { 
    type: String, 
    default: 'Trusted Contact' 
  },
  isVerified: { 
    type: Boolean, 
    default: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// Index for better query performance
contactSchema.index({ userId: 1, email: 1 });
contactSchema.index({ email: 1 });

// Password hashing middleware
contactSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastActive timestamp on save
contactSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

// Instance method to check password
contactSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to sanitize contact data for responses
contactSchema.methods.toJSON = function() {
  const contact = this.toObject();
  delete contact.password;
  delete contact.__v;
  return contact;
};

// Static method to find active contacts for a user
contactSchema.statics.findActiveByUserId = function(userId) {
  return this.find({ userId, isActive: true });
};

// Static method to find contact by email
contactSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('Contact', contactSchema);