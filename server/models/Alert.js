const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['emergency', 'check-in', 'safety'],
    default: 'emergency'
  },
  location: {
    type: String,
    default: 'Location not specified'
  },
  message: {
    type: String,
    default: 'Emergency assistance needed'
  },
  status: {
    type: String,
    enum: ['active', 'responded', 'resolved', 'cancelled'],
    default: 'active'
  },
  trustedContactsNotified: [{
    contactId: mongoose.Schema.Types.ObjectId,
    notifiedAt: { type: Date, default: Date.now },
    responded: { type: Boolean, default: false }
  }],
  authoritiesNotified: {
    type: Boolean,
    default: false
  },
  responseUpdates: [{
    contactId: mongoose.Schema.Types.ObjectId,
    action: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  resolvedAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Alert', alertSchema);