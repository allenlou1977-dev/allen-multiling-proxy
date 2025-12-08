export default async function handler(req, res) {
  // 只允許 POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const {
      key,      // 你的 PROXY_PRIVATE_KEY
      text,     // input 文字
      mode,     // chat / refine / coach
      systemMsg // 可選：自訂 System prompt
    } = req.body;

    // 驗證 Proxy 金鑰
    if (key !== process.env.PROXY_PRIVATE_KEY) {
      return res.status(401).json({ ok: false, error: "INVALID_PROXY_KEY" });
    }

    // 取出 OpenAI 金鑰
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const PROJECT_ID = process.env.OPENAI_PROJECT_ID || null;

    if (!OPENAI_KEY) {
      return res.status(400).json({ ok: false, error: "MISSING_OPENAI_KEY" });
    }

    // 判斷金鑰格式
    const useProjectHeader = OPENAI_KEY.startsWith("sk-proj");

    // OpenAI API endpoint
    const url = "https://api.openai.com/v1/chat/completions";

    const messages = [
      { role: "system", content: systemMsg || "You are a helpful AI assistant." },
      { role: "user", content: text }
    ];

    // 組建 headers
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`
    };

    // 若是 sk-proj 金鑰 → 必須補 OpenAI-Project header
    if (useProjectHeader && PROJECT_ID) {
      headers["OpenAI-Project"] = PROJECT_ID;
    }

    // 呼叫 OpenAI
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.4
      })
    });

    const data = await response.json();

    // 若 OpenAI 回錯誤，直接回傳
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.error || "OPENAI_ERROR"
      });
    }

    return res.status(200).json({
      ok: true,
      output: data.choices?.[0]?.message?.content || "",
      raw: data
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      detail: err.message
    });
  }
}
