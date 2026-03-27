const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');

// Criação da função API exportada
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', serverless: true }));

// ─── Lógica central Serverless ─────────────────────────────────────────────
app.post('/api/gerar-imagem', async (req, res) => {
  try {
    const { prompt, imagemBase64, mimeType } = req.body;
    
    // Obter API Key diretamente dos Headers (enviado pelo localStorage do frontend) !!
    let apiKey = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.split(' ')[1];
    }
    
    if (!prompt || !imagemBase64) return res.status(400).json({ erro: 'Prompt e imagem são obrigatórios.' });
    if (!apiKey) return res.status(401).json({ erro: 'API Key do Gemini não informada no Header (clique na engrenagem no topo).' });

    console.log('[Netlify-EDS] 📸 Etapa 1: Analisando foto via Serverless...');

    // Função de Análise
    async function analisarFoto(img64, mime) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [
          { text: `Analise esta foto e descreva com MÁXIMO DETALHE:
1. QUANTAS pessoas há na imagem e suas posições
2. Para CADA pessoa: tom de pele exato, cor e estilo de cabelo, expressão, roupa, acessórios, pose
3. O cenário/fundo da foto
Seja extremamente preciso. Esta descrição será usada para reter características originais.` },
          { inline_data: { mime_type: mime || 'image/jpeg', data: img64 } }
        ]}],
        generationConfig: { temperature: 0.1 }
      };

      try {
        const resp = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const d = await resp.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || null;
      } catch (e) {
        return null; // Falhou graciosamente
      }
    }

    const descricaoFoto = await analisarFoto(imagemBase64, mimeType);

    // Função Transformacao
    const SYSTEM_INSTRUCTION = `Você é o ARTISTA VISUAL IA MASTER — especialista de elite em transformação artística.
REGRAS ABSOLUTAS:
1. PRESERVE com precisão ABSOLUTA: tom de pele, cor de cabelo, forma do rosto, etnia de CADA pessoa.
2. MANTENHA o número exato de pessoas e poses.
3. PRESERVE roupas e gestos.
4. APLIQUE estilo no cenário, não nas características antropológicas corporais.
5. NUNCA mude etnia, pele, ou traços raciais.`;

    const promptFinal = descricaoFoto
      ? `DESCRIÇÃO DETALHADA DAS PESSOAS NA FOTO:\n${descricaoFoto}\n\n---\n\nTRANSFORMAÇÃO SOLICITADA:\n${prompt}\n\nIMPORTANTE: Use a descrição acima para preservar CADA detalhe físico das pessoas.`
      : prompt;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`;
    const payload = {
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [
            { text: promptFinal },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imagemBase64 } }
        ]}],
        generationConfig: { responseModalities: ['IMAGE'], temperature: 1.0 }
    };

    console.log('[Netlify-EDS] 🎨 Gerando arte com gemini-3-pro-image-preview...');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error?.message || 'Falha ao processar a imagem no Gemini.');
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData || p.inline_data);
    
    if (!imgPart) throw new Error('O modelo não retornou uma imagem.');
    const inline = imgPart.inlineData || imgPart.inline_data;

    res.json({
        sucesso: true, 
        imagemBase64: inline.data, 
        mimeType: inline.mimeType || inline.mime_type || 'image/png', 
        modelo: 'gemini-3-pro-image-preview (Serverless)'
    });

  } catch (err) {
    console.error('[Netlify-EDS] ❌ Erro:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// Exporta o Express embrulhado no Serveless para o formato Lambda do Netlify
module.exports.handler = serverless(app);
