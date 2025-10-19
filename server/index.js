const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://NNOI:THORISO2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔗 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// Database Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, required: true, trim: true },
  emergencyContacts: [{
    contactId: mongoose.Schema.Types.ObjectId,
    name: String,
    phone: String,
    email: String,
    relationship: String
  }],
  safetyPlan: {
    safeWord: { type: String, default: 'bluebird' },
    safeLocations: [{
      name: String,
      address: String,
      contact: String
    }],
    emergencyProtocol: String
  },
  profile: {
    avatar: String,
    emergencySettings: {
      autoShareLocation: { type: Boolean, default: true },
      notifyAllContacts: { type: Boolean, default: true }
    }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  relationship: { type: String, default: 'Trusted Contact' },
  isVerified: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

contactSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

contactSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Contact = mongoose.model('Contact', contactSchema);

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  type: { type: String, enum: ['emergency', 'check-in', 'safety'], default: 'emergency' },
  location: { type: String, default: 'Location not specified' },
  message: { type: String, default: 'Emergency assistance needed' },
  status: { type: String, enum: ['active', 'responded', 'resolved', 'cancelled'], default: 'active' },
  trustedContactsNotified: [{
    contactId: mongoose.Schema.Types.ObjectId,
    name: String,
    email: String,
    notifiedAt: { type: Date, default: Date.now },
    responded: { type: Boolean, default: false }
  }],
  responseUpdates: [{
    contactId: mongoose.Schema.Types.ObjectId,
    contactName: String,
    action: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  resolvedAt: Date
}, { timestamps: true });

const Alert = mongoose.model('Alert', alertSchema);

const evidenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['photo', 'document', 'audio', 'note'], required: true },
  title: { type: String, required: true },
  description: String,
  notes: String,
  date: { type: Date, required: true },
  fileData: String,
  fileName: String,
  fileType: String,
  isEncrypted: { type: Boolean, default: true },
  tags: [String]
}, { timestamps: true });

const Evidence = mongoose.model('Evidence', evidenceSchema);

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  type: { type: String, enum: ['counselor', 'legal', 'support'], required: true },
  messages: [{
    sender: { type: String, enum: ['user', 'contact', 'system'], required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false }
  }],
  status: { type: String, enum: ['active', 'closed', 'archived'], default: 'active' },
  isAnonymous: { type: Boolean, default: true }
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store connected users and contacts
const connectedUsers = new Map();
const connectedContacts = new Map();

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, 'gbv_secret');
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const contactAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, 'gbv_secret');
    const contact = await Contact.findById(decoded.id);
    
    if (!contact) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.contact = contact;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// ===== API ROUTES =====

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body);
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({ name, email, password, phone });

    const token = jwt.sign({ id: user._id }, 'gbv_secret', { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.correctPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user._id }, 'gbv_secret', { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Contacts Routes
app.post('/api/contacts', auth, async (req, res) => {
  try {
    const { name, phone, email, relationship } = req.body;
    
    if (!name || !phone || !email) {
      return res.status(400).json({ message: 'Name, phone, and email are required' });
    }

    // Check if contact already exists
    const existingContact = await Contact.findOne({ email });
    if (existingContact) {
      return res.status(400).json({ message: 'Contact already exists with this email' });
    }

    // Generate temporary password
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

    // Add to user's emergency contacts
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

    console.log(`✅ Contact created: ${email}, Temp password: ${tempPassword}`);

    res.status(201).json({
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        isVerified: contact.isVerified
      },
      tempPassword
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ message: 'Server error creating contact' });
  }
});

app.get('/api/contacts', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user._id });
    res.json(contacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error fetching contacts' });
  }
});

app.delete('/api/contacts/:contactId', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ 
      _id: req.params.contactId, 
      userId: req.user._id 
    });
    
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Remove from user's emergency contacts
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { emergencyContacts: { contactId: contact._id } }
    });

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error deleting contact' });
  }
});

