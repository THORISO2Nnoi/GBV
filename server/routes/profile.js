const express = require('express');
const bcrypt = require('bcryptjs');
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

// Update user profile
router.put('/', auth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if email is already taken by another user
    if (email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : ''
      },
      { 
        new: true, 
        runValidators: true 
      }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get updated stats
    const contactsCount = await Contact.countDocuments({ userId: req.user._id });
    const evidenceCount = await Evidence.countDocuments({ userId: req.user._id });
    const alertsCount = await Alert.countDocuments({ userId: req.user._id });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        safetyPlan: updatedUser.safetyPlan,
        profile: updatedUser.profile,
        emergencyContacts: updatedUser.emergencyContacts
      },
      stats: {
        trustedContacts: contactsCount,
        evidenceItems: evidenceCount,
        alertsSent: alertsCount
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(err => err.message).join(', ')
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// Change password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password'
    });
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