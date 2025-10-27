const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');
const Contact = require('../models/Contact');
const { auth, contactAuth } = require('../middleware/auth');

const router = express.Router();

// Track recent alerts to prevent duplicates
const recentAlerts = new Map();

// Create emergency alert - FIXED WITH DUPLICATION PREVENTION AND PRESS COUNT
router.post('/emergency', auth, async (req, res) => {
  try {
    const { location, message, coordinates, emergencyType, pressCount = 1 } = req.body;
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // DUPLICATION PREVENTION: Check for recent alerts from this user
    const userId = req.user._id.toString();
    const now = Date.now();
    const lastAlertTime = recentAlerts.get(userId) || 0;
    
    // Prevent alerts within 30 seconds of each other (configurable)
    const ALERT_COOLDOWN_MS = 30000; // 30 seconds
    if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
      console.log('⚠️ Alert duplication prevented for user:', userId);
      return res.status(429).json({
        success: false,
        message: 'Please wait before sending another alert',
        retryAfter: Math.ceil((ALERT_COOLDOWN_MS - (now - lastAlertTime)) / 1000)
      });
    }
    
    // Update last alert time
    recentAlerts.set(userId, now);
    
    // Check for existing active alert to update instead of creating new one
    const existingAlert = await Alert.findOne({
      userId: req.user._id,
      status: 'active',
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // Last 10 minutes
    }).sort({ createdAt: -1 });

    let alert;
    let isUpdate = false;

    if (existingAlert) {
      // UPDATE EXISTING ALERT with new press count and urgency level
      alert = existingAlert;
      await alert.updatePressCount();
      isUpdate = true;
      
      console.log(`🔄 Updated existing alert ${alert._id} with press count: ${alert.pressCount}`);
    } else {
      // CREATE NEW ALERT
      alert = await Alert.create({
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
        priority: 'high',
        pressCount: pressCount,
        alertLevel: getAlertLevel(pressCount),
        lastPressTime: new Date()
      });
      
      console.log(`🆕 Created new alert ${alert._id} with press count: ${pressCount}`);
    }

    // Get user's active trusted contacts
    const contacts = await Contact.find({ 
      userId: req.user._id, 
      isActive: true 
    });
    
    // Add contacts to notified list (only for new alerts)
    if (!isUpdate) {
      alert.trustedContactsNotified = contacts.map(contact => ({
        contactId: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        notifiedAt: new Date(),
        status: 'pending'
      }));
    }
    
    await alert.save();

    // Populate the alert for response
    const populatedAlert = await Alert.findById(alert._id)
      .populate('userId', 'name phone email')
      .populate('trustedContactsNotified.contactId', 'name phone email relationship');

    // Emit socket event to notify all contacts
    const io = req.app.get('io');
    if (io) {
      const alertData = {
        alertId: alert._id,
        userId: user._id,
        userName: user.name,
        userPhone: user.phone,
        location: alert.location,
        message: alert.message,
        emergencyType: alert.emergencyType,
        pressCount: alert.pressCount,
        alertLevel: alert.alertLevel,
        priority: alert.priority,
        createdAt: alert.createdAt,
        type: 'emergency',
        isUpdate: isUpdate,
        urgency: getUrgencyMessage(alert.pressCount)
      };

      // Notify each contact individually
      contacts.forEach(contact => {
        io.to(contact._id.toString()).emit('new-alert', alertData);
        console.log(`📨 Sent ${isUpdate ? 'update' : 'alert'} to contact: ${contact._id}`);
      });

      // Also broadcast to all connected contacts for this user
      io.emit('new-alert-broadcast', {
        ...alertData,
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
        pressCount: alert.pressCount,
        alertLevel: alert.alertLevel,
        priority: alert.priority,
        createdAt: alert.createdAt,
        contactsNotified: alert.trustedContactsNotified.length,
        isUpdate: isUpdate,
        urgency: getUrgencyMessage(alert.pressCount)
      },
      message: isUpdate ? 
        `Emergency alert updated (Press count: ${alert.pressCount})` : 
        'Emergency alert sent successfully to trusted contacts'
    });

  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error creating alert' 
    });
  }
});

// Helper function to determine alert level based on press count
function getAlertLevel(pressCount) {
  if (pressCount >= 5) return 'critical';
  if (pressCount >= 3) return 'high';
  if (pressCount >= 2) return 'medium';
  return 'low';
}

