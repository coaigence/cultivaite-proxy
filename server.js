// ============================================================
//  cultivaite proxy server v5
//  coaigence | a hybrid intelligence company
//  Robust JSON extraction for Market Map
// ============================================================

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 8080;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'cultivaite proxy running v5' });
});

// ── Market Map endpoint with web search ──
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 15
          }
        ],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    
    // Extract all text blocks
    const textBlocks = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text || '')
      .join('');

    console.log('Raw response length:', textBlocks.length);
    console.log('First 300 chars:', textBlocks.substring(0, 300));

    // Try multiple JSON extraction strategies
    let parsed = [];
    
    // Strategy 1: Find JSON array in response
    const arrayMatch = textBlocks.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      try {
        parsed = JSON.parse(arrayMatch[0]);
        console.log('Strategy 1 success:', parsed.length, 'records');
      } catch(e) {
        console.error('Strategy 1 failed:', e.message);
      }
    }

    // Strategy 2: Clean markdown and try again
    if (!parsed.length) {
      const cleaned = textBlocks
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const match2 = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match2) {
        try {
          parsed = JSON.parse(match2[0]);
          console.log('Strategy 2 success:', parsed.length, 'records');
        } catch(e) {
          console.error('Strategy 2 failed:', e.message);
        }
      }
    }

    // Strategy 3: Find individual objects and wrap in array
    if (!parsed.length) {
      const objMatches = textBlocks.match(/\{[^{}]*"company"[^{}]*\}/g);
      if (objMatches) {
        try {
          parsed = objMatches.map(m => JSON.parse(m)).filter(Boolean);
          console.log('Strategy 3 success:', parsed.length, 'records');
        } catch(e) {
          console.error('Strategy 3 failed:', e.message);
        }
      }
    }

    if (!parsed.length) {
      console.error('All strategies failed. Full response:', textBlocks.substring(0, 1000));
      return res.status(500).json({ 
        error: 'Could not parse results. The AI may have returned data in an unexpected format.',
        debug: textBlocks.substring(0, 500)
      });
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
      { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: 'Extract contact info. Reply ONLY with this JSON, nothing else: {"first":"","last":"","company":"","title":"","email":"","phone":"","website":""}' }
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
        model: 'claude-haiku-4-5-20251001',
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
    try { parsed = JSON.parse(raw); } catch(e) {}
    res.json({ result: parsed });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('cultivaite proxy running on port ' + PORT);
});
