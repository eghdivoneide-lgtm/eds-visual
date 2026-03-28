const express = require('express');
const cors = require('cors');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PROJECT_ID = 'gen-lang-client-0033369940';
const LOCATION = 'us-central1';

// Carregar config (Gemini key do env ou do arquivo)
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
}
if (process.env.GEMINI_API_KEY) {
  config.geminiApiKey = process.env.GEMINI_API_KEY;
}

// Autenticação Vertex: variável de ambiente ou arquivo local
let auth;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  auth = new GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/generative-language',
    ],
  });
} else {
  const KEY_PATH = path.join(__dirname, 'chave-vertex.json');
  auth = new GoogleAuth({
    keyFile: KEY_PATH,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/generative-language',
    ],
  });
}

const app = express();
app.use(express.static(path.join(__dirname, '../')));
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..')));

app.get('/health', (req, res) => res.json({
  status: 'ok',
  geminiKeyConfigured: !!config.geminiApiKey,
  project: PROJECT_ID
}));

app.post('/api/configurar-key', (req, res) => {
  const { geminiApiKey } = req.body;
  if (!geminiApiKey || !geminiApiKey.startsWith('AIza'))
    return res.status(400).json({ erro: 'API Key inválida. Deve começar com AIza' });
  config.geminiApiKey = geminiApiKey;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('[EDS Visual] ✅ Gemini API Key configurada!');
  res.json({ sucesso: true });
});

