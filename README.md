# Resume Interview Coach

A focused interview-practice web app that turns a candidate's resume into realistic interview questions and coaching feedback.

## What it does

- Upload a PDF, DOCX, or TXT resume and select a target role.
- Choose interview type and difficulty.
- Practise personalised technical, project, behavioural, and introduction questions.
- Receive a 100-point coaching score with feedback on relevance, technical accuracy, resume consistency, structure, communication, and evidence.
- Review expected points, likely follow-up questions, and a hidden suggested answer.
- Retry questions and track improvement across attempts.

Gemini generates the interview session from the uploaded resume. If Gemini is unavailable, OpenRouter's free-model router provides a secondary path. Both API keys stay server-side; they are never sent to the browser or committed to the repository.

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
pnpm run build
```

## Tech stack

- React, Next.js, TypeScript
- Vinext / Vite and Cloudflare-compatible deployment
- Tailwind CSS

## Configure AI providers locally

Create a local `.env.local` file containing `GEMINI_API_KEY=your_key` and, optionally, `OPENROUTER_API_KEY=your_key`. Do not commit this file. Gemini is the primary provider; OpenRouter's `openrouter/free` router is used only if Gemini fails. Production uses protected server-side environment variables.
