const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Create emergency alert
router.post('/emergency', auth, async (req, res) => {
  try {
    const { location, message } = req.body;
    
    const user = await User.findById(req.user.id).populate('emergencyContacts');
    
    const alert = await Alert.create({
      userId: req.user.id,
      type: 'emergency',
      location,
      message: message || 'Emergency assistance needed',
      trustedContactsNotified: user.emergencyContacts.map(contact => ({
        contactId: contact._id
      }))
    });

    // In real implementation, send SMS/email to contacts
    console.log(`Emergency alert created for user ${user.name}`);

    res.status(201).json(alert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user alerts
router.get('/my-alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('trustedContactsNotified.contactId');
    
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update alert status
router.patch('/:alertId/status', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.alertId,
      { 
        status,
        ...(status === 'resolved' && { resolvedAt: new Date() }),
        $push: {
          responseUpdates: {
            contactId: req.user.id,
            action: `Status changed to ${status}`,
            notes,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    res.json(alert);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;