async function getAccessToken() {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// ─── Etapa 1: Análise detalhada da foto (igual ao "Thoughts" do AI Studio) ─
async function analisarFoto(imagemBase64, mimeType) {
  if (!config.geminiApiKey) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;

  const payload = {
    contents: [{
      parts: [
        {
          text: `Analise esta foto e descreva com MÁXIMO DETALHE:
1. QUANTAS pessoas há na imagem e suas posições (ex: "homem atrás à esquerda")
2. Para CADA pessoa: tom de pele exato, cor e estilo de cabelo, expressão, roupa (cor e tipo), acessórios (óculos, etc), pose e gestos
3. O cenário/fundo da foto
4. A relação entre as pessoas (família, grupo, etc)

Seja extremamente preciso. Esta descrição será usada para transformar a foto em arte preservando cada detalhe.`
        },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: imagemBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) {
    console.log(`[EDS Visual] 📋 Análise concluída (${text.length} chars)`);
    return text;
  }
  return null;
}

// ─── Etapa 2: Transformação artística com contexto enriquecido ─────────────
const SYSTEM_INSTRUCTION = `Você é o ARTISTA VISUAL IA MASTER — especialista de elite em transformação e reimaginação artística de imagens.

REGRAS ABSOLUTAS — NUNCA VIOLE:
1. PRESERVE com precisão ABSOLUTA: tom de pele exato, cor de cabelo, forma do rosto, etnia, e raça de CADA pessoa.
2. MANTENHA o número exato de pessoas, suas posições relativas e poses.
3. PRESERVE roupas, acessórios e gestos das pessoas originais.
4. APLIQUE o estilo artístico no cenário e na renderização, não nas características das pessoas.
5. RESOLUÇÃO e riqueza visual MÁXIMAS — nenhum detalhe pode ser perdido.
6. NUNCA mude etnia, cor de pele, ou traços faciais raciais.`;

const GEMINI_MODELS_IMAGE = [
  'gemini-3-pro-image-preview',            // ⭐ Nano Banana Pro (melhor — AI Studio)
  'gemini-3.0-pro-image-preview',          // variante
  'gemini-2.5-pro-exp-03-25',             // 2.5 Pro experimental
  'gemini-2.0-flash-exp-image-generation', // Flash image gen
  'gemini-2.0-flash-exp',
];

async function gerarTransformacaoGemini(promptEstilo, descricaoFoto, imagemBase64, mimeType) {
  if (!config.geminiApiKey) throw new Error('API Key não configurada');

  // Prompt enriquecido com a análise da foto
  const promptFinal = descricaoFoto
    ? `DESCRIÇÃO DETALHADA DAS PESSOAS NA FOTO:\n${descricaoFoto}\n\n---\n\nTRANSFORMAÇÃO SOLICITADA:\n${promptEstilo}\n\nIMPORTANTE: Use a descrição acima para preservar CADA detalhe físico das pessoas ao aplicar o estilo.`
    : promptEstilo;

  const errors = [];
  for (const model of GEMINI_MODELS_IMAGE) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;

      const payload = {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{
          parts: [
            { text: promptFinal },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imagemBase64 } }
          ]
        }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 1.0,
        }
      };

      console.log(`[EDS Visual] 🎨 Gerando com modelo: ${model}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        errors.push(`${model}: ${data.error?.message?.slice(0, 100) || 'erro'}`);
        continue;
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find(p => p.inlineData || p.inline_data);
      if (!imgPart) {
        errors.push(`${model}: sem imagem`);
        continue;
      }

      const inline = imgPart.inlineData || imgPart.inline_data;
      console.log(`[EDS Visual] ⭐ Sucesso: ${model}`);
      return { imagemBase64: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png', modelo: model };
    } catch (e) {
      errors.push(`${model}: ${e.message.slice(0, 80)}`);
    }
  }
  throw new Error('Modelos Gemini indisponíveis:\n' + errors.join('\n'));
}

// ─── Fallback: Imagen 3 via Vertex AI ─────────────────────────────────────
async function gerarComImagen(promptEstilo, descricaoFoto, imagemBase64, token) {
  const model = 'imagen-3.0-capability-001';
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:predict`;

  const promptFinal = descricaoFoto
    ? `${promptEstilo}. PESSOAS NA FOTO: ${descricaoFoto.slice(0, 500)}`
    : promptEstilo;

  const payload = {
    instances: [{
      prompt: promptFinal,
      referenceImages: [{
        referenceType: 'REFERENCE_TYPE_SUBJECT',
        referenceId: 1,
        referenceImage: { bytesBase64Encoded: imagemBase64 },
        subjectImageConfig: { subjectType: 'SUBJECT_TYPE_PERSON' }
      }]
    }],
    parameters: {
      sampleCount: 1, aspectRatio: '1:1', safetyFilterLevel: 'block_few',
      personGeneration: 'allow_all', outputMimeType: 'image/png',
      addWatermark: false, enhancedPrompt: false,
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || 'Imagen falhou');
  if (!data.predictions?.[0]?.bytesBase64Encoded) throw new Error('Imagen: sem imagem');

  return { imagemBase64: data.predictions[0].bytesBase64Encoded, mimeType: 'image/png', modelo: 'imagen-3.0-capability-001' };
}

// ─── Rota principal ────────────────────────────────────────────────────────
app.post('/api/gerar-imagem', async (req, res) => {
  try {
    const { prompt, imagemBase64, mimeType } = req.body;
    if (!prompt || !imagemBase64) return res.status(400).json({ erro: 'Prompt e imagem são obrigatórios.' });

    // ETAPA 1: Analisar a foto para extrair descrição detalhada das pessoas
    console.log('[EDS Visual] 📸 Etapa 1: Analisando foto...');
    const descricaoFoto = await analisarFoto(imagemBase64, mimeType);

    let resultado = null;

    // ETAPA 2: Gerar a transformação artística com contexto enriquecido
    try {
      resultado = await gerarTransformacaoGemini(prompt, descricaoFoto, imagemBase64, mimeType);
    } catch (e1) {
      console.warn('[EDS Visual] Gemini indisponível:', e1.message.slice(0, 120));
      console.log('[EDS Visual] Usando Imagen 3 (fallback)...');
      const token = await getAccessToken();
      resultado = await gerarComImagen(prompt, descricaoFoto, imagemBase64, token);
    }

    console.log(`[EDS Visual] ✅ Arte gerada — ${resultado.modelo} | ${Math.round(resultado.imagemBase64.length / 1024)}KB`);
    res.json({ sucesso: true, imagemBase64: resultado.imagemBase64, mimeType: resultado.mimeType, modelo: resultado.modelo });

  } catch (err) {
    console.error('[EDS Visual] ❌ Erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  const status = config.geminiApiKey ? '✅ Gemini API Key ativa (gemini-3-pro-image-preview)' : '⚠️  Configure API Key para qualidade máxima';
  console.log(`\n🎨 EDS Visual v2 | http://localhost:${PORT}`);
  console.log(`   ${status}`);
  console.log(`   Modo: Análise foto → Transformação artística (2 etapas)\n`);
});
