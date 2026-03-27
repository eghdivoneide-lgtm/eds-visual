const fs = require('fs');
const KEY = "AIzaSyCFaGldQY40RAa_W-PHQDroIdzIImPDsZg";
const model = 'gemini-3-pro-image-preview';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

const payload = {
  contents: [{ parts: [{ text: "test" }] }],
  generationConfig: { responseModalities: ['IMAGE'], temperature: 1.0 }
};

fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(console.error);
