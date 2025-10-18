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
    latitude: Number,
    longitude: Number,
    address: String
  },
  message: String,
  status: {
    type: String,
    enum: ['active', 'responded', 'resolved', 'cancelled'],
    default: 'active'
  },
  trustedContactsNotified: [{
    contactId: mongoose.Schema.Types.ObjectId,
    notifiedAt: Date,
    responded: Boolean
  }],
  authoritiesNotified: {
    type: Boolean,
    default: false
  },
  responseUpdates: [{
    contactId: mongoose.Schema.Types.ObjectId,
    action: String,
    timestamp: Date,
    notes: String
  }],
  resolvedAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Alert', alertSchema);