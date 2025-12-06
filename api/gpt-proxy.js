/************************************************************
 * Allen MultiLing ∞ AI — Proxy v12.0.1 Hybrid Stable
 * File: /api/gpt-proxy.js
 *
 * 功能：
 *  1. AI 聊天       → mode = "chat"
 *  2. AI 語言學習   → mode = "coach"
 *  3. 翻譯潤飾（Tone A1~F1）→ mode = "fix"
 *  4. 檔案文字清理   → mode = "file"
 *
 * 回傳格式（給 GAS 用）一律：
 *  {
 *    ok:   true/false,
 *    mode: "chat" | "coach" | "fix" | "file",
 *    text: "純文字內容",
 *    error: "錯誤代碼" 或 null,
 *    sid:  原樣回傳（可選）
 *  }
 ************************************************************/

/************************************************************
 * 共用小工具
 ************************************************************/

// 帶 timeout 的 fetch
function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    )
  ]);
}

function buildTonePrompt_(tl, tone) {
  const T = (tone || "A1").toUpperCase();
  const isZh = String(tl || "").toLowerCase().startsWith("zh");

  if (isZh) {
    // ===== 繁體中文目標 =====
    switch (T) {
      case "A1":
        return "你是台灣在地語氣的專業口譯員，請將輸入內容翻成自然、口語、好懂的繁體中文，語氣像朋友聊天，但保持原意。";
      case "B1":
        return "你是專業書面譯者，請將輸入內容翻成正式、精準的繁體中文，用於正式文件或公告。";
      case "C1":
        return "你是商業書信與簡報專家，請將內容翻成清楚、專業、具說服力的繁體中文。";
      case "D1":
        return "你是法律文件翻譯專家，請將內容翻成精準、嚴謹、條理清楚的繁體中文，用於合約與法律文本。";
      case "E1":
        return "你是情感溝通教練，請將內容翻成溫柔、真誠、具同理心的繁體中文，適合伴侶或家人之間的對話。";
      case "F1":
        return "你是台灣在地語氣的專業口譯員，請先理解文本是日常、商業、法律或感情溝通，再用最合適的語氣翻成自然的繁體中文。";
      default:
        return "你是專業翻譯員，請將內容翻成自然、清楚的繁體中文。";
    }
  }

  // ===== 非中文目標 =====
  switch (T) {
    case "A1":
      return `You are a professional translator. Translate into ${tl} with a natural, conversational tone while keeping the original meaning.`;
    case "B1":
      return `You are a formal document translator. Translate into ${tl} with precise and formal tone.`;
    case "C1":
      return `You are a business writing specialist. Translate into ${tl} with clear, professional, and persuasive business tone.`;
    case "D1":
      return `You are a legal translator. Translate into ${tl} with rigorous, structured legal tone.`;
    case "E1":
      return `You are a relationship communication coach. Translate into ${tl} with a warm, empathetic tone suitable for emotional dialogue.`;
    case "F1":
      return `You are a professional translator. First infer if the text is daily, business, legal, or emotional, then translate into ${tl} with the best-fitting tone.`;
    default:
      return `You are a professional translator. Translate clearly and naturally into ${tl}.`;
  }
}

function cleanTextForGAS_(s) {
  if (!s) return "";
  return String(s)
    .replace(/```[\s\S]*?```/g, "") // 去掉 code block
    .replace(/\u0000/g, "")         // NULL 字元
    .replace(/\u200B/g, "")         // 零寬空白
    .trim();
}

function splitChunks_(text, maxLen) {
  const s = String(text || "");
  if (s.length <= maxLen) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += maxLen) {
    out.push(s.slice(i, i + maxLen));
  }
  return out;
}

async function callOpenAI_(apiKey, systemPrompt, userText, temperature) {
  const resp = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ]
      })
    },
    20000 // 20 秒 timeout
  );

  if (!resp.ok) {
    const errTxt = await resp.text();
    console.error("OpenAI error:", resp.status, errTxt);
    throw new Error("openai_" + resp.status);
  }

  const data = await resp.json();
  let content = data?.choices?.[0]?.message?.content || "";
  content = cleanTextForGAS_(content);
  return content;
}

/************************************************************
 * mode = "chat"  AI 聊天
 ************************************************************/
