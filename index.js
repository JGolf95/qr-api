const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// TEMPORARY: a single test key so we can confirm this works.
// Later, real keys will come from Stripe signups instead of this list.
const validApiKeys = ['test-key-123'];

// Health check - no key needed
app.get('/', (req, res) => {
  res.send('QR Code API is running!');
});

// Middleware: checks every request to /qr for a valid key
function checkApiKey(req, res, next) {
  const key = req.header('x-api-key');

  if (!key || !validApiKeys.includes(key)) {
    return res.status(401).json({ error: 'Missing or invalid API key. Include it as an "x-api-key" header.' });
  }

  next(); // key is valid, continue to the actual endpoint
}

app.get('/qr', checkApiKey, async (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).json({ error: 'Please provide a "text" query parameter, e.g. /qr?text=hello' });
  }

  try {
    const buffer = await QRCode.toBuffer(text);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});