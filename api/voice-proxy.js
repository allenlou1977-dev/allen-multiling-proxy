// /api/voice-proxy.js
// Allen MultiLing ∞ AI — Whisper Proxy v12.0.8 (No-Express Version)

const {
  AUDIO_API_KEY,
  WHISPER_API_KEY,
  OPENAI_API_KEY,
  WHISPER_MODEL,
} = process.env;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const json = JSON.parse(raw);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }));
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'INVALID_JSON', detail: err.message }));
    return;
  }

  // 金鑰驗證（與 GAS 的 AUDIO_API_KEY 對應）
  const clientKey = body.key || body.audioKey;
  if (!AUDIO_API_KEY || clientKey !== AUDIO_API_KEY) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'INVALID_AUDIO_KEY' }));
    return;
  }

  const apiKey = WHISPER_API_KEY || OPENAI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'MISSING_OPENAI_API_KEY' }));
    return;
  }

  const model = WHISPER_MODEL || 'whisper-1';

  // GAS 端請傳 audioBase64 + mimeType
  const audioBase64 = body.audioBase64;
  const mimeType = body.mimeType || 'audio/m4a';
  const language = body.language || ''; // 可留空：自動偵測

  if (!audioBase64) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'MISSING_AUDIO_BASE64' }));
    return;
  }

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const fileName = body.fileName || 'audio.m4a';

    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('model', model);
    if (language) form.append('language', language);

    const apiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: false,
        error: 'OPENAI_ERROR',
        status: apiRes.status,
        detail: data,
      }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      model,
      text: data.text || '',
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'UNEXPECTED_ERROR', detail: err.message }));
  }
};
