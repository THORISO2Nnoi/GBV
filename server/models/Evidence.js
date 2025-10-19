const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['photo', 'document', 'audio', 'video', 'note', 'other']
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  incidentDate: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  // File storage fields
  filePath: {
    type: String
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  mimeType: {
    type: String
  },
  // Security fields
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: {
    type: String
  },
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
evidenceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
evidenceSchema.index({ userId: 1, createdAt: -1 });
evidenceSchema.index({ userId: 1, type: 1 });
evidenceSchema.index({ userId: 1, incidentDate: -1 });

// Virtual for file URL
evidenceSchema.virtual('fileUrl').get(function() {
  if (this.filePath) {
    return `/api/evidence/file/${this._id}`;
  }
  return null;
});

// Method to get safe data (exclude sensitive fields)
evidenceSchema.methods.toSafeObject = function() {
  const evidence = this.toObject();
  delete evidence.encryptionKey;
  delete evidence.filePath;
  return evidence;
};

module.exports = mongoose.model('Evidence', evidenceSchema);