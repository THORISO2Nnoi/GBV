const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { auth, contactAuth } = require('../middleware/auth');

const router = express.Router();

// Create emergency alert
router.post('/emergency', auth, async (req, res) => {
  try {
    const { location, message, coordinates, emergencyType } = req.body;
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Create the alert
    const alert = await Alert.create({
      userId: req.user._id,
      userName: user.name,
      userPhone: user.phone,
      userEmail: user.email,
      type: 'emergency',
      emergencyType: emergencyType || 'general',
      location: location || 'Location not available',
      coordinates: coordinates || {},
      message: message || 'Emergency assistance needed',
      status: 'active',
      priority: 'high'
    });

    // Get user's active trusted contacts
    const contacts = await Contact.find({ 
      userId: req.user._id, 
      isActive: true 
    });
    
    // Add contacts to notified list
    alert.trustedContactsNotified = contacts.map(contact => ({
      contactId: contact._id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      relationship: contact.relationship,
      notifiedAt: new Date(),
      status: 'pending'
    }));
    
    await alert.save();

    // Populate the alert for response
    const populatedAlert = await Alert.findById(alert._id)
      .populate('userId', 'name phone email');

    // Emit socket event to notify all contacts
    const io = req.app.get('io');
    if (io) {
      // Notify each contact individually
      contacts.forEach(contact => {
        io.to(contact._id.toString()).emit('new-alert', {
          alertId: alert._id,
          userId: user._id,
          userName: user.name,
          userPhone: user.phone,
          location: alert.location,
          message: alert.message,
          emergencyType: alert.emergencyType,
          createdAt: alert.createdAt,
          type: 'emergency'
        });
      });

      // Also broadcast to all connected contacts for this user
      io.emit('new-alert-broadcast', {
        alertId: alert._id,
        userId: user._id,
        userName: user.name,
        userPhone: user.phone,
        location: alert.location,
        message: alert.message,
        emergencyType: alert.emergencyType,
        createdAt: alert.createdAt,
        contactsNotified: contacts.length
      });
    }

    res.status(201).json({
      success: true,
      alert: {
        id: alert._id,
        type: alert.type,
        emergencyType: alert.emergencyType,
        location: alert.location,
        message: alert.message,
        status: alert.status,
        createdAt: alert.createdAt,
        contactsNotified: alert.trustedContactsNotified.length
      },
      message: 'Emergency alert sent successfully to trusted contacts'
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
    const { limit = 20, page = 1, status } = req.query;
    const skip = (page - 1) * limit;

    let query = { userId: req.user._id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('responseUpdates.contactId', 'name phone');

    const totalAlerts = await Alert.countDocuments(query);
    const activeAlerts = await Alert.countDocuments({ 
      userId: req.user._id, 
      status: 'active' 
    });

    res.json({
      success: true,
      alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalAlerts,
        pages: Math.ceil(totalAlerts / limit)
      },
      stats: {
        total: totalAlerts,
        active: activeAlerts,
        resolved: totalAlerts - activeAlerts
      }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alerts' 
    });
  }
});

// Get specific alert
router.get('/:alertId', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId)
      .populate('userId', 'name phone email')
      .populate('responseUpdates.contactId', 'name phone email relationship')
      .populate('trustedContactsNotified.contactId', 'name phone email relationship');

    if (!alert) {
      return res.status(404).json({ 
        success: false,
        message: 'Alert not found' 
      });
    }

    // Check if user owns this alert or is a trusted contact
    if (alert.userId._id.toString() !== req.user._id.toString()) {
      const contact = await Contact.findOne({ 
        userId: alert.userId, 
        _id: req.user._id 
      });
      if (!contact) {
        return res.status(403).json({ 
          success: false,
          message: 'Access denied' 
        });
      }
    }

    res.json({
      success: true,
      alert
    });

  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alert' 
    });
  }
});

