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
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3'; // Replace with your actual key
const WEBHOOK_SECRET = 'favtA04Ih2k3Iw4Dlav08faxm7Gn6bnz'; // Replace with your LiveChat webhook secret
const PORT = process.env.PORT || 3000;

// Agent Q&A store: { agentId: [ { question, answer } ] }
const agentQAs = {};

// Helper to verify webhook signature
function verifySignature(req) {
  const signature = req.get('X-LiveChat-Signature') || req.get('x-livechat-signature');
  if (!signature) {
    console.error('No signature header found');
    return false;
  }
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(JSON.stringify(req.body));
  const digest = hmac.digest('hex');
  if (signature !== digest) {
    console.error('Signature mismatch. Expected:', digest, 'Received:', signature);
  }
  return signature === digest;
}

// UPDATED: Webhook handler with new message capture logic
app.post('/livechat/webhook', async (req, res) => {
  console.log('Webhook received, body:', JSON.stringify(req.body, null, 2));

  if (!verifySignature(req)) {
    console.error('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  // Check if it's a message event
  if (req.body.action !== 'incoming_event') {
    return res.status(200).send('Not interested event');
  }

  const event = req.body.payload?.event;
  if (!event || event.type !== 'message') {
    return res.status(200).send('Not a message event');
  }

  const messageText = event.text?.trim();
  if (!messageText) {
    return res.status(200).send('Empty message');
  }

  try {
    const payload = {
      data: {
        payload: {
          override_model: 'sonar',
          clientQuestion: messageText
        }
      },
      should_stream: false
    };

    // Call bot@work API
    const botResp = await axios.post(BOT_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BOT_API_KEY
      }
    });

    const botAnswer = botResp.data?.data?.content || botResp.data?.message || "No answer from bot";
    console.log('Bot response:', botAnswer);

    // Store Q&A
    const authorId = event.author_id;
    if (!agentQAs[authorId]) {
      agentQAs[authorId] = [];
    }
    agentQAs[authorId].push({ question: messageText, answer: botAnswer });

    res.status(200).send('Processed');
  } catch (error) {
    console.error('Error calling bot@work:', error.message);
    res.status(500).send('Bot API error');
  }
});

// API to get Q&A for a specific agent (simple auth by agentId query param for demo)
app.get('/api/agent-qa', (req, res) => {
  const agentId = req.query.agentId;
  if (!agentId) {
    return res.status(400).send('agentId query parameter required');
  }
  const qa = agentQAs[agentId] || [];
  res.json({ qa });
});

// Health check endpoint (for Render and monitoring)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
