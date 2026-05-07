// ============================================================
//  cultivaite proxy server v3
//  coaigence | a hybrid intelligence company
// ============================================================

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'cultivaite proxy running' });
});

// ── Market Map endpoint ──
app.post('/map', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw = (data.content || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim();

    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      console.error('Map JSON parse error:', e.message, 'Raw:', raw.substring(0, 200));
      return res.status(500).json({ error: 'Could not parse AI response.', raw: raw.substring(0, 200) });
    }

    res.json({ result: parsed });

  } catch(err) {
    console.error('Map error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Contact extraction endpoint ──
app.post('/extract', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const { imageBase64, mediaType, transcript } = req.body;

  let content;

  if (imageBase64) {
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
    content = 'Extract contact info from this spoken input and return ONLY valid JSON, no markdown: {"first":"","last":"","company":"","title":"","email":"","phone":"","notes":""}\n\nSpoken input: ' + transcript;
  } else {
    return res.status(400).json({ error: 'No image or transcript provided.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const raw = (data.content || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim();

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      console.error('Extract JSON parse error:', e.message);
    }

    res.json({ result: parsed });

  } catch(err) {
    console.error('Extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('cultivaite proxy running on port ' + PORT);
});
