const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { 
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
    required: true, 
    minlength: 6 
  },
  phone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  emergencyContacts: [{
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact'
    },
    name: String,
    phone: String,
    email: String,
    relationship: String,
    addedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  safetyPlan: {
    safeWord: { 
      type: String, 
      default: 'bluebird' 
    },
    safeLocations: [{
      name: String,
      address: String,
      contact: String,
      notes: String
    }],
    emergencyProtocol: String
  },
  profile: {
    avatar: String,
    emergencySettings: {
      autoShareLocation: { 
        type: Boolean, 
        default: true 
      },
      notifyAllContacts: { 
        type: Boolean, 
        default: true 
      },
      silentMode: {
        type: Boolean,
        default: false
      }
    }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastLogin timestamp on save if password is being set (during login)
userSchema.pre('save', function(next) {
  if (this.isModified('password')) {
    this.lastLogin = new Date();
  }
  next();
});

// Instance method to check password
userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to sanitize user data for responses
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Instance method to add emergency contact
userSchema.methods.addEmergencyContact = function(contactData) {
  this.emergencyContacts.push(contactData);
  return this.save();
};

// Instance method to remove emergency contact
userSchema.methods.removeEmergencyContact = function(contactId) {
  this.emergencyContacts = this.emergencyContacts.filter(
    contact => contact.contactId.toString() !== contactId.toString()
  );
  return this.save();
};

module.exports = mongoose.model('User', userSchema);