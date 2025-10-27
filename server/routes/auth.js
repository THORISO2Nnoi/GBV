const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gbv_secret_key_2024';

// Helper function to generate JWT - FIXED TOKEN TYPE
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      type: 'user', // Explicitly set token type
      email: user.email 
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Register Route - FIXED
router.post('/register', async (req, res) => {
  try {
    console.log('🟡 Registration attempt received');
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }

    const user = await User.create({ 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      password, 
      phone: phone.trim() 
    });
    
    console.log(`✅ User created successfully: ${user.email}`);

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      message: 'Registration successful!'
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(err => err.message).join(', ')
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// Login Route - FIXED
router.post('/login', async (req, res) => {
  try {
    console.log('🟢 Login attempt received');
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const isPasswordValid = await user.correctPassword(password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const token = generateToken(user);

    console.log(`✅ Login successful for: ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      message: 'Login successful!'
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

module.exports = router;