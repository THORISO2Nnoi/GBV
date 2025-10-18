const express = require('express');
const Contact = require('../models/Contact');
const User = require('../models/User');
const auth = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Add trusted contact (with authentication setup)
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;
    
    // Check if contact already exists
    const existingContact = await Contact.findOne({ email, userId: req.user.id });
    if (existingContact) {
      return res.status(400).json({ message: 'Contact already exists' });
    }

    // Generate temporary password and verification code
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const contact = await Contact.create({
      userId: req.user.id,
      name,
      phone,
      email,
      relationship,
      password: tempPassword, // Will be hashed by pre-save middleware
      verificationCode
    });

    // Add to user's emergency contacts
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        emergencyContacts: {
          _id: contact._id,
          name,
          phone,
          email,
          relationship
        }
      }
    });

    // In real implementation, send email to contact with:
    // - Login credentials (email + tempPassword)
    // - Verification code
    // - App instructions
    console.log(`Contact created: ${email}, Temp password: ${tempPassword}, Verification: ${verificationCode}`);

    res.status(201).json({
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship
      },
      tempPassword,
      verificationCode
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's trusted contacts
router.get('/', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user.id });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;