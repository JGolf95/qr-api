require('dotenv').config();
const express = require('express');
const QRCode = require('qrcode');
const Stripe = require('stripe');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const FREE_TIER_LIMIT = 50;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static('public'));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add any columns that might be missing from an earlier version of this table
  await pool.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'`);
  await pool.query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0`);

  await pool.query(
    `INSERT INTO api_keys (key, tier) VALUES ($1, 'unlimited') ON CONFLICT (key) DO NOTHING`,
    ['test-key-123']
  );
}

// Free signup - no payment required
app.post('/signup-free', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  try {
    const newKey = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'INSERT INTO api_keys (key, email, tier) VALUES ($1, $2, $3)',
      [newKey, email, 'free']
    );
    res.json({ key: newKey, limit: FREE_TIER_LIMIT });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create free key' });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const newKey = crypto.randomBytes(16).toString('hex');
      await pool.query(
        'INSERT INTO api_keys (key, tier) VALUES ($1, $2)',
        [newKey, 'unlimited']
      );

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

async function checkApiKey(req, res, next) {
  const key = req.header('x-api-key');

  if (!key) {
    return res.status(401).json({ error: 'Missing API key. Include it as an "x-api-key" header.' });
  }

  try {
    const result = await pool.query('SELECT * FROM api_keys WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key.' });
    }

    const record = result.rows[0];

    if (record.tier === 'free' && record.usage_count >= FREE_TIER_LIMIT) {
      return res.status(429).json({
        error: `Free tier limit of ${FREE_TIER_LIMIT} requests reached. Upgrade at /#pricing for unlimited access.`
      });
    }

    req.apiKeyRecord = record;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error checking API key' });
  }
}

app.get('/qr', checkApiKey, async (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).json({ error: 'Please provide a "text" query parameter, e.g. /qr?text=hello' });
  }

  try {
    const buffer = await QRCode.toBuffer(text);
    await pool.query('UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = $1', [req.apiKeyRecord.id]);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});