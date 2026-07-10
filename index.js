require('dotenv').config();
const express = require('express');
const QRCode = require('qrcode');
const Stripe = require('stripe');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(express.json());

// In-memory storage for now (resets on restart - we'll upgrade this later)
const validApiKeys = new Set(['test-key-123']); // keep the test key for now too

// Health check
app.get('/', (req, res) => {
  res.send('QR Code API is running!');
});

// Creates a Stripe Checkout session - this is what the "Sign Up" button will call
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // we'll fill this in next
          quantity: 1,
        },
      ],
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// After successful payment, Stripe redirects here - we generate their API key
app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const newKey = crypto.randomBytes(16).toString('hex');
      validApiKeys.add(newKey);

      res.send(`
        <h1>Thanks for subscribing!</h1>
        <p>Your API key is:</p>
        <code style="font-size: 18px; background: #eee; padding: 10px;">${newKey}</code>
        <p>Save this somewhere safe - you'll need it to use the API.</p>
      `);
    } else {
      res.send('Payment not completed.');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong retrieving your session.');
  }
});

app.get('/cancel', (req, res) => {
  res.send('Checkout cancelled.');
});

// Middleware to check API key
function checkApiKey(req, res, next) {
  const key = req.header('x-api-key');

  if (!key || !validApiKeys.has(key)) {
    return res.status(401).json({ error: 'Missing or invalid API key. Include it as an "x-api-key" header.' });
  }

  next();
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