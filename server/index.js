const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
require('./server/index.js');

// Import routes
const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const alertsRoutes = require('./routes/alerts');
const evidenceRoutes = require('./routes/evidence');
const chatsRoutes = require('./routes/chats');
const profileRoutes = require('./routes/profile');
const resourcesRoutes = require('./routes/resources');

const app = express();
const server = http.createServer(app);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../public/uploads');
const evidenceDir = path.join(uploadsDir, 'evidence');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files including uploads
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://NNOI:NNOI2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';
console.log('🔗 Connecting to MongoDB Atlas...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ SUCCESS: Connected to MongoDB Atlas');
})
.catch(err => {
  console.error('❌ FAILED: MongoDB connection error:', err.message);
  process.exit(1);
});

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

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/resources', resourcesRoutes);

// Serve static files including uploads and styles
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/styles', express.static(path.join(__dirname, '../public/styles')));

// Serve the main applications
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/app/index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/app/index.html'));
});

app.get('/trusted-contact', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trusted-contact/index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const statusText = dbStatus === 1 ? 'Connected' : 'Disconnected';
    
    res.json({ 
      status: 'OK', 
      message: 'GBV Support System is running',
      timestamp: new Date().toISOString(),
      database: {
        status: statusText,
        readyState: dbStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    connectedUsers.set(socket.id, userId);
    console.log(`👤 User ${userId} joined room`);
  });

  socket.on('join-contact-room', (contactId) => {
    socket.join(`contact_${contactId}`);
    connectedContacts.set(socket.id, contactId);
    console.log(`👥 Contact ${contactId} joined room`);
  });

  socket.on('send-alert', (alertData) => {
    console.log('🚨 Alert broadcast:', alertData);
    io.emit('new-alert-broadcast', alertData);
  });

  socket.on('alert-status-update', (updateData) => {
    io.emit('alert-status-update', updateData);
  });

  socket.on('contact-responding', (responseData) => {
    io.emit('contact-responding', responseData);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Connection closed: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Main App: http://localhost:${PORT}/app`);
  console.log(`👥 Trusted Contact: http://localhost:${PORT}/trusted-contact`);
  console.log(`🔧 API: http://localhost:${PORT}/api`);
});