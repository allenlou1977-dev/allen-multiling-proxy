/************************************************************
 * Allen MultiLing ∞ AI — Whisper Proxy v12.0.1
 * File: /api/voice-proxy.js
 *
 * 功能：
 *  - 接收 GAS 傳來的 audio bytes（LINE 錄音）
 *  - 呼叫 OpenAI /audio/transcriptions
 *  - 回傳純文字結果給 GAS
 *
 * 回傳格式（給 GAS 用）：
 *  {
 *    ok:   true/false,
 *    sid:  "user / group id",
 *    text: "辨識後文字",
 *    error: "錯誤代碼" 或 null
 *  }
 ************************************************************/

module.exports = async function handler(req, res) {
  // 只允許 POST（GET 只用來確認連線時會看到錯誤訊息）
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      error: "POST only"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY_missing"
      });
    }

    // 讀取 GAS 傳來的 audio bytes
    const userId = req.headers["x-user-id"] || "unknown-user";

    // Next / Vercel Node runtime：音訊在 req.body（Buffer）
    const audioBuffer = req.body;
    if (!audioBuffer || !audioBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "no_audio_data"
      });
    }

    // 建立 multipart/form-data
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: "audio/m4a" }), "audio.m4a");
    // 建議仍使用 whisper-1：最穩定的語音辨識模型
    form.append("model", "whisper-1");
    form.append("response_format", "text");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text();
      console.error("OpenAI STT error:", openaiRes.status, errTxt);
      return res.status(500).json({
        ok: false,
        sid: userId,
        error: "openai_" + openaiRes.status
      });
    }

    const text = await openaiRes.text();

    return res.status(200).json({
      ok: true,
      sid: userId,
      text: text
    });
  } catch (err) {
    console.error("voice-proxy fatal:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "unknown_error"
    });
  }
};
