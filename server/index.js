const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

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

// MongoDB Atlas Connection - USING YOUR ATLAS DATABASE
const MONGODB_URI = 'mongodb+srv://NNOI:NNOI2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔗 Connecting to MongoDB Atlas...');
console.log('Database URL:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide password

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas');
  console.log('📊 Database: gbv_support');
})
.catch(err => {
  console.error('❌ MongoDB Atlas connection error:', err.message);
  console.log('💡 Please check:');
  console.log('   - MongoDB Atlas cluster is running');
  console.log('   - IP address is whitelisted in MongoDB Atlas');
  console.log('   - Username and password are correct');
  process.exit(1);
});

// Import routes
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alerts');
const contactRoutes = require('./routes/contacts');
const contactAuthRoutes = require('./routes/contactAuth');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-auth', contactAuthRoutes);

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

// Health check endpoint with DB status
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'GBV Support System is running',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected to MongoDB Atlas' : 'Disconnected',
    databaseName: 'gbv_support',
    databaseType: 'MongoDB Atlas Cloud'
  });
});

// Database status endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    const User = require('./models/User');
    const Contact = require('./models/Contact');
    const Alert = require('./models/Alert');
    
    const userCount = await User.countDocuments();
    const contactCount = await Contact.countDocuments();
    const alertCount = await Alert.countDocuments();
    
    res.json({
      database: 'MongoDB Atlas',
      status: 'Connected',
      connectionState: mongoose.connection.readyState,
      userCount,
      contactCount,
      alertCount,
      databaseName: 'gbv_support'
    });
  } catch (error) {
    res.status(500).json({ 
      database: 'MongoDB Atlas',
      status: 'Error',
      error: error.message,
      connectionState: mongoose.connection.readyState
    });
  }
});

// API test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    database: 'MongoDB Atlas Cloud',
    connection: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Socket.io for real-time alerts
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

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
  console.log('📱 GBV App: https://gbv-fk4g.onrender.com/app');
  console.log('👥 Trusted Contact: https://gbv-fk4g.onrender.com/trusted-contact');
  console.log('🔧 API Server: https://gbv-fk4g.onrender.com/api');
  console.log('❤️ Health Check: https://gbv-fk4g.onrender.com/health');
  console.log('📊 DB Status: https://gbv-fk4g.onrender.com/api/db-status');
  console.log('💾 Database: MongoDB Atlas Cloud');
});
