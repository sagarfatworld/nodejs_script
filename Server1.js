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
const WEBHOOK_SECRET = 'favtA04Ih2k3Iw4Dlav08faxm7Gn6bnz';
const PORT = process.env.PORT || 3000;

// Store conversations by chat ID
const conversations = new Map();

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

        if (!messageText || !chatId) {
            console.log('Missing message text or chat ID');
            return res.status(200).send('Missing required data');
        }

        console.log('Chat ID:', chatId);
        console.log('Visitor Message:', messageText);

        // Initialize or get conversation for this chat
        if (!conversations.has(chatId)) {
            conversations.set(chatId, {
                messages: [],
                lastUpdate: Date.now()
            });
        }

        const conversation = conversations.get(chatId);
        
        // Add new message to context
        conversation.messages.push(`Visitor: ${messageText}`);
        conversation.lastUpdate = Date.now();

        // Create full context string for Bot@Work
        const fullContext = conversation.messages.join('\n');
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

        // Add bot's response to conversation
        conversation.messages.push(`Bot: ${botAnswer}`);

        // Store the latest QA pair for this chat
        conversation.latestQA = {
            visitorMessage: messageText,
            botResponse: botAnswer,
            timestamp: new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            chatId: chatId,
            latestQA: conversation.latestQA
        });

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error processing message');
    }
});

// Get list of active chats
app.get('/active-chats', (req, res) => {
    const activeChats = [];
    conversations.forEach((value, chatId) => {
        activeChats.push({
            chatId,
            lastUpdate: value.lastUpdate,
            messageCount: Math.floor(value.messages.length / 2) // Divide by 2 since each QA is 2 messages
        });
    });
    
    // Sort by most recent
    activeChats.sort((a, b) => b.lastUpdate - a.lastUpdate);
    
    res.json(activeChats);
});

// Get messages for specific chat
app.get('/chat/:chatId/messages', (req, res) => {
    const chatId = req.params.chatId;
    const conversation = conversations.get(chatId);
    
    if (!conversation) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    // Convert messages array to QA pairs
    const qaMessages = [];
    for (let i = 0; i < conversation.messages.length; i += 2) {
        if (conversation.messages[i] && conversation.messages[i + 1]) {
            qaMessages.push({
                visitorMessage: conversation.messages[i].replace('Visitor: ', ''),
                botResponse: conversation.messages[i + 1].replace('Bot: ', ''),
                timestamp: new Date(conversation.lastUpdate).toISOString()
            });
        }
    }

    res.json(qaMessages);
});

// Get latest message for a specific chat
app.get('/chat/:chatId/latest', (req, res) => {
    const chatId = req.params.chatId;
    const conversation = conversations.get(chatId);
    
    if (!conversation || !conversation.latestQA) {
        return res.status(404).json({ error: 'No messages found' });
    }

    res.json(conversation.latestQA);
});

// Cleanup old conversations (keep last 24 hours)
setInterval(() => {
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    conversations.forEach((value, chatId) => {
        if (value.lastUpdate < dayAgo) {
            conversations.delete(chatId);
            console.log(`Cleaned up conversation for chat ID: ${chatId}`);
        }
    });
}, 60 * 60 * 1000); // Check every hour

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
