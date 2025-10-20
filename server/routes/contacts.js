const express = require('express');
const crypto = require('crypto');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Create contact
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;
    
    if (!name || !phone || !email) {
      return res.status(400).json({ message: 'Name, phone, and email are required' });
    }

    const existingContact = await Contact.findOne({ email });
    if (existingContact) {
      return res.status(400).json({ message: 'Contact already exists with this email' });
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');

    const contact = await Contact.create({
      userId: req.user._id,
      name,
      phone,
      email,
      relationship: relationship || 'Trusted Contact',
      password: tempPassword,
      isVerified: true
    });

    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        emergencyContacts: {
          contactId: contact._id,
          name,
          phone,
          email,
          relationship: relationship || 'Trusted Contact'
        }
      }
    });

    res.status(201).json({
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship
      },
      tempPassword
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ message: 'Server error creating contact' });
  }
});

// Get all contacts
router.get('/', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id });
    res.json(contacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error fetching contacts' });
  }
});

// Delete contact
router.delete('/:contactId', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ 
      _id: req.params.contactId, 
      userId: req.user._id 
    });
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { emergencyContacts: { contactId: contact._id } }
    });

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error deleting contact' });
  }
});

module.exports = router;