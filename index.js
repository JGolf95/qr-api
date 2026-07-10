const express = require('express');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check - just to confirm the server is alive
app.get('/', (req, res) => {
  res.send('QR Code API is running!');
});

// The actual QR code endpoint
// Example usage: /qr?text=hello
app.get('/qr', async (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).json({ error: 'Please provide a "text" query parameter, e.g. /qr?text=hello' });
  }

  try {
    const qrImage = await QRCode.toDataURL(text);
    res.json({ qrCode: qrImage });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});