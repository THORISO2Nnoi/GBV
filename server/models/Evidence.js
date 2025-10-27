const mongoose = require('mongoose');
const path = require('path');

const evidenceSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['photo', 'document', 'audio', 'video', 'note', 'other'], 
    required: true 
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
  isEncrypted: { 
    type: Boolean, 
    default: false 
  },
  encryptionKey: { 
    type: String 
  },
  lastAccessed: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

// Index for better query performance
evidenceSchema.index({ userId: 1, createdAt: -1 });
evidenceSchema.index({ userId: 1, type: 1 });
evidenceSchema.index({ userId: 1, incidentDate: -1 });
evidenceSchema.index({ tags: 1 });

// Virtual for file URL
evidenceSchema.virtual('fileUrl').get(function() {
  if (this.filePath) {
    return `/uploads/evidence/${path.basename(this.filePath)}`;
  }
  return null;
});

// Instance method to sanitize evidence data
evidenceSchema.methods.toSafeObject = function() {
  const evidence = this.toObject();
  delete evidence.encryptionKey;
  delete evidence.filePath;
  return evidence;
};

// Static method to find evidence by user with filters
evidenceSchema.statics.findByUser = function(userId, filters = {}) {
  const query = { userId };
  
  if (filters.type && filters.type !== 'all') {
    query.type = filters.type;
  }
  
  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: 'i' } },
      { description: { $regex: filters.search, $options: 'i' } },
      { notes: { $regex: filters.search, $options: 'i' } },
      { tags: { $in: [new RegExp(filters.search, 'i')] } }
    ];
  }
  
  const sortField = filters.sortBy === 'createdAt' ? 'createdAt' : 'incidentDate';
  const sortOrder = filters.order === 'desc' ? -1 : 1;
  
  return this.find(query)
    .sort({ [sortField]: sortOrder })
    .limit(filters.limit || 50);
};

// Instance method to update last accessed
evidenceSchema.methods.updateLastAccessed = function() {
  this.lastAccessed = new Date();
  return this.save();
};

module.exports = mongoose.model('Evidence', evidenceSchema);