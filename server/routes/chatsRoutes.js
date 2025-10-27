const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const { v4: uuidv4 } = require('uuid');

// TEMPORARY AUTH BYPASS - Replace this line with your actual auth import
const authenticateToken = (req, res, next) => {
    req.user = { id: 'temp-user-id', email: 'test@example.com' };
    next();
};

// Professional data
const professionals = {
    counselor: [
        {
            id: 'counselor_1',
            name: "Dr. Sarah Johnson",
            specialty: "Trauma Counselor",
            availability: "Online",
            avatar: "SJ",
            description: "Specialized in trauma recovery and emotional support",
            experience: "8 years",
            languages: ["English", "Spanish"],
            rating: 4.9,
            responseTime: "2-5 minutes"
        },
        {
            id: 'counselor_2',
            name: "Lisa Chen",
            specialty: "GBV Specialist",
            availability: "Online",
            avatar: "LC",
            description: "Expert in domestic violence counseling",
            experience: "6 years",
            languages: ["English", "Mandarin"],
            rating: 4.8,
            responseTime: "5-10 minutes"
        }
    ],
    legal: [
        {
            id: 'legal_1',
            name: "Attorney James Wilson",
            specialty: "Legal Rights Advisor",
            availability: "Online",
            avatar: "JW",
            description: "Expert in protection orders and legal rights",
            experience: "12 years",
            languages: ["English"],
            rating: 4.9,
            responseTime: "10-15 minutes"
        }
    ],
    medical: [
        {
            id: 'medical_1',
            name: "Dr. Michael Brown",
            specialty: "Medical Consultant",
            availability: "Online",
            avatar: "MB",
            description: "Healthcare and medical support",
            experience: "15 years",
            languages: ["English", "French"],
            rating: 4.7,
            responseTime: "5-10 minutes"
        }
    ],
    support: [
        {
            id: 'support_1',
            name: "Hope Support Group",
            specialty: "Peer Support",
            availability: "Online",
            avatar: "HS",
            description: "Safe space for sharing experiences",
            experience: "Community-based",
            languages: ["English"],
            rating: 4.8,
            responseTime: "1-2 minutes"
        }
    ]
};

// Helper functions
function findProfessionalById(professionalId, category) {
    if (!professionals[category]) return null;
    return professionals[category].find(prof => prof.id === professionalId);
}

function getCategoryIcon(category) {
    const icons = {
        counselor: '👩‍💼',
        legal: '⚖️',
        medical: '🏥',
        support: '👥'
    };
    return icons[category] || '💬';
}

function generateProfessionalResponse(userMessage) {
    const responses = [
        "I understand how difficult this must be for you. Can you tell me more about what you're experiencing?",
        "Thank you for sharing that with me. You're showing great strength by reaching out.",
        "Your safety is the most important thing right now. Do you have a safe place to go?",
        "I'm here to listen and support you. What would be most helpful for you right now?",
        "That sounds very challenging. Remember, you're not alone in this.",
        "It takes courage to talk about these things. How are you feeling right now?",
        "I want to make sure you have the support you need. Would you like me to connect you with additional resources?",
        "Your feelings are completely valid. Let's work together to create a safety plan.",
        "I'm glad you reached out. What kind of support are you looking for today?",
        "You deserve to feel safe and supported. Let's explore options that work for you."
    ];
    
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('emergency') || lowerMessage.includes('urgent')) {
        return "I understand this is urgent. Your safety is the priority. Are you in immediate danger? If so, please use the emergency button to alert your trusted contacts.";
    }
    
    if (lowerMessage.includes('safe') || lowerMessage.includes('safety')) {
        return "Let's discuss your safety plan. Do you have a safe place you can go if needed?";
    }
    
    if (lowerMessage.includes('legal') || lowerMessage.includes('lawyer')) {
        return "I can help connect you with legal resources. Would you like information about protection orders or legal aid services?";
    }
    
    if (lowerMessage.includes('police') || lowerMessage.includes('authorities')) {
        return "If you feel comfortable and safe doing so, contacting authorities can be an important step. Would you like guidance on how to approach this?";
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// ========== ROUTES ==========

// Get all professionals by category
router.get('/professionals/:category', authenticateToken, async (req, res) => {
    try {
        const { category } = req.params;
        
        if (!professionals[category]) {
            return res.status(404).json({ 
                success: false, 
                message: 'Category not found' 
            });
        }

        res.json({
            success: true,
            professionals: professionals[category]
        });
    } catch (error) {
        console.error('Get professionals error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching professionals' 
        });
    }
});

// Get all categories
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const categories = Object.keys(professionals).map(category => ({
            id: category,
            name: category.charAt(0).toUpperCase() + category.slice(1),
            count: professionals[category].length,
            icon: getCategoryIcon(category)
        }));

        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching categories' 
        });
    }
});

