const express = require('express');
const router = express.Router();
const Evidence = require('../models/Evidence');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/evidence/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp3|m4a|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, documents, and audio files are allowed'));
    }
  }
});

// @route   POST /api/evidence
// @desc    Create new evidence
// @access  Private
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

    // Validate required fields
    if (!type || !title || !incidentDate) {
      return res.status(400).json({ 
        error: 'Type, title, and incident date are required' 
      });
    }

    const evidenceData = {
      userId: req.user.id,
      type,
      title,
      description: description || title,
      notes: notes || '',
      incidentDate: new Date(incidentDate),
      location: location || '',
      tags: tags ? tags.split(',') : [],
      filePath: req.file ? req.file.path : null,
      fileName: req.file ? req.file.originalname : null,
      fileSize: req.file ? req.file.size : null,
      mimeType: req.file ? req.file.mimetype : null
    };

    const evidence = new Evidence(evidenceData);
    await evidence.save();

    // Populate user data for response
    await evidence.populate('userId', 'name email');

    res.status(201).json({
      message: 'Evidence saved successfully',
      evidence: evidence
    });

  } catch (error) {
    console.error('Evidence creation error:', error);
    res.status(500).json({ 
      error: 'Server error: ' + error.message 
    });
  }
});

// @route   GET /api/evidence
// @desc    Get all evidence for user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, type, sortBy = 'incidentDate', order = 'desc' } = req.query;
    
    const filter = { userId: req.user.id };
    if (type && type !== 'all') {
      filter.type = type;
    }

    const sortOptions = {};
    sortOptions[sortBy] = order === 'desc' ? -1 : 1;

    const evidence = await Evidence.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'name email');

    const total = await Evidence.countDocuments(filter);

    res.json({
      evidence,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalEvidence: total
    });

  } catch (error) {
    console.error('Evidence fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/evidence/:id
// @desc    Get single evidence item
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('userId', 'name email');

    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    res.json(evidence);

  } catch (error) {
    console.error('Evidence fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/evidence/:id
// @desc    Update evidence item
// @access  Private
router.put('/:id', auth, upload.single('file'), async (req, res) => {
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

    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    // Update fields
    if (type) evidence.type = type;
    if (title) evidence.title = title;
    if (description) evidence.description = description;
    if (notes !== undefined) evidence.notes = notes;
    if (incidentDate) evidence.incidentDate = new Date(incidentDate);
    if (location !== undefined) evidence.location = location;
    if (tags) evidence.tags = tags.split(',');

    // Handle file update
    if (req.file) {
      evidence.filePath = req.file.path;
      evidence.fileName = req.file.originalname;
      evidence.fileSize = req.file.size;
      evidence.mimeType = req.file.mimetype;
    }

    evidence.updatedAt = new Date();

    await evidence.save();
    await evidence.populate('userId', 'name email');

    res.json({
      message: 'Evidence updated successfully',
      evidence: evidence
    });

  } catch (error) {
    console.error('Evidence update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/evidence/:id
// @desc    Delete evidence item
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    res.json({ message: 'Evidence deleted successfully' });

  } catch (error) {
    console.error('Evidence deletion error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/evidence/stats/summary
// @desc    Get evidence statistics
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalEvidence = await Evidence.countDocuments({ userId: req.user.id });
    
    const evidenceByType = await Evidence.aggregate([
      { $match: { userId: req.user.id } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const recentEvidence = await Evidence.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title type incidentDate createdAt');

    res.json({
      totalEvidence,
      evidenceByType,
      recentEvidence
    });

  } catch (error) {
    console.error('Evidence stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/evidence/file/:id
// @desc    Serve evidence file
// @access  Private
router.get('/file/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!evidence || !evidence.filePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(path.resolve(evidence.filePath));

  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;