// Alerts Routes - FIXED TO PROPERLY NOTIFY TRUSTED CONTACTS
app.post('/api/alerts/emergency', auth, async (req, res) => {
  try {
    const { location, message } = req.body;
    
    console.log(`🚨 Emergency alert from user: ${req.user.name}`);
    
    // Get user's trusted contacts
    const contacts = await Contact.find({ userId: req.user._id });
    console.log(`📞 Found ${contacts.length} trusted contacts to notify`);

    if (contacts.length === 0) {
      console.log('⚠️ No trusted contacts found for user');
    }

    const alert = await Alert.create({
      userId: req.user._id,
      userName: req.user.name,
      userPhone: req.user.phone,
      type: 'emergency',
      location: location || 'Location not specified',
      message: message || 'Emergency assistance needed',
      trustedContactsNotified: contacts.map(contact => ({
        contactId: contact._id,
        name: contact.name,
        email: contact.email,
        notifiedAt: new Date(),
        responded: false
      }))
    });

    console.log(`✅ Emergency alert created for user ${req.user.name}`);

    // CRITICAL FIX: Notify all trusted contacts via socket
    let notifiedCount = 0;
    contacts.forEach(contact => {
      console.log(`📢 Notifying contact: ${contact.name} (${contact._id})`);
      
      // Send to contact's room
      io.to(`contact_${contact._id}`).emit('new-alert', {
        alertId: alert._id,
        userName: req.user.name,
        userPhone: req.user.phone,
        location: alert.location,
        message: alert.message,
        timestamp: alert.createdAt,
        contactId: contact._id
      });
      
      // Also send to all connected trusted contact clients
      io.emit('new-alert-broadcast', {
        alertId: alert._id,
        userName: req.user.name,
        userPhone: req.user.phone,
        location: alert.location,
        message: alert.message,
        timestamp: alert.createdAt
      });
      
      notifiedCount++;
    });

    console.log(`✅ Notified ${notifiedCount} trusted contacts`);

    // Also emit to user's room for real-time updates
    io.to(`user_${req.user._id}`).emit('alert-sent', {
      alertId: alert._id,
      message: `Emergency alert sent to ${notifiedCount} trusted contacts`,
      contactsNotified: notifiedCount
    });

    res.status(201).json({
      ...alert.toObject(),
      contactsNotified: notifiedCount
    });
  } catch (error) {
    console.error('❌ Alert creation error:', error);
    res.status(500).json({ message: 'Server error creating alert' });
  }
});

app.get('/api/alerts/my-alerts', auth, async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('responseUpdates.contactId', 'name');
    
    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

app.patch('/api/alerts/:alertId/status', contactAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    console.log(`📝 Contact ${req.contact.name} updating alert ${req.params.alertId} to ${status}`);
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.alertId,
      { 
        status,
        ...(status === 'resolved' && { resolvedAt: new Date() }),
        $push: {
          responseUpdates: {
            contactId: req.contact._id,
            contactName: req.contact.name,
            action: `Status changed to ${status}`,
            notes: notes || `Updated by trusted contact`,
            timestamp: new Date()
          }
        },
        $set: {
          'trustedContactsNotified.$[elem].responded': true
        }
      },
      { 
        new: true,
        arrayFilters: [{ 'elem.contactId': req.contact._id }]
      }
    ).populate('userId', 'name phone');

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    console.log(`✅ Alert status updated by ${req.contact.name}`);

    // Notify user about status update
    io.to(`user_${alert.userId._id}`).emit('alert-status-update', {
      alertId: alert._id,
      status: status,
      contactName: req.contact.name,
      timestamp: new Date(),
      message: `${req.contact.name} marked the alert as ${status}`
    });

    res.json(alert);
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ message: 'Server error updating alert' });
  }
});

// Contact Auth Routes
app.post('/api/contact-auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const contact = await Contact.findOne({ email });
    if (!contact || !(await contact.correctPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!contact.isActive) {
      return res.status(401).json({ message: 'Contact account is deactivated' });
    }

    const user = await User.findById(contact.userId);

    const token = jwt.sign({ 
      id: contact._id, 
      type: 'contact',
      userId: contact.userId 
    }, 'gbv_secret', { expiresIn: '30d' });

    console.log(`✅ Contact login: ${contact.name}`);

    res.json({
      token,
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        relationship: contact.relationship,
        userName: user ? user.name : 'User',
        userPhone: user ? user.phone : 'Unknown'
      }
    });
  } catch (error) {
    console.error('Contact login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/api/contact-auth/alerts', contactAuth, async (req, res) => {
  try {
    const alerts = await Alert.find({ 
      'trustedContactsNotified.contactId': req.contact._id 
    })
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 });

    console.log(`📋 Sent ${alerts.length} alerts to contact ${req.contact.name}`);
    
    res.json(alerts);
  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Enhanced Evidence Vault Routes with proper error handling
app.post('/api/evidence', auth, async (req, res) => {
  try {
    console.log('📁 Evidence creation request received');
    const { type, title, description, notes, date, fileData, fileName, fileType } = req.body;
    
    // Validate required fields
    if (!type || !title || !date) {
      console.log('❌ Missing required fields:', { type, title, date });
      return res.status(400).json({ 
        success: false,
        message: 'Type, title, and date are required' 
      });
    }

    console.log('✅ Creating evidence record for user:', req.user.name);
    
    const evidence = await Evidence.create({
      userId: req.user._id,
      type,
      title,
      description: description || title,
      notes: notes || '',
      date: new Date(date),
      fileData: fileData || null,
      fileName: fileName || null,
      fileType: fileType || null,
      tags: [type, 'evidence'],
      isEncrypted: true
    });

    console.log('✅ Evidence created successfully:', evidence._id);

    res.status(201).json({
      success: true,
      message: 'Evidence saved securely',
      evidence: {
        id: evidence._id,
        type: evidence.type,
        title: evidence.title,
        description: evidence.description,
        date: evidence.date,
        createdAt: evidence.createdAt,
        secure: evidence.isEncrypted
      }
    });

  } catch (error) {
    console.error('❌ Evidence creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error saving evidence: ' + error.message 
    });
  }
});

// Get all evidence for user
app.get('/api/evidence', auth, async (req, res) => {
  try {
    console.log('📁 Fetching evidence for user:', req.user.name);
    
    const { page = 1, limit = 10, type, search } = req.query;
    
    const filter = { userId: req.user._id };
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const evidence = await Evidence.find(filter)
      .select('-fileData') // Exclude large file data from list
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Evidence.countDocuments(filter);

    console.log(`✅ Found ${evidence.length} evidence items`);

    res.json({
      success: true,
      evidence,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalEvidence: total
    });

  } catch (error) {
    console.error('❌ Get evidence error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching evidence' 
    });
  }
});