// Start a new chat with a professional
router.post('/start', authenticateToken, async (req, res) => {
    try {
        const { professionalId, category } = req.body;
        
        if (!professionalId || !category) {
            return res.status(400).json({ 
                success: false, 
                message: 'Professional ID and category are required' 
            });
        }

        const professional = findProfessionalById(professionalId, category);
        if (!professional) {
            return res.status(404).json({ 
                success: false, 
                message: 'Professional not found' 
            });
        }

        const existingChat = await Chat.findOne({ 
            userId: req.user.id, 
            professionalId 
        });

        if (existingChat) {
            return res.json({
                success: true,
                chat: existingChat,
                message: 'Chat resumed successfully'
            });
        }

        const anonymousUserId = `anon_${uuidv4()}`;
        const encryptionKey = uuidv4();

        const chat = new Chat({
            userId: req.user.id,
            professionalId,
            professionalName: professional.name,
            professionalSpecialty: professional.specialty,
            professionalAvatar: professional.avatar,
            category,
            anonymousUserId,
            encryptionKey,
            messages: [
                {
                    text: `You are now connected with ${professional.name}, ${professional.specialty}. Your conversation is completely anonymous and secure.`,
                    sender: 'system',
                    messageType: 'system'
                },
                {
                    text: `Hello! I'm ${professional.name}, ${professional.specialty}. How can I help you today?`,
                    sender: 'professional',
                    messageType: 'text'
                }
            ]
        });

        await chat.save();

        res.status(201).json({
            success: true,
            chat,
            message: 'Chat started successfully'
        });
    } catch (error) {
        console.error('Start chat error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while starting chat' 
        });
    }
});

// Get all chats for a user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        
        const chats = await Chat.findByUserId(req.user.id, parseInt(page), parseInt(limit));
        
        res.json({
            success: true,
            chats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: await Chat.countDocuments({ userId: req.user.id })
            }
        });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching chats' 
        });
    }
});

// Get specific chat with messages
router.get('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        
        const chat = await Chat.findOne({ 
            _id: chatId, 
            userId: req.user.id 
        });

        if (!chat) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chat not found' 
            });
        }

        await chat.markAsRead('professional');

        const messages = chat.getMessages(parseInt(page), parseInt(limit));

        res.json({
            success: true,
            chat: {
                ...chat.toObject(),
                messages
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: chat.messages.length
            }
        });
    } catch (error) {
        console.error('Get chat error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching chat' 
        });
    }
});

// Send a message
router.post('/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { text, messageType = 'text' } = req.body;
        
        if (!text || text.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'Message text is required' 
            });
        }

        const chat = await Chat.findOne({ 
            _id: chatId, 
            userId: req.user.id 
        });

        if (!chat) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chat not found' 
            });
        }

        const userMessage = {
            text: text.trim(),
            sender: 'user',
            messageType,
            timestamp: new Date()
        };

        await chat.addMessage(userMessage);

        setTimeout(async () => {
            try {
                const professionalResponse = generateProfessionalResponse(text);
                const professionalMessage = {
                    text: professionalResponse,
                    sender: 'professional',
                    messageType: 'text',
                    timestamp: new Date()
                };

                await chat.addMessage(professionalMessage);
                
            } catch (error) {
                console.error('Professional response error:', error);
            }
        }, 2000 + Math.random() * 3000);

        res.json({
            success: true,
            message: userMessage,
            chat: chat
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while sending message' 
        });
    }
});

// Close a chat
router.put('/:chatId/close', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        const chat = await Chat.findOne({ 
            _id: chatId, 
            userId: req.user.id 
        });

        if (!chat) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chat not found' 
            });
        }

        chat.status = 'closed';
        await chat.save();

        res.json({
            success: true,
            message: 'Chat closed successfully',
            chat
        });
    } catch (error) {
        console.error('Close chat error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while closing chat' 
        });
    }
});

// Delete a chat (soft delete)
router.delete('/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        const chat = await Chat.findOne({ 
            _id: chatId, 
            userId: req.user.id 
        });

        if (!chat) {
            return res.status(404).json({ 
                success: false, 
                message: 'Chat not found' 
            });
        }

        chat.status = 'archived';
        await chat.save();

        res.json({
            success: true,
            message: 'Chat archived successfully'
        });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while deleting chat' 
        });
    }
});

// Search professionals
router.get('/search/professionals', authenticateToken, async (req, res) => {
    try {
        const { query, category } = req.query;
        
        if (!query) {
            return res.status(400).json({ 
                success: false, 
                message: 'Search query is required' 
            });
        }

        let searchResults = [];
        const searchCategories = category ? [category] : Object.keys(professionals);

        searchCategories.forEach(cat => {
            const categoryProfessionals = professionals[cat] || [];
            const results = categoryProfessionals.filter(prof => 
                prof.name.toLowerCase().includes(query.toLowerCase()) ||
                prof.specialty.toLowerCase().includes(query.toLowerCase()) ||
                prof.description.toLowerCase().includes(query.toLowerCase())
            );
            searchResults.push(...results);
        });

        res.json({
            success: true,
            results: searchResults,
            total: searchResults.length
        });
    } catch (error) {
        console.error('Search professionals error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while searching professionals' 
        });
    }
});

// Get chat statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const totalChats = await Chat.countDocuments({ userId: req.user.id });
        const activeChats = await Chat.countDocuments({ 
            userId: req.user.id, 
            status: 'active' 
        });
        
        const userChats = await Chat.find({ userId: req.user.id });
        let unreadMessages = 0;
        
        userChats.forEach(chat => {
            chat.messages.forEach(msg => {
                if (msg.sender === 'professional' && !msg.read) {
                    unreadMessages++;
                }
            });
        });

        res.json({
            success: true,
            stats: {
                totalChats,
                activeChats,
                unreadMessages
            }
        });
    } catch (error) {
        console.error('Get chat stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching chat statistics' 
        });
    }
});

module.exports = router;