// Update alert status (for contacts)
router.patch('/:alertId/status', contactAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { alertId } = req.params;
    
    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: 'Status is required' 
      });
    }

    const validStatuses = ['active', 'contacted', 'resolved', 'false_alarm'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ 
        success: false,
        message: 'Alert not found' 
      });
    }

    // Verify the contact has access to this alert
    const contact = await Contact.findById(req.contact._id);
    if (!contact || contact.userId.toString() !== alert.userId.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized to update this alert' 
      });
    }

    const previousStatus = alert.status;

    // Add response update
    const responseUpdate = {
      contactId: req.contact._id,
      contactName: req.contact.name,
      action: 'status_update',
      previousStatus: previousStatus,
      newStatus: status,
      notes: notes || `Status updated to ${status} by ${req.contact.name}`,
      timestamp: new Date()
    };

    alert.responseUpdates.push(responseUpdate);

    // Update alert status based on the new status
    if (status === 'contacted' || status === 'resolved' || status === 'false_alarm') {
      alert.status = status;
      if (status === 'resolved') {
        alert.resolvedAt = new Date();
      }
    }

    // Update contact notification status
    const contactNotification = alert.trustedContactsNotified.find(
      notification => notification.contactId.toString() === req.contact._id.toString()
    );
    
    if (contactNotification) {
      contactNotification.status = 'responded';
      contactNotification.respondedAt = new Date();
      contactNotification.responseStatus = status;
    }

    await alert.save();

    // Populate for response
    const updatedAlert = await Alert.findById(alertId)
      .populate('userId', 'name phone email')
      .populate('responseUpdates.contactId', 'name phone');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Notify the user who created the alert
      io.to(alert.userId.toString()).emit('alert-status-update', {
        alertId: alert._id,
        status: status,
        contactName: req.contact.name,
        contactId: req.contact._id,
        previousStatus: previousStatus,
        timestamp: new Date(),
        message: `${req.contact.name} marked the alert as ${status}`
      });

      // Notify other contacts
      const contacts = await Contact.find({ 
        userId: alert.userId, 
        isActive: true,
        _id: { $ne: req.contact._id }
      });
      
      contacts.forEach(contact => {
        io.to(contact._id.toString()).emit('alert-status-update', {
          alertId: alert._id,
          status: status,
          contactName: req.contact.name,
          timestamp: new Date(),
          message: `${req.contact.name} marked the alert as ${status}`
        });
      });
    }

    res.json({
      success: true,
      alert: updatedAlert,
      responseUpdate: responseUpdate,
      message: `Alert status updated from ${previousStatus} to ${status}`
    });

  } catch (error) {
    console.error('Update alert status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error updating alert status' 
    });
  }
});

// Get all active alerts for contacts (contact auth required)
router.get('/contact-auth/alerts', contactAuth, async (req, res) => {
  try {
    const { status = 'active', limit = 50 } = req.query;

    // Get the contact to find which user they belong to
    const contact = await Contact.findById(req.contact._id);
    if (!contact) {
      return res.status(404).json({ 
        success: false,
        message: 'Contact not found' 
      });
    }

    let query = { userId: contact.userId };
    if (status !== 'all') {
      query.status = status;
    }

    const alerts = await Alert.find(query)
      .populate('userId', 'name phone email')
      .populate('responseUpdates.contactId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Update contact's last active timestamp
    contact.lastActive = new Date();
    await contact.save();

    res.json({
      success: true,
      alerts,
      stats: {
        total: alerts.length,
        active: alerts.filter(a => a.status === 'active').length,
        contacted: alerts.filter(a => a.status === 'contacted').length,
        resolved: alerts.filter(a => a.status === 'resolved').length
      }
    });

  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alerts' 
    });
  }
});

