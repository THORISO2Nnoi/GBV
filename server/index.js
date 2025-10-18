const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../client'));

// MongoDB Connection - Updated with your MongoDB Atlas connection
const MONGODB_URI = 'mongodb+srv://NNOI:THORISO2@cluster0.amrhd90.mongodb.net/gbv_support?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/contact-auth', require('./routes/contactAuth'));

// Socket.io for real-time alerts
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on('send-alert', (alertData) => {
    // Broadcast to all trusted contacts
    alertData.trustedContacts.forEach(contactId => {
      socket.to(contactId).emit('new-alert', alertData);
    });
    console.log('Alert sent to contacts:', alertData.trustedContacts);
  });

  socket.on('alert-update', (updateData) => {
    // Update all parties about alert status
    io.to(updateData.userId).emit('alert-status-update', updateData);
    updateData.trustedContacts.forEach(contactId => {
      socket.to(contactId).emit('alert-status-update', updateData);
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 GBV App: http://localhost:3000`);
  console.log(`👥 Trusted Contact: http://localhost:3001`);
});