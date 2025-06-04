const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const session = require('express-session');

const app = express();

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-livechat-signature']
}));

app.use(bodyParser.json());

// Configuration
const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3';
const WEBHOOK_SECRET = 'favtA04Ih2k3Iw4Dlav08faxm7Gn6bnz';
const PORT = process.env.PORT || 3000;

// Store messages and agent assignments
let chatMessages = new Map();
let agentSessions = new Map();

// Agent login endpoint
app.post('/login', (req, res) => {
    const { agentUserId, agentEmail } = req.body;
    req.session.agentUserId = agentUserId;
    agentSessions.set(agentUserId, {
        email: agentEmail,
        lastActive: Date.now()
    });
    console.log('Agent logged in:', agentUserId, agentEmail);
    res.json({ success: true });
});

// Get current agent endpoint
app.get('/current-agent', (req, res) => {
    const agentId = req.session.agentUserId;
    if (agentId && agentSessions.has(agentId)) {
        res.json({
            agentId: agentId,
            email: agentSessions.get(agentId).email
        });
    } else {
        res.status(401).json({ error: 'No agent logged in' });
    }
});

// Webhook endpoint
app.post('/livechat/webhook', async (req, res) => {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));

    try {
        const messageText = req.body.payload?.event?.text;
        const chatId = req.body.payload?.chat_id;
        const assignedAgentId = req.body.additional_data?.chat_presence_user_ids?.find(id => id.includes('@'));

        if (!messageText || !chatId) {
            return res.status(400).json({ error: 'Missing required data' });
        }

        // Store message with agent assignment
        if (!chatMessages.has(chatId)) {
            chatMessages.set(chatId, {
                messages: [],
                assignedAgentId: assignedAgentId
            });
        }

        // Process bot response
        const botPayload = {
            data: {
                payload: {
                    override_model: 'sonar',
                    clientQuestion: messageText
                }
            },
            should_stream: false
        };

        const botResponse = await axios.post(BOT_API_URL, botPayload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': BOT_API_KEY
            }
        });

        const botAnswer = botResponse.data?.data?.content || 
                         botResponse.data?.message || 
                         "No answer from bot";

        // Store message
        const messageData = {
            visitorMessage: messageText,
            botResponse: botAnswer,
            timestamp: new Date().toISOString(),
            assignedAgentId: assignedAgentId
        };

        chatMessages.get(chatId).messages.push(messageData);
        res.status(200).json(messageData);

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get chats for specific agent
app.get('/livechat/chats/:agentId', (req, res) => {
    const requestedAgentId = req.params.agentId;
    const sessionAgentId = req.session.agentUserId;

    // Verify agent session matches requested agent
    if (requestedAgentId !== sessionAgentId) {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    const agentChats = Array.from(chatMessages.entries())
        .filter(([_, chatData]) => chatData.assignedAgentId === requestedAgentId)
        .map(([chatId, chatData]) => ({
            chatId,
            messages: chatData.messages
        }));

    res.json(agentChats);
});

// Get specific chat messages
app.get('/livechat/chat/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    const sessionAgentId = req.session.agentUserId;
    const chatData = chatMessages.get(chatId);

    if (!chatData) {
        return res.json([]);
    }

    // Verify agent has access to this chat
    if (chatData.assignedAgentId !== sessionAgentId) {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.json(chatData.messages);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
