const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Evidence = require('../models/Evidence');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const evidenceDir = path.join(__dirname, '../../public/uploads/evidence');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, evidenceDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'evidence-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp3|m4a|wav|mp4|avi|mov|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, documents, audio, and video files are allowed'));
    }
  }
});

// Create evidence
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    const {
      type,
      title,
      description,
      notes,
      incidentDate,
      location,
      tags
    } = req.body;

    if (!type || !title || !incidentDate) {
      return res.status(400).json({ 
        success: false,
        message: 'Type, title, and incident date are required' 
      });
    }

    const evidenceData = {
      userId: req.user._id,
      type,
      title,
      description: description || title,
      notes: notes || '',
      incidentDate: new Date(incidentDate),
      location: location || '',
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      isEncrypted: true
    };

    if (req.file) {
      evidenceData.filePath = req.file.path;
      evidenceData.fileName = req.file.originalname;
      evidenceData.fileSize = req.file.size;
      evidenceData.mimeType = req.file.mimetype;
    }

    const evidence = await Evidence.create(evidenceData);

    res.status(201).json({
      success: true,
      message: 'Evidence saved securely',
      evidence: evidence.toSafeObject()
    });

  } catch (error) {
    console.error('Evidence creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error saving evidence' 
    });
  }
});

// Get all evidence for user
router.get('/', auth, async (req, res) => {
  try {
    const { type, search, sortBy = 'incidentDate', order = 'desc' } = req.query;
    
    const filter = { userId: req.user._id };
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (search && search.trim() !== '') {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    const sortField = sortBy === 'createdAt' ? 'createdAt' : 'incidentDate';
    sortOptions[sortField] = order === 'desc' ? -1 : 1;

    const evidence = await Evidence.find(filter)
      .select('-filePath -encryptionKey')
      .sort(sortOptions)
      .limit(50);

    const evidenceWithUrls = evidence.map(item => {
      const evidenceObj = item.toObject();
      if (evidenceObj.fileName) {
        evidenceObj.fileUrl = `/uploads/evidence/${path.basename(item.filePath)}`;
      }
      return evidenceObj;
    });

    res.json({
      success: true,
      evidence: evidenceWithUrls,
      totalEvidence: evidence.length
    });

  } catch (error) {
    console.error('Get evidence error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching evidence' 
    });
  }
});

// Get single evidence item
router.get('/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    evidence.lastAccessed = new Date();
    await evidence.save();

    const evidenceObj = evidence.toSafeObject();
    if (evidence.fileName) {
      evidenceObj.fileUrl = `/uploads/evidence/${path.basename(evidence.filePath)}`;
    }

    res.json({
      success: true,
      evidence: evidenceObj
    });

  } catch (error) {
    console.error('Get evidence detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching evidence details'
    });
  }
});

// Delete evidence
router.delete('/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    if (evidence.filePath && fs.existsSync(evidence.filePath)) {
      fs.unlinkSync(evidence.filePath);
    }

    await Evidence.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Evidence deleted successfully'
    });

  } catch (error) {
    console.error('Delete evidence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting evidence'
    });
  }
});

module.exports = router;