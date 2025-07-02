const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-livechat-signature', 'X-LiveChat-Signature']
}));

app.use(bodyParser.json());

const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3';
const WEBHOOK_SECRET = 'fSzbKfowu5bfNBb6rGRFCjoK6DDDZtS3';
const PORT = process.env.PORT || 3000;

let chatMessages = new Map();

let processedThreadEvents = new Map();

const conversationContexts = new Map();




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

app.post('/livechat/webhook', async (req, res) => {
    

    try {
        const messageText = req.body.payload?.event?.text;
        const chatId = req.body.payload?.chat_id;
        const threadId = req.body.payload?.thread_id;
        const eventId = req.body.payload?.event?.id;
        const agentId = req.body.additional_data?.chat_presence_user_ids?.find(id => id.includes('@')) || null;

        if (!messageText || !chatId || !threadId || !eventId) {
            console.log('Missing required data');
            return res.status(200).send('Missing required data');
        }

        const eventKey = `${threadId}_${eventId}`;
        if (!processedThreadEvents.has(chatId)) {
            processedThreadEvents.set(chatId, new Set());
        }

        if (processedThreadEvents.get(chatId).has(eventKey)) {
            
            return res.status(200).send('Duplicate message');
        }

        processedThreadEvents.get(chatId).add(eventKey);

        console.log('Chat ID:', chatId);
        console.log('Agent ID:', agentId);
        console.log('Visitor Message:', messageText);

       
        if (!chatMessages.has(chatId)) {
            chatMessages.set(chatId, {
                messages: [],
                agentId: agentId
            });
        }

        
        if (!conversationContexts.has(chatId)) {
            conversationContexts.set(chatId, {
                messages: [],
                lastUpdate: Date.now()
            });
        }

        const context = conversationContexts.get(chatId);
        
        
        context.messages.push(`Visitor: ${messageText}`);
        context.lastUpdate = Date.now();

        
        const fullContext = context.messages.join('\n');
        console.log('Full Context being sent to Bot:', fullContext);

        
        const botPayload = {
            data: {
                payload: {
                   // override_model: 'sonar',
                    override_model: 'sonar',
                    clientQuestion: fullContext
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

        
        const botAnswer = botResponse.data?.data?.content || botResponse.data?.message || "No answer from bot";
        console.log('Bot Response:', botAnswer);

        
        context.messages.push(`Bot: ${botAnswer}`);

        
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


app.get('/livechat/chat/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    const chatData = chatMessages.get(chatId);
    res.json(chatData ? chatData.messages : []);
});


setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    conversationContexts.forEach((context, chatId) => {
        if (context.lastUpdate < oneHourAgo) {
            conversationContexts.delete(chatId);
            chatMessages.delete(chatId);
            processedThreadEvents.delete(chatId);
            console.log(`Cleaned up conversation for chat ID: ${chatId}`);
        }
    });
}, 60 * 60 * 1000);

app.get("/test", (req, res) => {
     res.send("This is a test get API");
});
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
