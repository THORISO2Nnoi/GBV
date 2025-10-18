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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from client directories
app.use('/app', express.static(path.join(__dirname, '../client/app')));
app.use('/trusted-contact', express.static(path.join(__dirname, '../client/trusted-contact')));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://NNOI:THORISO2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔗 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Database Models (defined inline for simplicity)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, required: true, trim: true },
  emergencyContacts: [{
    name: String,
    phone: String,
    email: String,
    relationship: String
  }],
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
  verificationCode: String,
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
  type: { type: String, enum: ['emergency', 'check-in', 'safety'], default: 'emergency' },
  location: { type: String, default: 'Location not specified' },
  message: { type: String, default: 'Emergency assistance needed' },
  status: { type: String, enum: ['active', 'responded', 'resolved', 'cancelled'], default: 'active' },
  trustedContactsNotified: [{
    contactId: mongoose.Schema.Types.ObjectId,
    notifiedAt: { type: Date, default: Date.now },
    responded: { type: Boolean, default: false }
  }],
  responseUpdates: [{
    contactId: mongoose.Schema.Types.ObjectId,
    action: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  resolvedAt: Date
}, { timestamps: true });

const Alert = mongoose.model('Alert', alertSchema);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

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
app.post('/api/contacts', async (req, res) => {
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

    // Generate temporary password
    const tempPassword = crypto.randomBytes(4).toString('hex');

    const contact = await Contact.create({
      userId: user._id,
      name,
      phone,
      email,
      relationship: relationship || 'Trusted Contact',
      password: tempPassword,
      isVerified: true
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
      tempPassword
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ message: 'Server error creating contact' });
  }
});

app.get('/api/contacts', async (req, res) => {
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

app.delete('/api/contacts/:contactId', async (req, res) => {
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

// Alerts Routes
app.post('/api/alerts/emergency', async (req, res) => {
  try {
    const { location, message } = req.body;
    
    // For demo, we'll create an alert without auth
    const user = await User.findOne();
    if (!user) {
      return res.status(400).json({ message: 'No users found. Please register first.' });
    }

    const alert = await Alert.create({
      userId: user._id,
      type: 'emergency',
      location: location || 'Location not specified',
      message: message || 'Emergency assistance needed',
      trustedContactsNotified: user.emergencyContacts || []
    });

    console.log(`Emergency alert created for user ${user.name}`);

    res.status(201).json(alert);
  } catch (error) {
    console.error('Alert creation error:', error);
    res.status(500).json({ message: 'Server error creating alert' });
  }
});

app.get('/api/alerts/my-alerts', async (req, res) => {
  try {
    const user = await User.findOne();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alerts = await Alert.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

app.patch('/api/alerts/:alertId/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.alertId,
      { 
        status,
        ...(status === 'resolved' && { resolvedAt: new Date() }),
        $push: {
          responseUpdates: {
            contactId: 'demo_contact',
            action: `Status changed to ${status}`,
            notes: notes || `Updated by trusted contact`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

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

    const user = await User.findById(contact.userId);

    const token = jwt.sign({ 
      id: contact._id, 
      type: 'contact',
      userId: contact.userId 
    }, 'gbv_secret', { expiresIn: '30d' });

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

app.get('/api/contact-auth/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find({ status: 'active' })
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    console.error('Get contact alerts error:', error);
    res.status(500).json({ message: 'Server error fetching alerts' });
  }
});

// Serve the main applications
app.get('/', (req, res) => {
  res.redirect('/app');
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
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// API test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

// Socket.io for real-time alerts
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on('send-alert', (alertData) => {
    console.log('Alert received:', alertData);
    io.emit('new-alert', alertData);
  });

  socket.on('alert-update', (updateData) => {
    console.log('Alert update:', updateData);
    io.emit('alert-status-update', updateData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 GBV App: http://localhost:${PORT}/app`);
  console.log(`👥 Trusted Contact: http://localhost:${PORT}/trusted-contact`);
  console.log(`🔧 API Server: http://localhost:${PORT}/api`);
  console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
  console.log(`🧪 API Test: http://localhost:${PORT}/api/test`);
});