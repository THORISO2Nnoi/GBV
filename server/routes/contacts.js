const express = require('express');
const Contact = require('../models/Contact');
const User = require('../models/User');
const crypto = require('crypto');

const router = express.Router();

// Add trusted contact
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;
    
    if (!name || !phone || !email) {
      return res.status(400).json({ message: 'Name, phone, and email are required' });
    }

    // Get any user for demo
    const user = await User.findOne();
    if (!user) {
      return res.status(400).json({ message: 'No user found. Please register first.' });
    }

    // Check if contact already exists
    const existingContact = await Contact.findOne({ email });
    if (existingContact) {
      return res.status(400).json({ message: 'Contact already exists with this email' });
    }

    // Generate temporary password and verification code
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const contact = await Contact.create({
      userId: user._id,
      name,
      phone,
      email,
      relationship: relationship || 'Trusted Contact',
      password: tempPassword,
      verificationCode,
      isVerified: true // Auto-verify for demo
    });

    // Add to user's emergency contacts
    await User.findByIdAndUpdate(user._id, {
      $push: {
        emergencyContacts: {
          _id: contact._id,
          name,
          phone,
          email,
          relationship: relationship || 'Trusted Contact'
        }
      }
    });

    console.log(`Contact created: ${email}, Temp password: ${tempPassword}`);

    res.status(201).json({
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isVerified: contact.isVerified
      },
      tempPassword,
      verificationCode
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ message: 'Server error creating contact' });
  }
});

// Get user's trusted contacts
router.get('/', async (req, res) => {
  try {
    const user = await User.findOne();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const contacts = await Contact.find({ userId: user._id });
    res.json(contacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error fetching contacts' });
  }
});

// Delete contact
router.delete('/:contactId', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.contactId);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Remove from user's emergency contacts
    await User.updateOne(
      { _id: contact.userId },
      { $pull: { emergencyContacts: { _id: contact._id } } }
    );

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error deleting contact' });
  }
});

module.exports = router;