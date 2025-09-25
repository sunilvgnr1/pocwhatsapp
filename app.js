const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_USERNAME,
  SF_PASSWORD,
  SF_SECURITY_TOKEN,
  SF_LOGIN_URL = 'https://login.salesforce.com',
  SF_API_VERSION = '61.0'
} = process.env;

// ------------------- Helper: Get Salesforce Access Token -------------------
async function getAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username: SF_USERNAME,
    password: SF_PASSWORD + SF_SECURITY_TOKEN
  });

  const resp = await axios.post(`${SF_LOGIN_URL}/services/oauth2/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return { accessToken: resp.data.access_token, instanceUrl: resp.data.instance_url };
}

// ------------------- Helper: Create Lead -------------------
async function createLead(lead) {
  const { accessToken, instanceUrl } = await getAccessToken();
  const url = `${instanceUrl}/services/data/v${SF_API_VERSION}/sobjects/Lead/`;

  const resp = await axios.post(url, lead, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  });

  return resp.data;
}

// ------------------- Webhook Verification -------------------
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// ------------------- Webhook POST for WhatsApp messages -------------------
app.post('/', async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\nWebhook received ${timestamp}`);
  console.log(JSON.stringify(req.body, null, 2));

  // Extract basic info from WhatsApp message
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.status(200).end(); // no message

    const from = msg.from || 'Unknown';
    const body = msg.text?.body || 'No content';

    // Create a basic Lead in Salesforce
    const leadPayload = {
      LastName: `WhatsApp_${from}`,
      Company: 'WhatsApp Contact',
      Description: `Message received: ${body}`
    };

    const leadResult = await createLead(leadPayload);
    console.log('Lead created in Salesforce:', leadResult);

    res.status(200).end();
  } catch (err) {
    console.error('Error creating lead:', err.response?.data || err.message);
    res.status(500).end();
  }
});

// ------------------- Start server -------------------
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
