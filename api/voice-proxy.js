/***************************************************************
 *  Allen MultiLing ∞ AI — Whisper Proxy v12.0.8
 *  Build: 2025-12-08 (Asia/Taipei)
 *
 *  🔊 功能說明
 *    - 接收 GAS 傳來的語音 Base64
 *    - 呼叫 OpenAI Audio API（Whisper / gpt-4o-transcribe 等）
 *    - 回傳純文字逐字稿（支援 transcribe / translate）
 *
 *  📦 需設定的 Vercel Environment Variables
 *    - WHISPER_API_KEY  : 給 GAS 的「語音外掛金鑰」，用來驗證 Proxy 呼叫
 *    - WHISPER_MODEL    : Whisper / Transcribe 模型名稱，例如：
 *                         whisper-1 或 gpt-4o-transcribe
 *    - OPENAI_API_KEY   : 你的 OpenAI 金鑰（sk-proj-xxxx）
 *
 *  🔐 GAS Script Properties 對應
 *    - VOICE_EXT_URL  = https://allen-multiling-proxy.vercel.app/api/voice-proxy
 *    - AUDIO_API_KEY  = 和 WHISPER_API_KEY 相同的一組字串
 *
 *  📥 請求格式（POST /api/voice-proxy）
 *    {
 *      "key"        : "AllenMultiLing-WhisperKey-2025",
 *      "audioBase64": "<m4a/mp3 之 Base64 字串>",
 *      "mimeType"   : "audio/m4a",
 *      "language"   : "th",              // 可選，BCP-47；transcribe 時可指定
 *      "task"       : "transcribe"       // 可選：transcribe | translate（預設 transcribe）
 *    }
 *
 *  📤 回應格式（成功）
 *    {
 *      "ok"  : true,
 *      "text": "<辨識後文字>",
 *      "raw" : { ...OpenAI 原始回傳 JSON... }
 *    }
 *
 *  📤 回應格式（常見錯誤）
 *    { "ok": false, "error": "METHOD_NOT_ALLOWED" }
 *    { "ok": false, "error": "INVALID_PROXY_KEY" }
 *    { "ok": false, "error": "MISSING_AUDIO_BASE64" }
 *    { "ok": false, "error": "MISSING_OPENAI_API_KEY" }
 *    { "ok": false, "error": "OPENAI_ERROR", "status": 400/401/500..., "detail": ... }
 *    { "ok": false, "error": "INTERNAL_ERROR", "detail": "..." }
 ***************************************************************/

export default async function handler(req, res) {
  // 只允許 POST
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    // --- 解析 Body ----------------------------------------------------------
    const bodyRaw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const body = bodyRaw ? JSON.parse(bodyRaw) : {};

    const {
      key,
      audioBase64,
      mimeType,
      language,
      task,
    } = body;

    // --- Proxy 金鑰驗證（GAS ↔ Vercel）--------------------------------------
    const proxyKey = process.env.WHISPER_API_KEY;
    if (!proxyKey) {
      res.status(500).json({
        ok: false,
        error: 'MISSING_WHISPER_API_KEY',
        detail: 'WHISPER_API_KEY is not set in environment variables.',
      });
      return;
    }

    if (!key || key !== proxyKey) {
      res.status(401).json({ ok: false, error: 'INVALID_PROXY_KEY' });
      return;
    }

    // --- 基本參數檢查 ------------------------------------------------------
    if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.trim() === '') {
      res.status(400).json({ ok: false, error: 'MISSING_AUDIO_BASE64' });
      return;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      res.status(500).json({
        ok: false,
        error: 'MISSING_OPENAI_API_KEY',
        detail: 'OPENAI_API_KEY is not set in environment variables.',
      });
      return;
    }

    const model = process.env.WHISPER_MODEL || 'whisper-1';
    const useTask = task === 'translate' ? 'translate' : 'transcribe';

    // --- 準備送給 OpenAI 的 multipart/form-data ----------------------------
    const buffer = Buffer.from(audioBase64, 'base64');
    const ext =
      (mimeType && mimeType.includes('/'))
        ? mimeType.split('/')[1]
        : 'm4a';
    const filename = `audio.${ext}`;

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType || 'audio/m4a' });

    form.append('file', blob, filename);
    form.append('model', model);

    // transcribe 可以帶入 language，translate 則讓模型自判
    if (language && useTask === 'transcribe') {
      form.append('language', language);
    }

    const endpoint =
      useTask === 'translate'
        ? 'https://api.openai.com/v1/audio/translations'
        : 'https://api.openai.com/v1/audio/transcriptions';

    // --- 呼叫 OpenAI Audio API ---------------------------------------------
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: form,
    });

    const text = await apiRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }

    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        ok: false,
        error: 'OPENAI_ERROR',
        status: apiRes.status,
        detail: data || text,
      });
      return;
    }

    const transcript = (data && data.text) || '';

    res.status(200).json({
      ok: true,
      text: transcript,
      raw: data,
    });
  } catch (err) {
    console.error('[Whisper Proxy] INTERNAL_ERROR', err);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      detail: String(err && err.message ? err.message : err),
    });
  }
}
