// Vercel serverless function — keeps your API key safe on the server
// File path: /api/analyze.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType } = req.body;

  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Missing image or mediaType' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: image },
              },
              {
                type: 'text',
                text: `Analyze this image and extract nutrition information. The image may be:
1. A nutrition facts label - read the per-serving values exactly
2. A photo of food - estimate nutrition per typical serving

Respond ONLY with a valid JSON object, no markdown, no preamble:
{
  "name": "short food name, max 5 words",
  "serving_description": "e.g. '1 cup (240ml)' or '1 medium apple' or '2 tbsp (30g)'",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "confidence": "high" | "medium" | "low",
  "notes": "brief note if estimated vs. read from label"
}

If you cannot identify food or nutrition info, respond with:
{"error": "brief reason"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return res.status(response.status).json({ error: 'Analysis failed' });
    }

    const data = await response.json();
    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const cleaned = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Parse error:', text);
      return res.status(500).json({ error: 'Could not parse response' });
    }
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
