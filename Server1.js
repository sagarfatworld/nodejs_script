const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(bodyParser.json());

// === CONFIGURATION ===
const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3';
const WEBHOOK_SECRET = '6xTgb9GbYebt3osKQBiMDJ1lEoDZ4eLs';
const PORT = process.env.PORT || 3000;

// Agent Q&A store: { agentId: [ { question, answer } ] }
const agentQAs = {};

// Helper to verify webhook signature
function verifySignature(req) {
  const signature = req.get('X-LiveChat-Signature') || req.get('x-livechat-signature');
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(JSON.stringify(req.body));
  const digest = hmac.digest('hex');
  return signature === digest;
}

// Webhook endpoint to receive visitor messages
app.post('/livechat/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body.event;
  if (event !== 'incoming_chat') {
    return res.status(200).send('Not interested event');
  }

  const chat = req.body.data.chat;
  const agent = chat.owner; // agent assigned to chat
  if (!agent) {
    return res.status(200).send('No agent assigned yet');
  }

  const visitorMsg = chat.messages.find(m => m.author_type === 'visitor' && m.type === 'message');
  if (!visitorMsg) {
    return res.status(200).send('No visitor message');
  }

  const visitorQuestion = visitorMsg.text.trim();
  if (!visitorQuestion) {
    return res.status(200).send('Empty visitor message');
  }

  // Call bot@work API
  try {
    const payload = {
      data: {
        payload: {
          override_model: 'sonar',
          clientQuestion: visitorQuestion
        }
      },
      should_stream: false
    };

    const botResp = await axios.post(BOT_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BOT_API_KEY
      }
    });

    const botAnswer = botResp.data?.data?.content || botResp.data?.message || "No answer from bot";

    // Store Q&A per agent
    if (!agentQAs[agent.id]) {
      agentQAs[agent.id] = [];
    }
    agentQAs[agent.id].push({ question: visitorQuestion, answer: botAnswer });

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

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
