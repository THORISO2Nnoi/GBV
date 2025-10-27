const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  userEmail: { type: String, required: true },
  type: { type: String, enum: ['emergency', 'check-in', 'safety'], default: 'emergency' },
  emergencyType: { type: String, default: 'general' },
  location: { type: String, default: 'Location not specified' },
  coordinates: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  message: { type: String, default: 'Emergency assistance needed' },
  status: { type: String, enum: ['active', 'contacted', 'resolved', 'cancelled'], default: 'active' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'high' },
  
  // NEW: Track button press count and timing
  pressCount: { type: Number, default: 1 },
  lastPressTime: { type: Date, default: Date.now },
  alertLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  
  trustedContactsNotified: [{
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    name: String,
    email: String,
    phone: String,
    relationship: String,
    notifiedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' },
    respondedAt: Date,
    responseStatus: String
  }],
  
  responseUpdates: [{
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    contactName: String,
    action: String,
    previousStatus: String,
    newStatus: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  
  authoritiesNotified: {
    police: { type: Boolean, default: false },
    ambulance: { type: Boolean, default: false },
    gbvHelpline: { type: Boolean, default: false }
  },
  
  resolvedAt: Date,
  cancellationReason: String
}, { 
  timestamps: true 
});

// Method to update press count and alert level
alertSchema.methods.updatePressCount = function() {
  const now = new Date();
  const timeSinceLastPress = now - this.lastPressTime;
  
  // Reset count if more than 2 minutes since last press
  if (timeSinceLastPress > 120000) {
    this.pressCount = 1;
  } else {
    this.pressCount += 1;
  }
  
  this.lastPressTime = now;
  
  // Determine alert level based on press count
  if (this.pressCount >= 5) {
    this.alertLevel = 'critical';
    this.priority = 'high';
  } else if (this.pressCount >= 3) {
    this.alertLevel = 'high';
    this.priority = 'high';
  } else if (this.pressCount >= 2) {
    this.alertLevel = 'medium';
    this.priority = 'medium';
  } else {
    this.alertLevel = 'low';
    this.priority = 'low';
  }
  
  return this.save();
};

// Static method to find active alerts by user
alertSchema.statics.findActiveByUserId = function(userId) {
  return this.find({ userId, status: 'active' }).sort({ createdAt: -1 });
};

// Static method to find alerts by contact (REMOVED DUPLICATE)
alertSchema.statics.findByContactId = function(contactId) {
  return this.find({ 
    'trustedContactsNotified.contactId': contactId 
  }).populate('userId', 'name phone email').sort({ createdAt: -1 });
};

// Static method to find recent alerts
alertSchema.statics.findRecent = function(userId, hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    userId,
    createdAt: { $gte: cutoffTime }
  }).sort({ createdAt: -1 });
};


module.exports = mongoose.model('Alert', alertSchema);