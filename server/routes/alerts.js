const express = require('express');
const Alert = require('../models/Alert');
const Contact = require('../models/Contact');
const { auth, contactAuth } = require('../middleware/auth');
const router = express.Router();

// Create emergency alert
router.post('/emergency', auth, async (req, res) => {
  try {
    const { location, coordinates, message } = req.body;
    
    const contacts = await Contact.find({ userId: req.user._id });

    const alertData = {
      userId: req.user._id,
      userName: req.user.name,
      userPhone: req.user.phone,
      type: 'emergency',
      location: location || 'Location not specified',
      coordinates: coordinates || null,
      message: message || 'Emergency assistance needed',
      trustedContactsNotified: contacts.map(contact => ({
        contactId: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        notifiedAt: new Date(),
        responded: false
      }))
    };

    const alert = await Alert.create(alertData);

    // Notify contacts via socket
    contacts.forEach(contact => {
      const alertNotification = {
        alertId: alert._id,
        userId: req.user._id,
        userName: req.user.name,
        userPhone: req.user.phone,
        location: alert.location,
        message: alert.message,
        timestamp: alert.createdAt,
        contactId: contact._id
      };

      req.io.to(`contact_${contact._id}`).emit('new-alert', alertNotification);
    });

    res.status(201).json({
      ...alert.toObject(),
      contactsNotified: contacts.length
    });
  } catch (error) {
    console.error('Alert creation error:', error);
    res.status(500).json({ message: 'Server error creating alert' });
  }
});

// Get user alerts
router.get('/my-alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Update alert status
router.patch('/:alertId/status', contactAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.alertId,
      { 
        status,
        $push: {
          responseUpdates: {
            contactId: req.contact._id,
            contactName: req.contact.name,
            action: `Status changed to ${status}`,
            notes: notes || `Updated by trusted contact`,
            timestamp: new Date(),
            status: status
          }
        }
      },
      { new: true }
    ).populate('userId', 'name phone');

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    req.io.to(`user_${alert.userId._id}`).emit('alert-status-update', {
      alertId: alert._id,
      status: status,
      contactName: req.contact.name,
      timestamp: new Date()
    });

    res.json(alert);
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ message: 'Server error updating alert' });
  }
});

// Get contact alerts
router.get('/contact-auth/alerts', contactAuth, async (req, res) => {
  try {
    const alerts = await Alert.find({ 
      'trustedContactsNotified.contactId': req.contact._id 
    })
      .populate('userId', 'name phone email')
      .sort({ createdAt: -1 });
    
    res.json(alerts);
  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

module.exports = router;