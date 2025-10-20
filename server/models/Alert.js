const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  type: { type: String, enum: ['emergency', 'check-in', 'safety'], default: 'emergency' },
  location: { type: String, default: 'Location not specified' },
  coordinates: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  message: { type: String, default: 'Emergency assistance needed' },
  status: { type: String, enum: ['active', 'responded', 'resolved', 'cancelled'], default: 'active' },
  trustedContactsNotified: [{
    contactId: mongoose.Schema.Types.ObjectId,
    name: String,
    email: String,
    phone: String,
    notifiedAt: { type: Date, default: Date.now },
    responded: { type: Boolean, default: false },
    responseTime: Number
  }],
  responseUpdates: [{
    contactId: mongoose.Schema.Types.ObjectId,
    contactName: String,
    action: String,
    timestamp: { type: Date, default: Date.now },
    notes: String,
    status: String
  }],
  authoritiesNotified: {
    police: { type: Boolean, default: false },
    ambulance: { type: Boolean, default: false },
    gbvHelpline: { type: Boolean, default: false }
  },
  resolvedAt: Date,
  cancellationReason: String
}, { timestamps: true });

module.exports = mongoose.model('Alert', alertSchema);