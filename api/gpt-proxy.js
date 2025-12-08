// /api/gpt-proxy.js
// Allen MultiLing ∞ AI — GPT Proxy v12.0.8 (No-Express Version)

const {
  PROXY_PRIVATE_KEY,
  ALLOW_GAS_DOMAIN,
  OPENAI_API_KEY,
  GPT_MODEL_CHAT,
  GPT_MODEL_COACH,
  GPT_MODEL_CLEAN,
  GPT_MODEL_REFINE,
} = process.env;

// 共用：解析 JSON body（不依賴 express）
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      // 以防過大 payload（可視需要調整）
      if (raw.length > 1_000_000) {
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

// 依 mode 給不同系統提示
function buildSystemPrompt(mode, payload) {
  const userLang = payload.lang || 'zh-TW';

  switch (mode) {
    case 'coach':
      return (
        'You are a patient language coach for Allen MultiLing ∞ AI users. ' +
        'User base language may be Chinese; target language is in the text. ' +
        'Explain briefly, correct mistakes, and give 1–2 short example sentences. ' +
        'Reply using the same language as the user input unless explicitly asked otherwise.'
      );

    case 'clean':
      return (
        'You are a document cleaner. Keep the **original language**. ' +
        'Normalize spacing, remove duplicated sentences, remove obvious emojis and noise, ' +
        'keep paragraphs where useful, but do not change meaning or tone. ' +
        'Output only the cleaned text, no explanations.'
      );

    case 'refine':
      return (
        'You are a writing assistant. Rewrite the user text to be natural, fluent and clear, ' +
        'but keep the original meaning and approximate length. ' +
        'If the text is Chinese, reply in better Chinese; if English, reply in better English, etc. ' +
        'Do not add explanations, just output the refined text.'
      );

    case 'chat':
    default:
      return (
        'You are Allen MultiLing ∞ AI assistant. ' +
        'Answer naturally, concise but friendly. ' +
        'User interface is LINE, so keep answers suitable for chat.'
      );
  }
}

// 依 mode 選 model
function resolveModel(mode) {
  if (mode === 'coach') return GPT_MODEL_COACH || GPT_MODEL_CHAT || 'gpt-4.1-mini';
  if (mode === 'clean') return GPT_MODEL_CLEAN || GPT_MODEL_CHAT || 'gpt-4.1-mini';
  if (mode === 'refine') return GPT_MODEL_REFINE || GPT_MODEL_CHAT || 'gpt-4.1-mini';
  return GPT_MODEL_CHAT || 'gpt-4.1-mini';
}

// 主處理函式（CommonJS 形式）
module.exports = async (req, res) => {
  // 僅接受 POST
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

  // 金鑰驗證
  if (!PROXY_PRIVATE_KEY || body.key !== PROXY_PRIVATE_KEY) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'INVALID_PROXY_KEY' }));
    return;
  }

  const mode = body.mode || body.type || 'chat';
  const text = body.text || body.content || '';

  if (!text.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'EMPTY_TEXT' }));
    return;
  }

  if (!OPENAI_API_KEY) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'MISSING_OPENAI_API_KEY' }));
    return;
  }

  const model = resolveModel(mode);
  const systemPrompt = buildSystemPrompt(mode, body);

  try {
    const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: mode === 'clean' ? 0 : 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
      }),
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

    const answer = (data.choices?.[0]?.message?.content || '').trim();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      mode,
      model,
      answer,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'UNEXPECTED_ERROR', detail: err.message }));
  }
};
