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
      "Write the entire lesson in natural, conversational Filipino/Tagalog, as if a confident and patient Filipino classroom teacher is speaking directly to students. Keep Japanese words, kana, kanji, and romaji accurate; explain their meanings in Tagalog.",
      "Create a READY-TO-READ TEACHER SCRIPT, not merely notes. Use first-person teacher lines such as 'Class, pag-aralan natin...' and include transitions, simple explanations, and questions the teacher can ask students. Make it sound natural when spoken aloud.",
      "Use these sections: (1) Pamagat at layunin ng aralin, (2) Teacher Script — a complete spoken lesson with stage cues like [Isulat sa pisara] only when useful, (3) Mahahalagang bokabularyo with Japanese, kana reading, romaji, and Tagalog meaning, (4) Paliwanag sa grammar/concepts, (5) Mga halimbawang pangungusap with Tagalog translations, (6) Pakikipag-ugnayan — questions the teacher can ask the class, (7) Maikling pagbubuod, (8) Practice questions for students, and (9) Answer key in a separate final section.",
      "For Japanese content, preserve the Japanese writing and include kana readings, romaji, and English meanings whenever legible. Explain usage naturally, not just word-for-word.",
      "Be encouraging and thorough, but do not pad the explanation.",
      "",
      "Book URL (context only; do not rely on its contents): " + (bookUrl || "not provided"),
      "Page number: " + page,
      "Learner request: " + (question || "Ituro ang lahat ng mahahalagang nilalaman ng pahina sa Tagalog at gumawa ng kumpletong script na maaari kong basahin at gamitin bilang guro.")
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
