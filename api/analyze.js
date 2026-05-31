export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType } = req.body || {};

  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Missing image or mediaType' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
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
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
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
                text: `You are analyzing an image to extract nutrition information.

The image will be ONE of these:
(A) A nutrition facts label (white panel with "Nutrition Facts" header, serving size, calories, etc.)
(B) An ingredients label or product packaging
(C) A photo of prepared food or a meal

Your job:

If it's a nutrition label (A or B): READ the values directly from the label. Do not estimate. Use the per-serving values exactly as printed.

If it's a food photo (C): ESTIMATE nutrition for a typical serving of what you see, using standard nutrition databases as a reference.

Look carefully at the entire image. Nutrition labels can be small or at an angle — examine closely.

Respond with ONLY a JSON object, no markdown fences, no explanation before or after:

{
  "name": "short food name (max 5 words)",
  "serving_description": "the serving size shown on the label, or estimated portion (e.g. '1 cup (240ml)', '2 tbsp (30g)', '1 medium apple')",
  "calories": <number>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "confidence": "high" | "medium" | "low",
  "notes": "short note: 'read from label' or 'estimated from photo' or specific caveat"
}

Confidence guide:
- high: clear nutrition label, all values visible
- medium: partially obscured label, OR clear food photo of a standard dish
- low: blurry, ambiguous, or unusual food

If you genuinely cannot identify any food or nutrition information at all, respond with:
{"error": "specific reason — e.g. image is blank, too blurry to read, not food-related"}

Remember: ONLY the JSON object. No other text.`,
              },
            ],
          },
        ],
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Anthropic API error:', response.status, responseText);
      return res.status(response.status).json({
        error: `Claude API error (${response.status})`,
        detail: responseText.slice(0, 300),
      });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid response from Claude API' });
    }

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    let cleaned = text.replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Parse error. Raw text:', text);
      return res.status(500).json({
        error: 'Could not parse Claude response',
        raw: text.slice(0, 300),
      });
    }
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
