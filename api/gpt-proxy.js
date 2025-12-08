/**
 * Allen MultiLing ∞ AI — GPT Proxy v12.0.8
 * Build: 2025-12-08
 *
 * 功能：
 *  - AI Chat
 *  - AI Coach（語言學習）
 *  - AI Rewrite-Translate（AI 潤飾翻譯）
 *  - AI Document Clean（文件清洗）
 *
 * API 調用格式：GAS 端透過 X-Api-Key 傳遞 GPT_API_KEY
 */

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

// ---- 讀取環境變數 ----
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("❌ 未設定 OPENAI_API_KEY");
}

function error(msg) {
  return { ok: false, error: msg };
}

// ---- 呼叫 OpenAI ----
async function callOpenAI(systemPrompt, userText) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENAI_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ]
      })
    });

    if (r.status === 401) return error("openai_401");

    const j = await r.json();
    const out = j?.choices?.[0]?.message?.content || "";
    return { ok: true, text: out.trim() };

  } catch (e) {
    console.error(e);
    return error("proxy_error");
  }
}

// ---- API 主入口 ----
app.post("/", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== OPENAI_KEY) {
      return res.json(error("openai_401"));
    }

    const { sid, text, mode } = req.body;
    if (!text || !mode) return res.json(error("missing_param"));

    let sys = "";

    // ============================
    //      四大模式（v12.0.8）
    // ============================

    if (mode === "chat") {
      sys = "你是一位友善的 AI 助理，以自然口吻回答使用者問題。";
    }

    else if (mode === "coach") {
      sys = `
你是一位語言教練。
請依照以下格式回覆：
1. 使用者原句
2. 改良後版本（自然與精準）
3. 語法說明（簡短）
4. 給使用者 1 句延伸練習題
      `.trim();
    }

    else if (mode === "rewriteTranslate") {
      sys = `
你是一位「AI 潤飾翻譯專家」。
請將使用者輸入內容：
1. 自動判斷語言
2. 在不改變原意下優化內容（更清晰、自然、專業）
3. 修正錯誤、語法、標點
4. 若內容像翻譯稿，請重新用更自然的語氣改寫
僅輸出優化後版本。
      `.trim();
    }

    else if (mode === "docClean") {
      sys = `
你是一位文件清理專家。
請將輸入內容：
- 去除雜訊、斷行錯誤、OCR 亂碼
- 修正文句結構
- 維持語意不變
- 輸出乾淨、整齊、可直接用於翻譯的文本
      `.trim();
    }

    else {
      return res.json(error("unknown_mode"));
    }

    const out = await callOpenAI(sys, text);
    return res.json(out);

  } catch (e) {
    console.error(e);
    return res.json(error("proxy_error"));
  }
});

app.listen(3000, () => {
  console.log("GPT Proxy v12.0.8 running on port 3000");
});
