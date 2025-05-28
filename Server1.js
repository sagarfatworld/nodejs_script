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

// Helper to verify webhook signature
function verifySignature(req) {
    const signature = req.get('X-LiveChat-Signature') || req.get('x-livechat-signature');
    if (!signature) {
        console.log('No signature header found');
        return true; // For testing, you might want to return true
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
        // Extract the message text from the webhook payload
        const messageText = req.body.payload?.event?.text;
        
        if (!messageText) {
            console.log('No message text found');
            return res.status(200).send('No message text');
        }

        console.log('Visitor Message:', messageText);

        // Prepare payload for bot@work
        const botPayload = {
            data: {
                payload: {
                    override_model: 'sonar',
                    clientQuestion: messageText
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

        // Store the latest message
        latestMessage = {
            visitorMessage: messageText,
            botResponse: botAnswer,
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

// GET endpoint to fetch all messages (optional)
app.get('/livechat/messages', (req, res) => {
    res.json({ messages: latestMessage ? [latestMessage] : [] });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Serve static files (optional - if you want to serve the HTML from the same server)
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