// Helper function to get urgency message
function getUrgencyMessage(pressCount) {
  if (pressCount >= 5) return 'CRITICAL URGENCY - Multiple emergency signals detected!';
  if (pressCount >= 3) return 'HIGH URGENCY - Repeated emergency signals!';
  if (pressCount >= 2) return 'MEDIUM URGENCY - Additional emergency signal received';
  return 'Initial emergency alert';
}

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
      .populate('responseUpdates.contactId', 'name phone')
      .populate('trustedContactsNotified.contactId', 'name phone email');

    const totalAlerts = await Alert.countDocuments(query);
    const activeAlerts = await Alert.countDocuments({ 
      userId: req.user._id, 
      status: 'active' 
    });

    // Calculate statistics including press count analysis
    const totalPresses = alerts.reduce((sum, alert) => sum + (alert.pressCount || 1), 0);
    const criticalAlerts = alerts.filter(alert => alert.alertLevel === 'critical').length;

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
        resolved: totalAlerts - activeAlerts,
        totalPresses: totalPresses,
        criticalAlerts: criticalAlerts,
        avgPressesPerAlert: totalAlerts > 0 ? (totalPresses / totalAlerts).toFixed(1) : 0
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

// Update alert status (for contacts) - ENHANCED WITH PRESS COUNT AWARENESS
router.patch('/:alertId/status', contactAuth, async (req, res) => {
  try {
    const { status, notes, acknowledgePressCount } = req.body;
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

    // Include press count information in response notes
    const pressCountInfo = alert.pressCount > 1 ? 
      ` (Alert pressed ${alert.pressCount} times - ${alert.alertLevel} urgency)` : '';

    // Add response update
    const responseUpdate = {
      contactId: req.contact._id,
      contactName: req.contact.name,
      action: 'status_update',
      previousStatus: previousStatus,
      newStatus: status,
      notes: (notes || `Status updated to ${status} by ${req.contact.name}`) + pressCountInfo,
      timestamp: new Date(),
      acknowledgedPressCount: acknowledgePressCount || false
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
      contactNotification.acknowledgedPressCount = acknowledgePressCount || false;
    }

    await alert.save();

    // Populate for response
    const updatedAlert = await Alert.findById(alertId)
      .populate('userId', 'name phone email')
      .populate('responseUpdates.contactId', 'name phone');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      const updateData = {
        alertId: alert._id,
        status: status,
        contactName: req.contact.name,
        contactId: req.contact._id,
        previousStatus: previousStatus,
        timestamp: new Date(),
        message: `${req.contact.name} marked the alert as ${status}`,
        pressCount: alert.pressCount,
        alertLevel: alert.alertLevel,
        acknowledgedPressCount: acknowledgePressCount || false
      };

      // Notify the user who created the alert
      io.to(alert.userId.toString()).emit('alert-status-update', updateData);

      // Notify other contacts
      const contacts = await Contact.find({ 
        userId: alert.userId, 
        isActive: true,
        _id: { $ne: req.contact._id }
      });
      
      contacts.forEach(contact => {
        io.to(contact._id.toString()).emit('alert-status-update', updateData);
      });
    }

    res.json({
      success: true,
      alert: updatedAlert,
      responseUpdate: responseUpdate,
      pressCountInfo: alert.pressCount > 1 ? 
        `User pressed emergency button ${alert.pressCount} times (${alert.alertLevel} urgency)` : 
        'Single press alert',
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

// Get all active alerts for contacts (contact auth required) - ENHANCED WITH PRESS COUNT
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
      .populate('trustedContactsNotified.contactId', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Calculate urgency statistics
    const urgencyStats = {
      critical: alerts.filter(a => a.alertLevel === 'critical').length,
      high: alerts.filter(a => a.alertLevel === 'high').length,
      medium: alerts.filter(a => a.alertLevel === 'medium').length,
      low: alerts.filter(a => a.alertLevel === 'low').length,
      totalPresses: alerts.reduce((sum, alert) => sum + (alert.pressCount || 1), 0)
    };

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
        resolved: alerts.filter(a => a.status === 'resolved').length,
        urgency: urgencyStats
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

// Get alerts for specific contact (contact auth) - ENHANCED
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
      .populate('trustedContactsNotified.contactId', 'name phone email')
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
      activeAlerts: alerts.filter(alert => alert.status === 'active').length,
      highUrgencyAlerts: alerts.filter(alert => 
        alert.alertLevel === 'high' || alert.alertLevel === 'critical'
      ).length
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
    
    // Add resolution note with press count info
    const pressInfo = alert.pressCount > 1 ? 
      ` (Resolved after ${alert.pressCount} emergency presses)` : '';
    
    alert.responseUpdates.push({
      action: 'resolved_by_user',
      notes: 'Alert resolved by user' + pressInfo,
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
          timestamp: new Date(),
          pressCount: alert.pressCount
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

// Quick emergency endpoint for multiple rapid presses
router.post('/quick-emergency', auth, async (req, res) => {
  try {
    const { location, coordinates } = req.body;
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Find existing active alert to increment press count
    const existingAlert = await Alert.findOne({
      userId: req.user._id,
      status: 'active',
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // Last 10 minutes
    }).sort({ createdAt: -1 });

    if (existingAlert) {
      // Increment press count on existing alert
      await existingAlert.updatePressCount();
      
      res.json({
        success: true,
        alert: {
          id: existingAlert._id,
          pressCount: existingAlert.pressCount,
          alertLevel: existingAlert.alertLevel,
          isUpdate: true
        },
        message: `Emergency signal reinforced (Press ${existingAlert.pressCount})`
      });
    } else {
      // Create new quick alert
      const alert = await Alert.create({
        userId: req.user._id,
        userName: user.name,
        userPhone: user.phone,
        userEmail: user.email,
        type: 'emergency',
        emergencyType: 'quick',
        location: location || 'Location not available',
        coordinates: coordinates || {},
        message: 'Quick emergency alert',
        status: 'active',
        priority: 'high',
        pressCount: 1,
        alertLevel: 'medium'
      });

      // Get contacts and notify them
      const contacts = await Contact.find({ 
        userId: req.user._id, 
        isActive: true 
      });
      
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

      res.json({
        success: true,
        alert: {
          id: alert._id,
          pressCount: 1,
          alertLevel: 'medium',
          isUpdate: false
        },
        message: 'Quick emergency alert sent'
      });
    }

  } catch (error) {
    console.error('Quick emergency error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error with quick emergency' 
    });
  }
});

// Get alert statistics - ENHANCED WITH PRESS COUNT ANALYTICS
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

    // Calculate average response time and press count statistics
    const alertsWithResponse = await Alert.find({
      userId: req.user._id,
      'responseUpdates.0': { $exists: true }
    });

    let totalResponseTime = 0;
    let respondedAlertsCount = 0;
    let totalPressCount = 0;
    let maxPressCount = 0;

    alertsWithResponse.forEach(alert => {
      const firstResponse = alert.responseUpdates[0];
      if (firstResponse && firstResponse.timestamp) {
        const responseTime = new Date(firstResponse.timestamp) - new Date(alert.createdAt);
        totalResponseTime += responseTime;
        respondedAlertsCount++;
      }
      
      totalPressCount += alert.pressCount || 1;
      if (alert.pressCount > maxPressCount) {
        maxPressCount = alert.pressCount;
      }
    });

    const avgResponseTime = respondedAlertsCount > 0 
      ? Math.round(totalResponseTime / respondedAlertsCount / 1000 / 60) // Convert to minutes
      : 0;

    // Get urgency level distribution
    const urgencyStats = await Alert.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { 
        _id: '$alertLevel', 
        count: { $sum: 1 },
        avgPresses: { $avg: '$pressCount' }
      }}
    ]);

    res.json({
      success: true,
      stats: {
        total: totalAlerts,
        active: activeAlerts,
        resolved: resolvedAlerts,
        contacted: contactedAlerts,
        avgResponseTime: `${avgResponseTime} minutes`,
        responseRate: totalAlerts > 0 ? Math.round((respondedAlertsCount / totalAlerts) * 100) : 0,
        pressCount: {
          total: totalPressCount,
          average: totalAlerts > 0 ? (totalPressCount / totalAlerts).toFixed(1) : 0,
          maximum: maxPressCount
        },
        urgency: urgencyStats.reduce((acc, stat) => {
          acc[stat._id || 'low'] = { count: stat.count, avgPresses: stat.avgPresses };
          return acc;
        }, {})
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

// Clean up old recent alerts periodically (optional)
setInterval(() => {
  const now = Date.now();
  const COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes
  for (let [userId, timestamp] of recentAlerts.entries()) {
    if (now - timestamp > COOLDOWN_PERIOD) {
      recentAlerts.delete(userId);
    }
  }
}, 60 * 1000); // Run every minute

module.exports = router;