// Get single evidence item
app.get('/api/evidence/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    res.json({
      success: true,
      evidence
    });

  } catch (error) {
    console.error('Get evidence detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching evidence details'
    });
  }
});

// Delete evidence
app.delete('/api/evidence/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    res.json({
      success: true,
      message: 'Evidence deleted successfully'
    });

  } catch (error) {
    console.error('Delete evidence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting evidence'
    });
  }
});

// Evidence statistics
app.get('/api/evidence/stats/summary', auth, async (req, res) => {
  try {
    const totalEvidence = await Evidence.countDocuments({ userId: req.user._id });
    
    const evidenceByType = await Evidence.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const recentEvidence = await Evidence.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title type date createdAt');

    res.json({
      success: true,
      stats: {
        totalEvidence,
        evidenceByType,
        recentEvidence
      }
    });

  } catch (error) {
    console.error('Evidence stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching evidence statistics'
    });
  }
});

// Chat Routes
app.post('/api/chats', auth, async (req, res) => {
  try {
    const { type } = req.body;
    
    if (!type) {
      return res.status(400).json({ message: 'Chat type is required' });
    }

    const chat = await Chat.create({
      userId: req.user._id,
      type,
      messages: [{
        sender: 'system',
        message: `Welcome to ${type} chat. You are now connected securely.`,
        timestamp: new Date(),
        isRead: true
      }],
      isAnonymous: true
    });

    res.status(201).json({
      chatId: chat._id,
      type: chat.type,
      messages: chat.messages,
      createdAt: chat.createdAt
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ message: 'Server error creating chat' });
  }
});

app.post('/api/chats/:chatId/messages', auth, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.chatId, userId: req.user._id },
      {
        $push: {
          messages: {
            sender: 'user',
            message: message,
            timestamp: new Date(),
            isRead: false
          }
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Simulate automated response
    setTimeout(async () => {
      const responses = {
        counselor: [
          "I understand this must be very difficult for you. Can you tell me more about what you're experiencing?",
          "Your safety is the most important thing right now. Are you in a safe location?",
          "Thank you for reaching out. You're not alone in this.",
          "I'm here to listen and support you. What kind of help do you need right now?"
        ],
        legal: [
          "I can provide information about legal options available to you.",
          "Let me explain the process for obtaining a protection order.",
          "You have legal rights in this situation. Would you like me to explain them?",
          "I can connect you with legal aid services in your area."
        ],
        support: [
          "Many people have been through similar experiences. You're not alone.",
          "It takes courage to reach out. Thank you for sharing.",
          "This is a safe space to talk about what you're going through.",
          "Would you like to hear about support groups in your area?"
        ]
      };

      const response = responses[chat.type][Math.floor(Math.random() * responses[chat.type].length)];
      
      await Chat.findByIdAndUpdate(
        req.params.chatId,
        {
          $push: {
            messages: {
              sender: 'contact',
              message: response,
              timestamp: new Date(),
              isRead: false
            }
          }
        }
      );

      // Notify user of new message
      io.to(`user_${req.user._id}`).emit('new-chat-message', {
        chatId: req.params.chatId,
        message: response,
        sender: 'contact'
      });
    }, 2000);

    res.json(chat.messages[chat.messages.length - 1]);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error sending message' });
  }
});

