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

// Store latest message
let latestMessage = null;

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
        // Extract message and chat ID from the webhook payload
        const messageText = req.body.payload?.event?.text;
        const chatId = req.body.payload?.chat_id;

        if (!messageText || !chatId) {
            console.log('Missing message text or chat ID');
            return res.status(200).send('Missing required data');
        }

        console.log('Chat ID:', chatId);
        console.log('Visitor Message:', messageText);

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
                    clientQuestion: fullContext // Sending full conversation context
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

        // Store only the latest Q&A pair for frontend display
        latestMessage = {
            visitorMessage: messageText,      // Only the latest question
            botResponse: botAnswer,           // Only the latest answer
            timestamp: new Date().toISOString()
        };

        res.status(200).json(latestMessage);

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error processing message');
    }
});

// GET endpoint for frontend to fetch latest message
app.get('/livechat/webhook', (req, res) => {
    if (latestMessage) {
        res.json(latestMessage);
    } else {
        res.json({ message: 'No messages yet' });
    }
});

// Cleanup old conversations every hour
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    conversationContexts.forEach((context, chatId) => {
        if (context.lastUpdate < oneHourAgo) {
            conversationContexts.delete(chatId);
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
