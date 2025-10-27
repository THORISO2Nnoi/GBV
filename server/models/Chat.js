const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    text: { 
        type: String, 
        required: true 
    },
    sender: { 
        type: String, 
        required: true,
        enum: ['user', 'professional', 'system']
    },
    timestamp: { 
        type: Date, 
        default: Date.now 
    },
    read: {
        type: Boolean,
        default: false
    },
    messageType: {
        type: String,
        default: 'text',
        enum: ['text', 'file', 'location', 'emergency']
    },
    fileUrl: {
        type: String,
        default: null
    }
});

const chatSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    professionalId: { 
        type: String, 
        required: true 
    },
    professionalName: { 
        type: String, 
        required: true 
    },
    professionalSpecialty: {
        type: String,
        required: true
    },
    professionalAvatar: {
        type: String,
        default: '👨‍💼'
    },
    category: {
        type: String,
        required: true,
        enum: ['counselor', 'legal', 'medical', 'support']
    },
    anonymousUserId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'closed', 'archived']
    },
    lastMessage: {
        text: String,
        timestamp: Date,
        sender: String
    },
    unreadCount: {
        type: Number,
        default: 0
    },
    isTyping: {
        type: Boolean,
        default: false
    },
    encryptionKey: {
        type: String,
        required: true
    },
    messages: [messageSchema],
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Update updatedAt timestamp before saving
chatSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Update lastMessage if there are messages
    if (this.messages.length > 0) {
        const lastMsg = this.messages[this.messages.length - 1];
        this.lastMessage = {
            text: lastMsg.text,
            timestamp: lastMsg.timestamp,
            sender: lastMsg.sender
        };
    }
    
    // Calculate unread messages count
    this.unreadCount = this.messages.filter(msg => 
        msg.sender !== 'user' && !msg.read
    ).length;
    
    next();
});

// Index for faster queries
chatSchema.index({ userId: 1, professionalId: 1 }, { unique: true });
chatSchema.index({ userId: 1, updatedAt: -1 });
chatSchema.index({ 'lastMessage.timestamp': -1 });

// Static method to find chats by user with pagination
chatSchema.statics.findByUserId = function(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    return this.find({ userId })
        .sort({ 'lastMessage.timestamp': -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-messages -encryptionKey') // Exclude heavy fields for list view
        .exec();
};

// Instance method to add a message
chatSchema.methods.addMessage = function(messageData) {
    this.messages.push(messageData);
    return this.save();
};

// Instance method to mark messages as read
chatSchema.methods.markAsRead = function(sender = 'professional') {
    this.messages.forEach(msg => {
        if (msg.sender === sender && !msg.read) {
            msg.read = true;
        }
    });
    return this.save();
};

// Instance method to get messages with pagination
chatSchema.methods.getMessages = function(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return this.messages
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(skip, skip + limit)
        .reverse();
};

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;