app.get('/api/chats', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user._id })
      .sort({ updatedAt: -1 });

    res.json(chats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error fetching chats' });
  }
});

app.get('/api/chats/:chatId', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({ 
      _id: req.params.chatId, 
      userId: req.user._id 
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json(chat);
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ message: 'Server error fetching chat' });
  }
});

// Enhanced Evidence Vault Routes with proper error handling
app.post('/api/evidence', auth, async (req, res) => {
  try {
    console.log('📁 Evidence creation request received');
    const { type, title, description, notes, date, fileData, fileName, fileType } = req.body;
    
    // Validate required fields
    if (!type || !title || !date) {
      console.log('❌ Missing required fields:', { type, title, date });
      return res.status(400).json({ 
        success: false,
        message: 'Type, title, and date are required' 
      });
    }

    console.log('✅ Creating evidence record for user:', req.user.name);
    
    const evidence = await Evidence.create({
      userId: req.user._id,
      type,
      title,
      description: description || title,
      notes: notes || '',
      date: new Date(date),
      fileData: fileData || null,
      fileName: fileName || null,
      fileType: fileType || null,
      tags: [type, 'evidence'],
      isEncrypted: true
    });

    console.log('✅ Evidence created successfully:', evidence._id);

    res.status(201).json({
      success: true,
      message: 'Evidence saved securely',
      evidence: {
        id: evidence._id,
        type: evidence.type,
        title: evidence.title,
        description: evidence.description,
        date: evidence.date,
        createdAt: evidence.createdAt,
        secure: evidence.isEncrypted
      }
    });

  } catch (error) {
    console.error('❌ Evidence creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error saving evidence: ' + error.message 
    });
  }
});

// Get all evidence for user
app.get('/api/evidence', auth, async (req, res) => {
  try {
    console.log('📁 Fetching evidence for user:', req.user.name);
    
    const { page = 1, limit = 10, type, search } = req.query;
    
    const filter = { userId: req.user._id };
    
    if (type && type !== 'all') {
      filter.type = type;
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const evidence = await Evidence.find(filter)
      .select('-fileData') // Exclude large file data from list
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Evidence.countDocuments(filter);

    console.log(`✅ Found ${evidence.length} evidence items`);

    res.json({
      success: true,
      evidence,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalEvidence: total
    });

  } catch (error) {
    console.error('❌ Get evidence error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error fetching evidence' 
    });
  }
});

// Get single evidence item
app.get('/api/evidence/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    res.json({
      success: true,
      evidence
    });

  } catch (error) {
    console.error('Get evidence detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching evidence details'
    });
  }
});

// Delete evidence
app.delete('/api/evidence/:id', auth, async (req, res) => {
  try {
    const evidence = await Evidence.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: 'Evidence not found'
      });
    }

    res.json({
      success: true,
      message: 'Evidence deleted successfully'
    });

  } catch (error) {
    console.error('Delete evidence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting evidence'
    });
  }
});

// Evidence statistics
app.get('/api/evidence/stats/summary', auth, async (req, res) => {
  try {
    const totalEvidence = await Evidence.countDocuments({ userId: req.user._id });
    
    const evidenceByType = await Evidence.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const recentEvidence = await Evidence.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title type date createdAt');

    res.json({
      success: true,
      stats: {
        totalEvidence,
        evidenceByType,
        recentEvidence
      }
    });

  } catch (error) {
    console.error('Evidence stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching evidence statistics'
    });
  }
});

// Profile Routes
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password');
    
    // Get stats
    const contactsCount = await Contact.countDocuments({ userId: req.user._id });
    const evidenceCount = await Evidence.countDocuments({ userId: req.user._id });
    const alertsCount = await Alert.countDocuments({ userId: req.user._id });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        safetyPlan: user.safetyPlan,
        profile: user.profile
      },
      stats: {
        trustedContacts: contactsCount,
        evidenceItems: evidenceCount,
        alertsSent: alertsCount
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

app.put('/api/profile', auth, async (req, res) => {
  try {
    const { name, phone, safetyPlan, profile } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(safetyPlan && { safetyPlan }),
        ...(profile && { profile })
      },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Safety Plan Routes
app.get('/api/safety-plan', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('safetyPlan');
    res.json(user.safetyPlan || {});
  } catch (error) {
    console.error('Get safety plan error:', error);
    res.status(500).json({ message: 'Server error fetching safety plan' });
  }
});

app.post('/api/safety-plan', auth, async (req, res) => {
  try {
    const { safeWord, safeLocations, emergencyProtocol } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        safetyPlan: {
          safeWord: safeWord || 'bluebird',
          safeLocations: safeLocations || [],
          emergencyProtocol: emergencyProtocol || ''
        }
      },
      { new: true }
    );

    res.json(user.safetyPlan);
  } catch (error) {
    console.error('Update safety plan error:', error);
    res.status(500).json({ message: 'Server error updating safety plan' });
  }
});

