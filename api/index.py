import base64
import json
import os
import re
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}


def send_json(handler, status, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True})

    def do_GET(self):
        send_json(self, 405, {"error": "Use POST to generate a lesson."})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_IMAGE_BYTES * 2:
                return send_json(self, 413, {"error": "Request is empty or too large."})
            payload = json.loads(self.rfile.read(length))
            image = payload.get("image", "")
            question = str(payload.get("question", "")).strip()
            page = max(1, min(int(payload.get("page", 1)), 99999))
            book_url = str(payload.get("book_url", "")).strip()

            match = re.fullmatch(r"data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)", image)
            if not match:
                return send_json(self, 400, {"error": "Upload a PNG, JPG, or WEBP screenshot."})
            mime_type, encoded = match.groups()
            raw_image = base64.b64decode(encoded, validate=True)
            if len(raw_image) > MAX_IMAGE_BYTES:
                return send_json(self, 413, {"error": "Image must be 8 MB or smaller."})

            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return send_json(self, 500, {"error": "OPENAI_API_KEY is missing. Add it in Vercel Project Settings → Environment Variables, then redeploy."})

            model = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
            prompt = (
                "You are Flipbook Sensei, a warm, highly effective teacher. Teach the learner using ONLY "
                "what is visible in the supplied lesson-page image for factual lesson content. Do not invent "
                "text that cannot be read. If something is unclear, say so. Explain in clear, natural English. "
                "Structure the response with: 1) Page overview, 2) Teach the content step by step, "
                "3) Important vocabulary or terms, 4) Examples (label any examples you create), "
                "5) Quick recap, 6) Three short check-your-understanding questions with answers hidden "
                "at the end under 'Answer key'. If the page is Japanese, preserve Japanese writing and "
                "include readings/romaji and meanings when legible. Keep the lesson engaging and not overly verbose.\n\n"
                f"Book URL (context only): {book_url or 'not provided'}\n"
                f"Page number: {page}\n"
                f"Learner request: {question or 'Please teach me everything important on this page.'}"
            )
            body = {
                "model": model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{mime_type};base64,{encoded}",
                            "detail": "high"
                        }}
                    ]
                }],
                "temperature": 0.4,
                "max_tokens": 1800
            }
            request = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=json.dumps(body).encode("utf-8"),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(request, timeout=55) as response:
                    result = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                try:
                    detail = json.loads(detail).get("error", {}).get("message", detail)
                except Exception:
                    pass
                return send_json(self, 502, {"error": f"OpenAI API error: {detail[:700]}"})
            except Exception as exc:
                return send_json(self, 502, {"error": f"Could not reach OpenAI: {str(exc)}"})

            explanation = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not explanation:
                return send_json(self, 502, {"error": "The AI returned an empty lesson. Please try again."})
            return send_json(self, 200, {"explanation": explanation, "model": model})
        except (ValueError, json.JSONDecodeError):
            return send_json(self, 400, {"error": "Invalid request. Please refresh and try again."})
        except Exception as exc:
            return send_json(self, 500, {"error": f"Unexpected server error: {str(exc)[:300]}"})
