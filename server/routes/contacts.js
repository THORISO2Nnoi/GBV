const express = require('express');
const crypto = require('crypto');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Create trusted contact with auto-generated credentials
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;
    
    // Input validation
    if (!name || !phone || !email) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, phone, and email are required' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email format' 
      });
    }

    // Check if contact already exists for this user
    const existingContact = await Contact.findOne({ 
      email: email.toLowerCase(),
      userId: req.user._id
    });
    
    if (existingContact) {
      return res.status(400).json({ 
        success: false,
        message: 'You already have a trusted contact with this email' 
      });
    }

    // Generate temporary password (8 characters)
    const tempPassword = crypto.randomBytes(4).toString('hex');
    console.log(`🔑 Generated password for ${email}: ${tempPassword}`);

    // Create new contact
    const contact = await Contact.create({
      userId: req.user._id,
      name: name.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      relationship: relationship || 'Trusted Contact',
      password: tempPassword,
      isVerified: true,
      isActive: true
    });

    // Add to user's emergency contacts
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        emergencyContacts: {
          contactId: contact._id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.toLowerCase().trim(),
          relationship: relationship || 'Trusted Contact',
          addedAt: new Date(),
          isActive: true
        }
      }
    });

    // Success response with credentials
    res.status(201).json({
      success: true,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isActive: contact.isActive,
        createdAt: contact.createdAt
      },
      loginCredentials: {
        email: contact.email,
        password: tempPassword,
        loginUrl: '/trusted-contact'
      },
      message: 'Trusted contact added successfully. Share the login credentials with them securely.'
    });

  } catch (error) {
    console.error('❌ Create contact error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'A contact with this email already exists in the system' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error creating contact' 
    });
  }
});

// Get user's contacts
router.get('/', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      contacts,
      count: contacts.length
    });

  } catch (error) {
    console.error('❌ Get contacts error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching contacts' 
    });
  }
});

module.exports = router;