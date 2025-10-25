const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { auth, contactAuth } = require('../middleware/auth');

const router = express.Router();

// Create emergency alert
router.post('/emergency', auth, async (req, res) => {
  try {
    const { location, message, coordinates } = req.body;
    
    const user = await User.findById(req.user._id);
    
    const alert = await Alert.create({
      userId: req.user._id,
      userName: user.name,
      userPhone: user.phone,
      type: 'emergency',
      location: location || 'Location not available',
      coordinates: coordinates || {},
      message: message || 'Emergency assistance needed',
      status: 'active'
    });

    // Get user's trusted contacts
    const contacts = await Contact.find({ userId: req.user._id });
    
    // Add contacts to notified list
    alert.trustedContactsNotified = contacts.map(contact => ({
      contactId: contact._id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      notifiedAt: new Date()
    }));
    
    await alert.save();

    res.status(201).json({
      success: true,
      alert: {
        id: alert._id,
        type: alert.type,
        location: alert.location,
        message: alert.message,
        status: alert.status,
        createdAt: alert.createdAt,
        contactsNotified: alert.trustedContactsNotified.length
      },
      message: 'Emergency alert sent successfully'
    });

  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error creating alert' 
    });
  }
});

// Get user's alerts
router.get('/my-alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Update alert status (for contacts)
router.patch('/:alertId/status', contactAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const alert = await Alert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    // Add response update
    alert.responseUpdates.push({
      contactId: req.contact._id,
      contactName: req.contact.name,
      action: 'status_update',
      status: status,
      notes: notes || `Status updated to ${status}`,
      timestamp: new Date()
    });

    if (status === 'contacted' || status === 'resolved') {
      alert.status = status;
      if (status === 'resolved') {
        alert.resolvedAt = new Date();
      }
    }

    await alert.save();

    res.json({
      success: true,
      alert: alert,
      message: `Alert status updated to ${status}`
    });

  } catch (error) {
    console.error('Update alert status error:', error);
    res.status(500).json({ message: 'Server error updating alert status' });
  }
});

// Get all alerts for contacts
router.get('/contact-auth/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find({ status: 'active' })
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Delete all alerts (for testing)
router.delete('/all', async (req, res) => {
  try {
    const result = await Alert.deleteMany({});
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} alerts`,
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

module.exports = router;