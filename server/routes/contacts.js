const express = require('express');
const crypto = require('crypto');
const Contact = require('../models/Contact');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Create trusted contact with auto-generated credentials - UPDATED WITH LOGIN DETAILS POPUP
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

    // Generate secure temporary password (8 characters with numbers and letters)
    const tempPassword = generateSecurePassword();
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

    // Success response with credentials for popup display
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
        loginUrl: '/trusted-contact',
        instructions: 'Share these login details securely with your trusted contact. They can use these credentials to access the Trusted Contact Portal.'
      },
      message: 'Trusted contact added successfully! Please share the login credentials securely.'
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

// Generate secure password function
function generateSecurePassword() {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  
  // Ensure at least one number and one letter
  password += charset[Math.floor(Math.random() * 52)]; // Letter
  password += charset[52 + Math.floor(Math.random() * 10)]; // Number
  
  // Fill the rest
  for (let i = 2; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

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

// DELETE a contact
router.delete('/:id', auth, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    
    // Also remove from user's emergencyContacts array
    await User.findByIdAndUpdate(contact.userId, {
      $pull: {
        emergencyContacts: { contactId: req.params.id }
      }
    });
    
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ success: false, message: 'Server error deleting contact' });
  }
});

// Resend login credentials for a contact
router.post('/:id/resend-credentials', auth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contact not found' 
      });
    }

    // Verify the contact belongs to the current user
    if (contact.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to access this contact' 
      });
    }

    // Generate new password
    const newPassword = generateSecurePassword();
    
    // Update contact with new password
    contact.password = newPassword;
    await contact.save();

    console.log(`🔑 New password generated for ${contact.email}: ${newPassword}`);

    res.json({
      success: true,
      loginCredentials: {
        email: contact.email,
        password: newPassword,
        loginUrl: '/trusted-contact',
        instructions: 'Share these new login details securely with your trusted contact.'
      },
      message: 'New login credentials generated successfully!'
    });

  } catch (error) {
    console.error('Resend credentials error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error generating new credentials' 
    });
  }
});

module.exports = router;