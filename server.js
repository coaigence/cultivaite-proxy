// ============================================================
//  cultivaite proxy server
//  Hides Anthropic API key from end users
//  Deploy on Railway, Render, or Fly.io
// ============================================================

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Your Anthropic key lives here as an environment variable ──
// Set ANTHROPIC_API_KEY in your hosting dashboard. Never hardcode it.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ── Optional: restrict which domains can call this proxy ──
// Add your GitHub Pages URL here to lock it down
const ALLOWED_ORIGINS = [
  'https://coaigence.github.io',
  'http://localhost:3000' // for local testing
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json({ limit: '10mb' })); // images can be large

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'cultivaite proxy running' });
});

// ── Main proxy endpoint ──
app.post('/extract', async (req, res) => {
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { imageBase64, mediaType, transcript } = req.body;

  // Build message content based on what was sent
  let content = [];

  if (imageBase64) {
    // Image scan mode
    content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
      },
      {
        type: 'text',
        text: 'Extract contact info. Reply ONLY with this JSON, nothing else: {"first":"","last":"","company":"","title":"","email":"","phone":"","website":""}'
      }
    ];
  } else if (transcript) {
    // Voice mode
    content = 'Extract contact info from this spoken input and return ONLY valid JSON, no markdown: {"first":"","last":"","company":"","title":"","email":"","phone":"","notes":""}\\n\\nSpoken input: ' + transcript;
  } else {
    return res.status(400).json({ error: 'No image or transcript provided.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages:   [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw  = (data.content || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim();

    let parsed = {};
    try { parsed = JSON.parse(raw); } catch(e) {}

    res.json({ result: parsed });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('cultivaite proxy running on port ' + PORT);
});
