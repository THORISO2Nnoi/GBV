const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  type: { type: String, enum: ['counselor', 'legal', 'support', 'trusted-contact'], required: true },
  participants: [{
    userId: mongoose.Schema.Types.ObjectId,
    userType: { type: String, enum: ['user', 'contact', 'counselor', 'legal'] },
    joinedAt: { type: Date, default: Date.now },
    lastSeen: Date
  }],
  messages: [{
    senderId: mongoose.Schema.Types.ObjectId,
    senderType: { type: String, enum: ['user', 'contact', 'counselor', 'legal', 'system'], required: true },
    message: { type: String, required: true },
    messageType: { type: String, enum: ['text', 'file', 'location', 'emergency'], default: 'text' },
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    readBy: [{
      userId: mongoose.Schema.Types.ObjectId,
      readAt: { type: Date, default: Date.now }
    }],
    deleted: { type: Boolean, default: false }
  }],
  status: { type: String, enum: ['active', 'closed', 'archived'], default: 'active' },
  isAnonymous: { type: Boolean, default: true },
  encryptionKey: String,
  lastActivity: { type: Date, default: Date.now }
}, { timestamps: true });

chatSchema.index({ userId: 1, status: 1 });
chatSchema.index({ 'participants.userId': 1 });
chatSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('Chat', chatSchema);