const express = require('express');
const jwt = require('jsonwebtoken');
const Contact = require('../models/Contact');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'gbv_secret_key_2024';

// Trusted Contact Login - FIXED
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Contact login attempt for:', email);

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    // Find contact by email
    const contact = await Contact.findOne({ email: email.toLowerCase() });
    if (!contact) {
      console.log('❌ Contact not found:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if contact is active
    if (!contact.isActive) {
      console.log('❌ Contact inactive:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Your account has been deactivated. Please contact the user who added you.' 
      });
    }

    // Verify password
    const isPasswordValid = await contact.correctPassword(password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Get user information
    const user = await User.findById(contact.userId).select('name phone email');
    if (!user) {
      console.log('❌ User not found for contact:', email);
      return res.status(404).json({ 
        success: false,
        message: 'Associated user not found' 
      });
    }

    // Generate JWT token for contact
    const token = jwt.sign({ 
      id: contact._id, 
      type: 'contact',
      userId: contact.userId,
      email: contact.email
    }, JWT_SECRET, {
      expiresIn: '30d',
    });

    // Update last active timestamp
    contact.lastActive = new Date();
    await contact.save();

    console.log('✅ Contact login successful:', email);

    // Successful login response
    res.json({
      success: true,
      token,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        userName: user.name,
        userPhone: user.phone,
        userEmail: user.email,
        userId: contact.userId,
        lastActive: contact.lastActive,
        isActive: contact.isActive
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Contact login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login. Please try again.' 
    });
  }
});

// Get contact's alerts - FIXED
router.get('/alerts', async (req, res) => {
  try {
    // Check authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'Authorization token required' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'contact') {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token type' 
      });
    }

    // Get contact information
    const contact = await Contact.findById(decoded.id);
    if (!contact || !contact.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Contact not found or inactive' 
      });
    }

    // Get alerts for this contact's user
    const Alert = require('../models/Alert');
    const alerts = await Alert.find({
      userId: contact.userId,
      status: { $in: ['active', 'contacted'] } // Only show active and contacted alerts
    })
    .populate('userId', 'name phone email')
    .sort({ createdAt: -1 })
    .limit(50);

    // Update contact's last active timestamp
    contact.lastActive = new Date();
    await contact.save();

    console.log(`✅ Sent ${alerts.length} alerts to contact: ${contact.email}`);

    res.json(alerts);

  } catch (error) {
    console.error('❌ Get contact alerts error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching alerts' 
    });
  }
});

module.exports = router;