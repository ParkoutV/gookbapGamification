import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to read db.properties
function getOllamaConfig() {
  let apiUrl = process.env.OLLAMA_API_URL;
  let model = process.env.OLLAMA_MODEL;
  let apiKey = process.env.OLLAMA_API_KEY;

  try {
    const propertiesPath = path.join(process.cwd(), 'db.properties');
    if (fs.existsSync(propertiesPath)) {
      const content = fs.readFileSync(propertiesPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('#') || !line.includes('=')) continue;
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key.trim() === 'OLLAMA_API_URL') apiUrl = apiUrl || value;
        if (key.trim() === 'OLLAMA_MODEL') model = model || value;
        if (key.trim() === 'OLLAMA_API_KEY') apiKey = apiKey || value;
      }
    }
  } catch (err) {
    console.warn('Could not read db.properties, falling back to process.env', err);
  }

  // Ensure trailing slashes are removed from the URL
  if (apiUrl && apiUrl.endsWith('/')) {
    apiUrl = apiUrl.slice(0, -1);
  }

  return {
    apiUrl: apiUrl || 'http://localhost:11434',
    model: model || 'llava',
    apiKey: apiKey || ''
  };
}

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Extract the raw base64 string without the data URI prefix
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const config = getOllamaConfig();
    const ollamaUrl = config.apiUrl;
    const modelName = config.model;
    const apiKey = config.apiKey;

    const receiptId = Date.now();

    const prompt = `
You are a receipt parser. Extract the following information from the receipt image and translate it to Korean as well.
Output ONLY a JSON array containing exactly two objects. The first object should be the original Japanese (or language of the receipt) data with "language": "ja". The second object should be the exact same receipt translated into Korean with "language": "ko".

Each object must follow this exact schema:
- "id": ${receiptId} (integer)
- "language": "ja" or "ko" (string)
- "date": Payment date and time in "YYYY-MM-DDTHH:mm:ss" format (string)
- "store": Store name (string)
- "unit_name": Array of item names (string array)
- "unit_price": Array of item prices (integer array)
- "unit_amount": Array of item quantities (integer array)
- "unit_total": Array of item totals (unit_price * unit_amount) (integer array)
- "sub_total": Subtotal excluding tax (integer)
- "tax": Tax amount (integer)
- "total": Total amount (integer)

Example output format:
[
  {
    "id": ${receiptId},
    "language": "ja",
    "date": "2026-06-28T13:20:00",
    "store": "セブンイレブン",
    "unit_name": ["おにぎり"],
    "unit_price": [150],
    "unit_amount": [2],
    "unit_total": [300],
    "sub_total": 300,
    "tax": 30,
    "total": 330
  },
  {
    "id": ${receiptId},
    "language": "ko",
    ... (Korean translation)
  }
]

Respond ONLY with the JSON array. Do not wrap in markdown blocks like \`\`\`json.
`;

    // Prepare headers, including the API key if it exists
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Check if the provided URL is pointing to an OpenAI compatible endpoint (e.g., ends with /v1 or includes chat/completions)
    const isV1 = ollamaUrl.endsWith('/v1') || ollamaUrl.includes('chat/completions');
    let endpoint = `${ollamaUrl}/api/generate`;
    let payload: any = {};

    if (isV1) {
      // Fix endpoint URL if it just ends with /v1
      endpoint = ollamaUrl.endsWith('/v1') ? `${ollamaUrl}/chat/completions` : ollamaUrl;
      payload = {
        model: modelName,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/webp;base64,${base64Data}` } }
            ]
          }
        ]
      };
    } else {
      payload = {
        model: modelName,
        prompt: prompt,
        stream: false,
        images: [base64Data]
      };
    }

    // Make the request to the endpoint
    const ollamaResponse = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error('LLM API error:', errorText);
      return NextResponse.json({ error: `Failed to communicate with LLM server: ${errorText}` }, { status: 500 });
    }

    const data = await ollamaResponse.json();
    let parsedData = [];

    try {
      // Extract response string based on API standard (Ollama Native vs OpenAI V1)
      const rawResponse = isV1 ? data.choices?.[0]?.message?.content : data.response;
      
      if (!rawResponse) {
        throw new Error("Empty response from LLM");
      }

      // Sometimes LLMs wrap JSON in markdown block even if told not to
      const jsonStr = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedData = JSON.parse(jsonStr);
      
      // Ensure the parsed data is an array, if not, try to wrap it
      if (!Array.isArray(parsedData)) {
         parsedData = [parsedData];
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', isV1 ? data.choices?.[0]?.message?.content : data.response);
      return NextResponse.json({ error: 'Failed to parse the receipt data from the LLM response.' }, { status: 500 });
    }

    return NextResponse.json(parsedData);

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
