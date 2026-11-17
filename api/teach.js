const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Use POST to generate a lesson." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") {
      return send(res, 400, { error: "A valid JSON request body is required." });
    }

    const image = typeof body.image === "string" ? body.image : "";
    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match || !ALLOWED_MIME.has(match[1])) {
      return send(res, 400, { error: "Upload a valid PNG, JPG, or WEBP screenshot." });
    }

    const mime = match[1];
    const encoded = match[2].replace(/\s/g, "");
    const imageBytes = Buffer.from(encoded, "base64");
    if (!imageBytes.length || imageBytes.length > MAX_IMAGE_BYTES) {
      return send(res, 413, { error: "The optimized screenshot must be 3 MB or smaller." });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return send(res, 500, { error: "The server is missing OPENAI_API_KEY. Add it to the Vercel project's Environment Variables." });
    }

    const page = Math.max(1, Math.min(99999, Number.parseInt(body.page, 10) || 1));
    const question = typeof body.question === "string" ? body.question.slice(0, 3000).trim() : "";
    const bookUrl = typeof body.book_url === "string" ? body.book_url.slice(0, 1500) : "";
    const prompt = [
      "You are Flipbook Sensei, an expert, patient classroom teacher.",
      "Teach the learner from the supplied screenshot. Treat the screenshot as the source of truth.",
      "Never invent text that is not visible. If any part is unclear, say so.",
      "Explain in clear, natural English and format the lesson with useful headings.",
      "Include: (1) Page overview, (2) Teacher-style explanation step by step, (3) Important vocabulary and meanings, (4) Grammar or concepts when visible, (5) Natural examples clearly labelled as your own examples, (6) Quick recap, (7) Three short practice questions, and (8) Answer key at the end.",
      "For Japanese content, preserve the Japanese writing and include kana readings, romaji, and English meanings whenever legible. Explain usage naturally, not just word-for-word.",
      "Be encouraging and thorough, but do not pad the explanation.",
      "",
      "Book URL (context only; do not rely on its contents): " + (bookUrl || "not provided"),
      "Page number: " + page,
      "Learner's request: " + (question || "Please teach me everything important on this page.")
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          temperature: 0.35,
          max_tokens: 2200,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: "data:" + mime + ";base64," + encoded, detail: "high" } }
            ]
          }]
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = result?.error?.message || "The AI provider rejected the request.";
      return send(res, 502, { error: "AI service error: " + String(detail).slice(0, 600) });
    }

    const explanation = result?.choices?.[0]?.message?.content;
    if (typeof explanation !== "string" || !explanation.trim()) {
      return send(res, 502, { error: "The AI returned an empty lesson. Please try again." });
    }

    return send(res, 200, {
      explanation: explanation.trim(),
      model: result.model || process.env.OPENAI_MODEL || "gpt-4.1-mini"
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return send(res, 504, { error: "The lesson request timed out. Please try again." });
    }
    if (error instanceof SyntaxError) {
      return send(res, 400, { error: "Invalid JSON request. Please refresh and try again." });
    }
    return send(res, 500, { error: "Unexpected server error: " + String(error?.message || error).slice(0, 300) });
  }
}
