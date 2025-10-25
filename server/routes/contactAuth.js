const express = require('express');
const jwt = require('jsonwebtoken');
const Contact = require('../models/Contact');
const User = require('../models/User');

const router = express.Router();

// Trusted Contact Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const contact = await Contact.findOne({ email });
    if (!contact) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await contact.correctPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!contact.isActive) {
      return res.status(401).json({ message: 'Contact account is deactivated' });
    }

    const user = await User.findById(contact.userId);

    const token = jwt.sign({ 
      id: contact._id, 
      type: 'contact',
      userId: contact.userId 
    }, 'gbv_secret_key_2024', {
      expiresIn: '30d',
    });

    res.json({
      success: true,
      token,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        userName: user ? user.name : 'User',
        userPhone: user ? user.phone : 'Unknown',
        userId: contact.userId
      }
    });
  } catch (error) {
    console.error('Contact login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get contact's alerts
router.get('/alerts', async (req, res) => {
  try {
    const Alert = require('../models/Alert');
    const alerts = await Alert.find({
      status: 'active'
    })
    .populate('userId', 'name phone')
    .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

module.exports = router;