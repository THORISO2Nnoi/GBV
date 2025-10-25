const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Contact = require('../models/Contact');

const JWT_SECRET = process.env.JWT_SECRET || 'gbv_secret_key_2024';

// User authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'user') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token type' 
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
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
      message: 'Server authentication error' 
    });
  }
};

// Contact authentication middleware
const contactAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'contact') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token type for contact access' 
      });
    }

    const contact = await Contact.findById(decoded.id);
    if (!contact) {
      return res.status(401).json({ 
        success: false,
        message: 'Contact not found' 
      });
    }

    if (!contact.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Contact account is deactivated' 
      });
    }

    req.contact = contact;
    next();
  } catch (error) {
    console.error('Contact auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid contact token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Contact token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server authentication error' 
    });
  }
};

module.exports = { auth, contactAuth, JWT_SECRET };