const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-livechat-signature', 'X-LiveChat-Signature']
}));

app.use(bodyParser.json());

// === CONFIGURATION ===
const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3';
const WEBHOOK_SECRET = 'Km5CLuX7YGXyEcr2Z6PsEaSI235kBGva';
const PORT = process.env.PORT || 3000;

// Modified to store messages and agent information
let chatMessages = new Map();

// Store conversation contexts
const conversationContexts = new Map();

// Helper to verify webhook signature
function verifySignature(req) {
    const signature = req.get('X-LiveChat-Signature') || req.get('x-livechat-signature');
    if (!signature) {
        console.log('No signature header found');
        return true;
    }
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(JSON.stringify(req.body));
    const digest = hmac.digest('hex');
    return signature === digest;
}

// Webhook POST endpoint
app.post('/livechat/webhook', async (req, res) => {
    console.log('Webhook received, body:', JSON.stringify(req.body, null, 2));

    try {
        const messageText = req.body.payload?.event?.text;
        const chatId = req.body.payload?.chat_id;
        const agentId = req.body.additional_data?.chat_presence_user_ids?.find(id => id.includes('@')) || null;

        if (!messageText || !chatId) {
            console.log('Missing message text or chat ID');
            return res.status(200).send('Missing required data');
        }

        console.log('Chat ID:', chatId);
        console.log('Agent ID:', agentId);
        console.log('Visitor Message:', messageText);

        // Initialize chat messages array if it doesn't exist
        if (!chatMessages.has(chatId)) {
            chatMessages.set(chatId, {
                messages: [],
                agentId: agentId
            });
        }

        // Get or initialize conversation context
        if (!conversationContexts.has(chatId)) {
            conversationContexts.set(chatId, {
                messages: [],
                lastUpdate: Date.now()
            });
        }

        const context = conversationContexts.get(chatId);
        
        // Add new message to context
        context.messages.push(`Visitor: ${messageText}`);
        context.lastUpdate = Date.now();

        // Create full context string for Bot@Work
        const fullContext = context.messages.join('\n');
        console.log('Full Context being sent to Bot:', fullContext);

        // Prepare payload with full context
        const botPayload = {
            data: {
                payload: {
                    override_model: 'sonar',
                    clientQuestion: fullContext
                }
            },
            should_stream: false
        };

        // Call bot@work API
        const botResponse = await axios.post(BOT_API_URL, botPayload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': BOT_API_KEY
            }
        });

        // Extract bot's response
        const botAnswer = botResponse.data?.data?.content || botResponse.data?.message || "No answer from bot";
        console.log('Bot Response:', botAnswer);

        // Add bot's response to context
        context.messages.push(`Bot: ${botAnswer}`);

        // Store the Q&A pair for this chat
        const messageData = {
            visitorMessage: messageText,
            botResponse: botAnswer,
            timestamp: new Date().toISOString()
        };

        chatMessages.get(chatId).messages.push(messageData);

        res.status(200).json(messageData);

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error processing message');
    }
});

// Modified GET endpoint to fetch chats for specific agent
app.get('/livechat/chats/:agentId', (req, res) => {
    const requestedAgentId = req.params.agentId;
    const agentChats = Array.from(chatMessages.entries())
        .filter(([_, chatData]) => chatData.agentId === requestedAgentId)
        .map(([chatId, chatData]) => ({
            chatId,
            messages: chatData.messages
        }));
    res.json(agentChats);
});

// Modified GET endpoint to fetch messages for a specific chat
app.get('/livechat/chat/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    const chatData = chatMessages.get(chatId);
    res.json(chatData ? chatData.messages : []);
});

// Cleanup old conversations every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    conversationContexts.forEach((context, chatId) => {
        if (context.lastUpdate < oneHourAgo) {
            conversationContexts.delete(chatId);
            chatMessages.delete(chatId);
            console.log(`Cleaned up conversation for chat ID: ${chatId}`);
        }
    });
}, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
