/**
 * Allen MultiLing ∞ AI — Whisper Proxy v12.0.8
 * Build: 2025-12-08
 *
 * 功能：
 *  - 語音辨識（Whisper API）
 *  - 回傳格式完全符合 GAS 主程式需求
 */

import express from "express";
import cors from "cors";
import multer from "multer";

const upload = multer();
const app = express();
app.use(cors());

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("❌ 未設定 OPENAI_API_KEY");
}

function error(msg) {
  return { ok: false, error: msg };
}

// Whisper 模型
const WHISPER_MODEL = "gpt-4o-mini-tts";   // 建議：速度快 / 準確度高

app.post("/", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== OPENAI_KEY) {
      return res.json(error("openai_401"));
    }

    const buf = req.file?.buffer;
    if (!buf) return res.json(error("no_audio"));

    const form = new FormData();
    form.append("file", new Blob([buf]), "audio.m4a");
    form.append("model", "whisper-1");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`
      },
      body: form
    });

    if (r.status === 401) return res.json(error("openai_401"));

    const j = await r.json();
    const txt = j.text || j.result || "";

    return res.json({
      ok: true,
      text: (txt || "").trim()
    });

  } catch (e) {
    console.error(e);
    return res.json(error("proxy_error"));
  }
});

app.listen(3100, () => {
  console.log("Whisper Proxy v12.0.8 running on port 3100");
});
