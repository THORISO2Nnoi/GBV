const express = require('express');
const jwt = require('jsonwebtoken');
const Contact = require('../models/Contact');
const User = require('../models/User');

const router = express.Router();

// Trusted Contact Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const contact = await Contact.findOne({ email });
    if (!contact || !(await contact.correctPassword(password, contact.password))) {
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
    }, process.env.JWT_SECRET || 'gbv_secret', {
      expiresIn: '30d',
    });

    res.json({
      token,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        userName: user.name,
        userPhone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify Contact (when user adds a contact, send verification)
router.post('/verify', async (req, res) => {
  try {
    const { contactId, code } = req.body;
    
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    if (contact.verificationCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    contact.isVerified = true;
    contact.verificationCode = null;
    await contact.save();

    res.json({ message: 'Contact verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get contact's active alerts
router.get('/alerts', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gbv_secret');
    if (decoded.type !== 'contact') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    const Alert = require('../models/Alert');
    const alerts = await Alert.find({
      'trustedContactsNotified.contactId': decoded.id,
      status: 'active'
    })
    .populate('userId', 'name phone')
    .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;