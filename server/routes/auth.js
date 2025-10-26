const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'gbv_secret_key_2024';

// 🧩 Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, type: 'user' }, // 👈 Include token type
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// 📝 Register Route
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

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }

    const user = await User.create({ name, email, password, phone });
    console.log(`✅ User created successfully: ${user.email}`);

    const token = generateToken(user); // 🪪 New token includes "type: user"

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
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// 🔐 Login Route
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const isPasswordValid = await user.correctPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const token = generateToken(user); // ✅ Token now includes { type: 'user' }

    console.log(`🔑 Token generated for ${user.email}: ${token.substring(0, 30)}...`);

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