async function processChatMode_(apiKey, body) {
  const userText = body.text || "";

  const sys = `
你是一個自然、友善、溫暖的 AI 聊天夥伴。
請用台灣常用的繁體中文回覆，語氣口語、柔和。
請控制在 150～200 字以內，不要太長。
`.trim();

  try {
    let content = await callOpenAI_(apiKey, sys, userText, 0.7);
    if (content.length > 900) {
      content = content.slice(0, 900) + "\n…(內容過長已截斷)";
    }
    return {
      ok: true,
      mode: "chat",
      text: content
    };
  } catch (err) {
    console.error("processChatMode_ err:", err);
    return {
      ok: false,
      mode: "chat",
      error: String(err.message || "chat_error")
    };
  }
}

/************************************************************
 * mode = "coach"  語言學習
 ************************************************************/
async function processCoachMode_(apiKey, body) {
  const userText = body.text || "";

  const sys = `
你是一位溫柔、有耐心的語言教練，請用台灣繁體中文回覆。
規則：
1. 先用 1～2 句簡短回覆使用者問題或給予回應。
2. 再指出語言重點、語氣或文法重點。
3. 若使用者在練習句子，請給 1 個簡短例句作為參考。
4. 整體請控制在 180 字以內。
`.trim();

  try {
    let content = await callOpenAI_(apiKey, sys, userText, 0.6);
    if (content.length > 900) {
      content = content.slice(0, 900) + "\n…(內容過長已截斷)";
    }
    return {
      ok: true,
      mode: "coach",
      text: content
    };
  } catch (err) {
    console.error("processCoachMode_ err:", err);
    return {
      ok: false,
      mode: "coach",
      error: String(err.message || "coach_error")
    };
  }
}

/************************************************************
 * mode = "fix"  翻譯潤飾（Tone A1~F1）
 ************************************************************/
async function processFixMode_(apiKey, body) {
  const text = body.text || "";
  const tl = body.tl || "";
  const tone = body.tone || "A1";

  if (!tl) {
    return {
      ok: false,
      mode: "fix",
      error: "tl_required"
    };
  }

  const sys = buildTonePrompt_(tl, tone);
  const chunks = splitChunks_(text, 1800);
  const results = [];

  try {
    for (const seg of chunks) {
      const segText = String(seg || "").trim();
      if (!segText) continue;

      let out = await callOpenAI_(apiKey, sys, segText, 0.4);
      if (!out) out = segText;
      results.push(out);
    }

    let merged = cleanTextForGAS_(results.join("\n"));
    if (merged.length > 900) {
      merged = merged.slice(0, 900) + "\n…(內容過長已截斷)";
    }

    return {
      ok: true,
      mode: "fix",
      tl: tl,
      text: merged
    };
  } catch (err) {
    console.error("processFixMode_ err:", err);
    return {
      ok: false,
      mode: "fix",
      error: String(err.message || "fix_error")
    };
  }
}

/************************************************************
 * mode = "file"  檔案文字清理（預留將來用）
 ************************************************************/
async function processFileMode_(body) {
  let raw = body.text || "";
  let cleaned = cleanTextForGAS_(raw);

  if (cleaned.length > 4000) {
    cleaned = cleaned.slice(0, 4000) + "\n…(檔案文字過長已截斷)";
  }

  return {
    ok: true,
    mode: "file",
    text: cleaned
  };
}

/************************************************************
 * Router：根據 mode 分流
 ************************************************************/
async function processRouter_(apiKey, body) {
  const mode = String(body.mode || "").toLowerCase();

  if (mode === "chat")  return await processChatMode_(apiKey, body);
  if (mode === "coach") return await processCoachMode_(apiKey, body);
  if (mode === "fix")   return await processFixMode_(apiKey, body);
  if (mode === "file")  return await processFileMode_(body);

  return {
    ok: false,
    mode: mode,
    error: "unknown_mode"
  };
}

/************************************************************
 * Vercel handler（對外入口）
 ************************************************************/
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET：健康檢查
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      engine: "Allen MultiLing ∞ AI — v12.0.1 Hybrid Proxy",
      message: "API is running normally.",
      time: new Date().toISOString()
    });
  }

  // 只接受 POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY_missing"
    });
  }

  const body = req.body || {};

  if (!body.text && body.mode !== "file") {
    return res.status(400).json({
      ok: false,
      error: "missing_text_or_mode"
    });
  }

  try {
    const result = await processRouter_(apiKey, body);

    return res.status(200).json({
      ok:    result.ok,
      mode:  result.mode || null,
      text:  result.text || "",
      error: result.error || null,
      sid:   body.sid || null
    });
  } catch (err) {
    console.error("handler fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "handler_fatal"
    });
  }
};
