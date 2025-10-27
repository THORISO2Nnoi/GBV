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
app.use(express.static(path.join(__dirname, '../client/app')));
app.use('/trusted-contact', express.static(path.join(__dirname, '../client/trusted-contact')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../public/uploads/evidence');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// MongoDB Atlas Connection
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
const chatRoutes = require('./routes/chatsRoutes');

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

// Make io available to routes
app.set('io', io);

// Store connected users and contacts
const connectedUsers = new Map();
const connectedContacts = new Map();

// Track alert counts per user to prevent duplicates
const userAlertCounts = new Map();

io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // User joins their room
  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    connectedUsers.set(userId, socket.id);
    console.log(`👤 User ${userId} joined room`);
  });

  // Contact joins their room
  socket.on('join-contact-room', (contactId) => {
    socket.join(`contact_${contactId}`);
    connectedContacts.set(contactId, socket.id);
    console.log(`📞 Contact ${contactId} joined room`);
  });

  // Emergency alert - FIXED DUPLICATION ISSUE
  socket.on('send-emergency-alert', async (alertData) => {
    try {
      console.log('🚨 Emergency alert received:', alertData);
      
      const Alert = require('./models/Alert');
      const Contact = require('./models/Contact');
      
      // Check for duplicate alerts within 30 seconds
      const userId = alertData.userId;
      const now = Date.now();
      const lastAlertTime = userAlertCounts.get(userId) || 0;
      
      if (now - lastAlertTime < 30000) { // 30 seconds cooldown
        console.log('⚠️ Duplicate alert prevented for user:', userId);
        return;
      }
      
      // Update last alert time
      userAlertCounts.set(userId, now);
      
      // Get the alert with populated data
      const alert = await Alert.findById(alertData.alertId)
        .populate('userId', 'name phone')
        .populate('trustedContactsNotified.contactId');
      
      if (alert) {
        console.log(`📢 Notifying contacts for alert: ${alert._id}`);
        
        // Notify each contact individually
        if (alert.trustedContactsNotified && alert.trustedContactsNotified.length > 0) {
          alert.trustedContactsNotified.forEach(contact => {
            if (contact.contactId && contact.contactId._id) {
              socket.to(`contact_${contact.contactId._id}`).emit('new-alert', {
                alertId: alert._id,
                userId: alert.userId._id,
                userName: alert.userId.name,
                userPhone: alert.userId.phone,
                location: alert.location,
                message: alert.message,
                emergencyType: alert.emergencyType,
                pressCount: alert.pressCount,
                alertLevel: alert.alertLevel,
                createdAt: alert.createdAt,
                type: 'emergency'
              });
              console.log(`📨 Sent alert to contact: ${contact.contactId._id}`);
            }
          });
        }
        
        // Also broadcast for any connected contacts
        socket.broadcast.emit('new-alert-broadcast', {
          alertId: alert._id,
          userId: alert.userId._id,
          userName: alert.userId.name,
          userPhone: alert.userId.phone,
          location: alert.location,
          message: alert.message,
          emergencyType: alert.emergencyType,
          pressCount: alert.pressCount,
          alertLevel: alert.alertLevel,
          createdAt: alert.createdAt,
          contactsNotified: alert.trustedContactsNotified?.length || 0
        });
      }
      
    } catch (error) {
      console.error('❌ Error handling emergency alert:', error);
    }
  });

  // Alert status update
  socket.on('alert-status-update', async (updateData) => {
    try {
      console.log('📝 Alert status update:', updateData);
      
      const Alert = require('./models/Alert');
      const alert = await Alert.findById(updateData.alertId).populate('userId');
      
      if (alert) {
        // Notify the user who sent the alert
        socket.to(`user_${alert.userId._id}`).emit('alert-status-update', {
          alertId: alert._id,
          status: updateData.status,
          contactName: updateData.contactName,
          contactId: updateData.contactId,
          timestamp: updateData.timestamp,
          message: `${updateData.contactName} marked the alert as ${updateData.status}`
        });
        
        // Notify other contacts of the same user
        const Contact = require('./models/Contact');
        const contacts = await Contact.find({ 
          userId: alert.userId._id, 
          isActive: true,
          _id: { $ne: updateData.contactId }
        });
        
        contacts.forEach(contact => {
          socket.to(`contact_${contact._id}`).emit('alert-status-update', {
            alertId: alert._id,
            status: updateData.status,
            contactName: updateData.contactName,
            timestamp: updateData.timestamp,
            message: `${updateData.contactName} marked the alert as ${updateData.status}`
          });
        });
      }
      
    } catch (error) {
      console.error('❌ Error handling alert status update:', error);
    }
  });

  // Chat messages - SAVE TO DATABASE
  socket.on('send-chat-message', async (messageData) => {
    try {
      const Chat = require('./models/Chat');
      const { chatId, message, sender, messageType = 'text' } = messageData;
      
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('chat-error', { message: 'Chat not found' });
        return;
      }
      
      // Add message to chat in database
      const newMessage = {
        text: message,
        sender: sender,
        messageType: messageType,
        timestamp: new Date(),
        read: false
      };
      
      chat.messages.push(newMessage);
      chat.lastMessage = {
        text: message,
        timestamp: new Date(),
        sender: sender
      };
      chat.updatedAt = new Date();
      
      await chat.save();
      
      // Emit to both parties
      io.to(`user_${chat.userId}`).emit('new-chat-message', {
        chatId: chatId,
        message: newMessage
      });
      
      socket.emit('message-sent', { 
        success: true, 
        message: newMessage 
      });
      
    } catch (error) {
      console.error('❌ Error saving chat message:', error);
      socket.emit('chat-error', { message: 'Failed to send message' });
    }
  });

  // Profile update notification
  socket.on('profile-updated', (userData) => {
    console.log('👤 Profile updated:', userData);
    socket.to(`user_${userData.userId}`).emit('profile-update-notification', {
      message: 'Profile updated successfully',
      user: userData
    });
  });

  // Test connection
  socket.on('ping', (data) => {
    socket.emit('pong', { 
      message: 'pong', 
      timestamp: new Date(),
      server: 'GBV Support System'
    });
  });

  socket.on('disconnect', () => {
    // Remove from connected users
    for (let [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        console.log(`👤 User ${userId} disconnected`);
        break;
      }
    }
    
    // Remove from connected contacts
    for (let [contactId, socketId] of connectedContacts.entries()) {
      if (socketId === socket.id) {
        connectedContacts.delete(contactId);
        console.log(`📞 Contact ${contactId} disconnected`);
        break;
      }
    }
    
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Main App: http://localhost:${PORT}`);
  console.log(`👥 Trusted Contact: http://localhost:${PORT}/trusted-contact`);
  console.log(`🔧 API: http://localhost:${PORT}/api`);
  console.log(`❤️  GBV Support System Ready!`);
});