const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration
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

// MongoDB Atlas Connection - USING YOUR PROVIDED URI
const MONGODB_URI = 'mongodb+srv://NNOI:NNOI2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔗 Connecting to MongoDB Atlas...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas');
  console.log('📊 Database: gbv_support');
})
.catch(err => {
  console.error('❌ MongoDB Atlas connection error:', err.message);
  process.exit(1);
});

// Import routes
const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alerts');
const contactRoutes = require('./routes/contacts');
const contactAuthRoutes = require('./routes/contactAuth');
const evidenceRoutes = require('./routes/evidence');
const profileRoutes = require('./routes/profile');
const resourceRoutes = require('./routes/resources');
const chatRoutes = require('./routes/chats');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/contact-auth', contactAuthRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/chats', chatRoutes);

// Serve applications
app.get('/', (req, res) => {
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

// Database status endpoint
app.get('/api/db-status', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    res.json({
      status: 'Connected',
      database: 'gbv_support',
      collections: collections.map(c => c.name),
      connectionState: mongoose.connection.readyState
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error',
      error: error.message
    });
  }
});

// Socket.io for real-time features
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected users and contacts
const connectedUsers = new Map();
const connectedContacts = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins their room
  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} joined room`);
  });

  // Contact joins their room
  socket.on('join-contact-room', (contactId) => {
    socket.join(`contact_${contactId}`);
    connectedContacts.set(contactId, socket.id);
    console.log(`Contact ${contactId} joined room`);
  });

  // Emergency alert
  socket.on('send-emergency-alert', async (alertData) => {
    try {
      console.log('Emergency alert received:', alertData);
      
      // Notify all contacts of the user
      const Alert = require('./models/Alert');
      const alert = await Alert.findById(alertData.alertId).populate('userId');
      
      if (alert && alert.trustedContactsNotified) {
        alert.trustedContactsNotified.forEach(contact => {
          socket.to(`contact_${contact.contactId}`).emit('new-alert', {
            ...alertData,
            alertId: alert._id,
            userName: alert.userId.name,
            userPhone: alert.userId.phone
          });
        });
      }
      
      // Broadcast to all connected contacts for demo
      socket.broadcast.emit('new-alert-broadcast', alertData);
      
    } catch (error) {
      console.error('Error handling emergency alert:', error);
    }
  });

  // Alert status update
  socket.on('alert-status-update', (updateData) => {
    console.log('Alert status update:', updateData);
    
    // Notify the user who sent the alert
    socket.to(`user_${updateData.userId}`).emit('alert-status-update', updateData);
    
    // Notify other contacts
    socket.broadcast.emit('alert-status-update', updateData);
  });

  // Test connection
  socket.on('ping', (data) => {
    socket.emit('pong', { message: 'pong', timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    // Remove from connected users
    for (let [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
    
    // Remove from connected contacts
    for (let [contactId, socketId] of connectedContacts.entries()) {
      if (socketId === socket.id) {
        connectedContacts.delete(contactId);
        break;
      }
    }
    
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Main App: http://localhost:${PORT}`);
  console.log(`👥 Trusted Contact: http://localhost:${PORT}/trusted-contact`);
  console.log(`🔧 API: http://localhost:${PORT}/api`);
});