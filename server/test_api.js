const fs = require('fs');

async function test_gemini() {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const apiKey = config.geminiApiKey;
  console.log('Testing with key:', apiKey.slice(0,10) + '...');
  
  const model = 'gemini-3-pro-image-preview'; // ou 'gemini-3.0-pro-image-preview'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: "Draw a simple red square" }] }],
    generationConfig: { responseModalities: ['IMAGE'], temperature: 1.0 }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log('Status code:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch(e) {
    console.error('Fetch error:', e);
  }
}

test_gemini();
