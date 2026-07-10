const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
  res.send('QR Code API is running!');
});

// Returns an actual PNG image you can view directly in the browser
app.get('/qr', async (req, res) => {
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