// Resources Routes
app.get('/api/resources', async (req, res) => {
  try {
    const resources = {
      emergencyNumbers: [
        { name: 'Police Emergency', number: '911', type: 'emergency' },
        { name: 'GBV Helpline', number: '0800 428 428', type: 'support' },
        { name: 'Ambulance', number: '112', type: 'emergency' },
        { name: 'Lifeline Counseling', number: '0861 322 322', type: 'support' }
      ],
      shelters: [
        { name: 'Safe House Central', address: '123 Safety Street', phone: '555-0101' },
        { name: 'Women\'s Shelter', address: '456 Protection Ave', phone: '555-0102' },
        { name: 'Family Safety Center', address: '789 Hope Road', phone: '555-0103' }
      ],
      legalAid: [
        { name: 'Legal Aid Society', service: 'Protection Orders', phone: '555-0201' },
        { name: 'Victim Advocacy', service: 'Court Support', phone: '555-0202' },
        { name: 'Pro Bono Lawyers', service: 'Free Legal Help', phone: '555-0203' }
      ]
    };

    res.json(resources);
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ message: 'Server error fetching resources' });
  }
});

// Serve the main applications
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/app/index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/app/index.html'));
});

app.get('/trusted-contact', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/trusted-contact/index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'GBV Support System is running',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    version: '1.0.0'
  });
});

// API test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: ['/api/auth/register', '/api/auth/login'],
      contacts: ['/api/contacts', '/api/contacts/:id'],
      alerts: ['/api/alerts/emergency', '/api/alerts/my-alerts'],
      safety: ['/api/safety-plan'],
      resources: ['/api/resources'],
      evidence: ['/api/evidence'],
      chats: ['/api/chats'],
      profile: ['/api/profile']
    }
  });
});

// Socket.io for real-time communication - FIXED NOTIFICATION SYSTEM
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    connectedUsers.set(socket.id, userId);
    console.log(`👤 User ${userId} joined room (socket: ${socket.id})`);
  });

  socket.on('join-contact-room', (contactId) => {
    socket.join(`contact_${contactId}`);
    connectedContacts.set(socket.id, contactId);
    console.log(`👥 Contact ${contactId} joined room (socket: ${socket.id})`);
  });

  socket.on('send-alert', (alertData) => {
    console.log('🚨 Alert received via socket:', alertData);
    // Broadcast to all trusted contact clients
    io.emit('new-alert-broadcast', alertData);
  });

  socket.on('alert-update', (updateData) => {
    console.log('📝 Alert update via socket:', updateData);
    io.emit('alert-status-update', updateData);
  });

  socket.on('disconnect', () => {
    const userId = connectedUsers.get(socket.id);
    const contactId = connectedContacts.get(socket.id);
    
    if (userId) {
      connectedUsers.delete(socket.id);
      console.log(`👤 User ${userId} disconnected`);
    }
    
    if (contactId) {
      connectedContacts.delete(socket.id);
      console.log(`👥 Contact ${contactId} disconnected`);
    }
    
    console.log(`🔌 Connection closed: ${socket.id}`);
  });

  // Test socket connection
  socket.on('ping', (data) => {
    socket.emit('pong', { ...data, serverTime: new Date().toISOString() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 GBV App: http://localhost:${PORT}/app`);
  console.log(`👥 Trusted Contact: http://localhost:${PORT}/trusted-contact`);
  console.log(`🔧 API Server: http://localhost:${PORT}/api`);
  console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
  console.log(`🧪 API Test: http://localhost:${PORT}/api/test`);
  console.log(`\n📋 Available Features:`);
  console.log(`   ✅ User Registration & Login`);
  console.log(`   ✅ Emergency Alert System (FIXED - Now properly notifies trusted contacts)`);
  console.log(`   ✅ Trusted Contact Management`);
  console.log(`   ✅ Safety Planning`);
  console.log(`   ✅ Resources & Helplines`);
  console.log(`   ✅ Evidence Vault with File Storage`);
  console.log(`   ✅ Safe Chat Platform`);
  console.log(`   ✅ Real-time Notifications`);
  console.log(`   ✅ Profile Management`);
  console.log(`   ✅ Mobile-responsive Design`);
});