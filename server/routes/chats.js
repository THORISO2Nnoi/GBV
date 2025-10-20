const express = require('express');
const Chat = require('../models/Chat');
const Contact = require('../models/Contact');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Create chat
router.post('/', auth, async (req, res) => {
  try {
    const { type, contactId } = req.body;
    
    if (!type) {
      return res.status(400).json({ message: 'Chat type is required' });
    }

    const chatData = {
      userId: req.user._id,
      type,
      participants: [{
        userId: req.user._id,
        userType: 'user',
        joinedAt: new Date(),
        lastSeen: new Date()
      }],
      messages: [{
        senderId: req.user._id,
        senderType: 'system',
        message: `Welcome to ${type} chat. You are now connected securely.`,
        messageType: 'text',
        timestamp: new Date(),
        isRead: true
      }],
      isAnonymous: type !== 'trusted-contact',
      lastActivity: new Date()
    };

    if (contactId && type === 'trusted-contact') {
      const contact = await Contact.findById(contactId);
      if (contact) {
        chatData.contactId = contactId;
        chatData.participants.push({
          userId: contactId,
          userType: 'contact',
          joinedAt: new Date(),
          lastSeen: new Date()
        });
        chatData.isAnonymous = false;
      }
    }

    const chat = await Chat.create(chatData);

    res.status(201).json({
      chatId: chat._id,
      type: chat.type,
      participants: chat.participants,
      messages: chat.messages,
      createdAt: chat.createdAt,
      isAnonymous: chat.isAnonymous
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ message: 'Server error creating chat' });
  }
});

// Get user chats
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({
      $or: [
        { userId: req.user._id },
        { 'participants.userId': req.user._id }
      ]
    })
    .populate('contactId', 'name email phone')
    .sort({ lastActivity: -1 });

    res.json(chats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error fetching chats' });
  }
});

module.exports = router;