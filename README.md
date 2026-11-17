# Flipbook Sensei

A clean FlipHTML5 companion that displays a flipbook beside an AI teacher. The learner uploads a screenshot of the current page; the server sends that image to OpenAI Vision and returns a structured, teacher-style explanation.

## Features

- Responsive two-column learning workspace (book preview + AI teacher)
- Opens FlipHTML5 links directly in an embedded viewer
- Page navigation helper using the FlipHTML5 `#p=` page fragment
- Screenshot-based explanations grounded in the visible page
- Vocabulary, grammar/terms, examples, recap, and short comprehension checks
- OpenAI key stays on the server; it is never exposed to browser JavaScript
- Vercel deployment; no Render account or separate backend host required

## Deploy on Vercel

1. Open [Vercel](https://vercel.com/new) and import `bourne2398/flipbook-sensei`.
2. Keep the project root as the Root Directory.
3. Add an Environment Variable:
   - Name: `OPENAI_API_KEY`
   - Value: your OpenAI API key
   - Environments: Production, Preview, and Development as needed
4. Deploy. Redeploy after changing environment variables.

Optional:
- `OPENAI_MODEL`: defaults to `gpt-4.1-mini`.

## Use

1. Open the deployed site.
2. Paste a public FlipHTML5 URL and click **Open flipbook**.
3. Navigate to the page in the viewer.
4. Take a screenshot of that page and upload it under **Add a page screenshot**.
5. Ask Sensei to teach the page and click **Teach this page**.

## Important note about the flipbook

FlipHTML5 content is hosted on another domain. Browser security prevents this app from reading the flipbook iframe's page contents automatically. Uploading a screenshot is the reliable way to let the AI inspect the exact lesson page. The book itself remains embedded and viewable in the app.

## API

`POST /api/explain` accepts JSON with:
- `image`: a PNG/JPEG/WEBP data URL (maximum 8 MB)
- `question`: optional learner instruction
- `book_url`: optional source URL for context
- `page`: optional page number

The endpoint validates the image and calls OpenAI from the server using `OPENAI_API_KEY`.
