const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === CONFIGURATION ===
const BOT_API_URL = 'https://api.botatwork.com/trigger-task/42eaa2c8-e8aa-43ad-b9b5-944981bce2a2';
const BOT_API_KEY = 'bf2e2d7e409bc0d7545e14ae15a773a3'; // Your bot@work key
const WEBHOOK_SECRET = 'U4yWipPtPd17AcYlkokThjclw8aQ5G8c'; // Your LiveChat webhook secret
const PORT = process.env.PORT || 3000;

// MSSQL config
const dbConfig = {
  user: 'dsyde-flatworld',
  password: 'MSSQL@dsyde2016',
  server: '50.28.38.144',
  database: 'Testdb',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Create MSSQL connection pool
const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL');
    return pool;
  })
  .catch(err => {
    console.error('Database Connection Failed! Bad Config: ', err);
  });

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

app.post('/livechat/webhook', async (req, res) => {
  console.log('Webhook received');

  if (!verifySignature(req)) {
    console.error('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  const payloadJson = JSON.stringify(req.body); // entire webhook JSON string

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('payload', sql.NVarChar(sql.MAX), payloadJson)
      .query('INSERT INTO test_node (payload) VALUES (@payload)');

    res.status(200).send('Stored JSON successfully');
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).send('Database error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
