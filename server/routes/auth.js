const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    console.log('Registration attempt received');
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
    console.log('User created successfully:', user.email);

    const token = jwt.sign({ id: user._id }, 'gbv_secret_key_2024', { expiresIn: '30d' });

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
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
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

    const token = jwt.sign({ id: user._id }, 'gbv_secret_key_2024', { expiresIn: '30d' });

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
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
});

// Get all users endpoint
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching users' 
    });
  }
});

module.exports = router;
