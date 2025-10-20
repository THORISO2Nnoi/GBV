const express = require('express');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Evidence = require('../models/Evidence');
const Alert = require('../models/Alert');
const Chat = require('../models/Chat');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get user profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password');
    
    const contactsCount = await Contact.countDocuments({ userId: req.user._id });
    const evidenceCount = await Evidence.countDocuments({ userId: req.user._id });
    const alertsCount = await Alert.countDocuments({ userId: req.user._id });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        safetyPlan: user.safetyPlan,
        profile: user.profile,
        emergencyContacts: user.emergencyContacts
      },
      stats: {
        trustedContacts: contactsCount,
        evidenceItems: evidenceCount,
        alertsSent: alertsCount
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// Get safety plan
router.get('/safety-plan', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('safetyPlan');
    res.json(user.safetyPlan || {});
  } catch (error) {
    console.error('Get safety plan error:', error);
    res.status(500).json({ message: 'Server error fetching safety plan' });
  }
});

// Update safety plan
router.post('/safety-plan', auth, async (req, res) => {
  try {
    const { safeWord, safeLocations, emergencyProtocol } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        safetyPlan: {
          safeWord: safeWord || 'bluebird',
          safeLocations: safeLocations || [],
          emergencyProtocol: emergencyProtocol || ''
        }
      },
      { new: true }
    );

    res.json(user.safetyPlan);
  } catch (error) {
    console.error('Update safety plan error:', error);
    res.status(500).json({ message: 'Server error updating safety plan' });
  }
});

module.exports = router;