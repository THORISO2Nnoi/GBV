const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');

const router = express.Router();

// Create emergency alert (simple version)
router.post('/emergency', async (req, res) => {
  try {
    const { location, message } = req.body;
    
    const user = await User.findOne();
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'No users found. Please register first.' 
      });
    }

    const alert = await Alert.create({
      userId: user._id,
      type: 'emergency',
      location: location || 'Location not specified',
      message: message || 'Emergency assistance needed'
    });

    res.status(201).json({
      success: true,
      alert,
      message: 'Emergency alert sent!'
    });
  } catch (error) {
    console.error('Alert creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error creating alert' 
    });
  }
});

// Get all alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alerts' 
    });
  }
});

// DELETE ALL ALERTS
router.delete('/all', async (req, res) => {
  try {
    const result = await Alert.deleteMany({});
    
    res.json({
      success: true,
      message: "Deleted " + result.deletedCount + " alerts",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Delete alerts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error deleting alerts' 
    });
  }
});

// Delete alerts by status
router.delete('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const result = await Alert.deleteMany({ status });
    
    res.json({
      success: true,
      message: "Deleted " + result.deletedCount + " alerts with status: " + status,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Delete alerts by status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error deleting alerts' 
    });
  }
});

module.exports = router;
