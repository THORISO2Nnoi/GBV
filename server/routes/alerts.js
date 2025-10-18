const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');

const router = express.Router();

// Create emergency alert
router.post('/emergency', async (req, res) => {
  try {
    const { location, message } = req.body;
    
    // For demo, we'll create an alert without auth
    const user = await User.findOne(); // Get any user for demo
    
    if (!user) {
      return res.status(400).json({ message: 'No users found. Please register first.' });
    }

    const alert = await Alert.create({
      userId: user._id,
      type: 'emergency',
      location: location || 'Location not specified',
      message: message || 'Emergency assistance needed',
      trustedContactsNotified: user.emergencyContacts || []
    });

    console.log(`Emergency alert created for user ${user.name}`);

    res.status(201).json(alert);
  } catch (error) {
    console.error('Alert creation error:', error);
    res.status(500).json({ message: 'Server error creating alert' });
  }
});

// Get user alerts
router.get('/my-alerts', async (req, res) => {
  try {
    const user = await User.findOne(); // Demo - get any user
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alerts = await Alert.find({ userId: user._id })
      .sort({ createdAt: -1 });
    
    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Update alert status
router.patch('/:alertId/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.alertId,
      { 
        status,
        ...(status === 'resolved' && { resolvedAt: new Date() }),
        $push: {
          responseUpdates: {
            contactId: 'demo_contact',
            action: `Status changed to ${status}`,
            notes: notes || `Updated by trusted contact`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    res.json(alert);
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ message: 'Server error updating alert' });
  }
});

module.exports = router;