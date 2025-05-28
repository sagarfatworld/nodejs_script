const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(bodyParser.json());

// === CONFIGURATION ===
const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3';
const WEBHOOK_SECRET = 'favtA04Ih2k3Iw4Dlav08faxm7Gn6bnz';
const PORT = process.env.PORT || 3000;

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

        // Extract and log bot's response
        const botAnswer = botResponse.data?.data?.content || botResponse.data?.message || "No answer from bot";
        console.log('Bot Response:', botAnswer);

        res.status(200).json({
            visitorMessage: messageText,
            botResponse: botAnswer
        });

    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).send('Error processing message');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
