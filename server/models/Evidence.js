const mongoose = require('mongoose');
const path = require('path');

const evidenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['photo', 'document', 'audio', 'video', 'note', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000 },
  notes: { type: String, trim: true, maxlength: 5000 },
  incidentDate: { type: Date, required: true },
  location: { type: String, trim: true },
  tags: [{ type: String, trim: true }],
  filePath: { type: String },
  fileName: { type: String },
  fileSize: { type: Number },
  mimeType: { type: String },
  isEncrypted: { type: Boolean, default: false },
  encryptionKey: { type: String },
  lastAccessed: { type: Date, default: Date.now }
}, { timestamps: true });

evidenceSchema.index({ userId: 1, createdAt: -1 });
evidenceSchema.index({ userId: 1, type: 1 });
evidenceSchema.index({ userId: 1, incidentDate: -1 });

evidenceSchema.virtual('fileUrl').get(function() {
  if (this.filePath) {
    return `/uploads/evidence/${path.basename(this.filePath)}`;
  }
  return null;
});

evidenceSchema.methods.toSafeObject = function() {
  const evidence = this.toObject();
  delete evidence.encryptionKey;
  delete evidence.filePath;
  return evidence;
};

module.exports = mongoose.model('Evidence', evidenceSchema);