// Get alerts for specific contact (contact auth)
router.get('/contact/my-alerts', contactAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.contact._id);
    if (!contact) {
      return res.status(404).json({ 
        success: false,
        message: 'Contact not found' 
      });
    }

    const alerts = await Alert.find({ userId: contact.userId })
      .populate('userId', 'name phone email')
      .populate('responseUpdates.contactId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(20);

    // Calculate response statistics for this contact
    const contactResponseStats = {
      totalAlerts: alerts.length,
      respondedAlerts: alerts.filter(alert => 
        alert.responseUpdates.some(update => 
          update.contactId && update.contactId._id.toString() === req.contact._id.toString()
        )
      ).length,
      activeAlerts: alerts.filter(alert => alert.status === 'active').length
    };

    contactResponseStats.responseRate = contactResponseStats.totalAlerts > 0 
      ? Math.round((contactResponseStats.respondedAlerts / contactResponseStats.totalAlerts) * 100)
      : 0;

    res.json({
      success: true,
      alerts,
      stats: contactResponseStats,
      user: {
        name: contact.userName,
        phone: contact.userPhone
      }
    });

  } catch (error) {
    console.error('Get contact my-alerts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alerts' 
    });
  }
});

// Resolve alert (user only)
router.patch('/:alertId/resolve', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);
    
    if (!alert) {
      return res.status(404).json({ 
        success: false,
        message: 'Alert not found' 
      });
    }

    if (alert.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized to resolve this alert' 
      });
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    
    // Add resolution note
    alert.responseUpdates.push({
      action: 'resolved_by_user',
      notes: 'Alert resolved by user',
      timestamp: new Date()
    });

    await alert.save();

    // Notify contacts about resolution
    const io = req.app.get('io');
    if (io) {
      const contacts = await Contact.find({ userId: req.user._id, isActive: true });
      contacts.forEach(contact => {
        io.to(contact._id.toString()).emit('alert-status-update', {
          alertId: alert._id,
          status: 'resolved',
          message: 'Alert resolved by user',
          timestamp: new Date()
        });
      });
    }

    res.json({
      success: true,
      alert,
      message: 'Alert resolved successfully'
    });

  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error resolving alert' 
    });
  }
});

// Delete alert (user only)
router.delete('/:alertId', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);
    
    if (!alert) {
      return res.status(404).json({ 
        success: false,
        message: 'Alert not found' 
      });
    }

    if (alert.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized to delete this alert' 
      });
    }

    await Alert.findByIdAndDelete(req.params.alertId);

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    console.error('Delete alert error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error deleting alert' 
    });
  }
});

// Delete all alerts (for testing - protect in production)
router.delete('/all', async (req, res) => {
  try {
    // Add protection for production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ 
        success: false,
        message: 'This action is not allowed in production' 
      });
    }

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

// Get alert statistics
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalAlerts = await Alert.countDocuments({ userId: req.user._id });
    const activeAlerts = await Alert.countDocuments({ 
      userId: req.user._id, 
      status: 'active' 
    });
    const resolvedAlerts = await Alert.countDocuments({ 
      userId: req.user._id, 
      status: 'resolved' 
    });
    const contactedAlerts = await Alert.countDocuments({ 
      userId: req.user._id, 
      status: 'contacted' 
    });

    // Calculate average response time
    const alertsWithResponse = await Alert.find({
      userId: req.user._id,
      'responseUpdates.0': { $exists: true }
    });

    let totalResponseTime = 0;
    let respondedAlertsCount = 0;

    alertsWithResponse.forEach(alert => {
      const firstResponse = alert.responseUpdates[0];
      if (firstResponse && firstResponse.timestamp) {
        const responseTime = new Date(firstResponse.timestamp) - new Date(alert.createdAt);
        totalResponseTime += responseTime;
        respondedAlertsCount++;
      }
    });

    const avgResponseTime = respondedAlertsCount > 0 
      ? Math.round(totalResponseTime / respondedAlertsCount / 1000 / 60) // Convert to minutes
      : 0;

    res.json({
      success: true,
      stats: {
        total: totalAlerts,
        active: activeAlerts,
        resolved: resolvedAlerts,
        contacted: contactedAlerts,
        avgResponseTime: `${avgResponseTime} minutes`,
        responseRate: totalAlerts > 0 ? Math.round((respondedAlertsCount / totalAlerts) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Get alert stats error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alert statistics' 
    });
  }
});

module.exports = router;