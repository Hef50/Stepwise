# Stepwise — AI Tutor

A responsive AI tutoring web app with a streaming chat interface, interactive tldraw whiteboard, and two tutoring modes.

## Modes

### Text Mode (default)
- Chat powered by **LLM7** (free, fast, text-only) via OpenRouter-compatible API
- Attach images or capture the whiteboard → automatically escalates to **Gemma 4** (multimodal via OpenRouter) for the rest of the session
- Status badge shows active model: **LLM7** / **Gemma 4**
- Mermaid & Schemdraw diagram rendering; PDF text extraction; file uploads

### Mixed Mode
- Uses the same chat, Gemma vision escalation, PDF materials, and animated whiteboard rendering as Text mode
- Browser speech recognition can submit a question hands-free
- Browser text-to-speech can read the finished answer aloud; mute and speed preferences persist locally

### Audio Mode ("Office Hours")
- Real-time **voice tutoring** via Gemini 3 Flash Live API
- Native audio input (mic PCM 16kHz via AudioWorklet) + audio output (PCM 24kHz)
- Whiteboard streamed to the tutor at ~1 FPS so Gemini can see what you draw
- On-screen transcription of both student and tutor speech
- Status badge shows **Gemini 3 Live**
- Gemini can automatically render equations, short labels, and diagrams on the shared whiteboard during the call. When the student explicitly asks it to draw or write on the whiteboard, it is instructed to use the matching drawing tool.

## Features

- **Split layout** — resizable side-by-side on desktop; tabbed on mobile
- **Mode toggle** — persisted in `localStorage`, separate per tab
- **Model escalation** — text-only → multimodal as soon as any image is attached (sticky per session)
- **Ephemeral tokens** — `GEMINI_API_KEY` never reaches the browser; server mints short-lived tokens for Live sessions
- **Mermaid diagrams** — flowcharts rendered inline from AI responses
- **Schemdraw diagrams** — circuit/physics diagram placeholder
- **Voice interface (text mode)** — Web Speech API for local STT + TTS
- **LocalStorage persistence** — text-mode chat history survives refresh

## Quick Start 

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables 

| Variable | Required for | Description | Where to get |
|---|---|---|---|
| `LLM7_API_KEY` | Text mode | Token for LLM7 (text-only default) | [dash.llm7.io](https://dash.llm7.io) |
| `OPENROUTER_API_KEY` | Text mode (vision) | Key for Gemma 4 multimodal via OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `GEMINI_API_KEY` | Live mode | Google Gemini key — **server-only**, never sent to browser | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

> **Security reminder:** Never commit `.env.local`. Rotate any keys that may have been exposed. `GEMINI_API_KEY` is used only in server-side API routes.
 
## Architecture

```
app/
  api/
    chat/route.ts           ← Streaming chat (LLM7 or Gemma, selected by provider param)
    materials/extract/      ← PDF text extraction (pdf-parse, server-only)
    live/token/route.ts     ← Mints ephemeral Gemini Live tokens (GEMINI_API_KEY server-only)
  layout.tsx / page.tsx
components/
  layout/
    AppShell.tsx            ← Mode toggle, model badge, resizable split / mobile tabs
    ModelStatusBadge.tsx    ← Shows LLM7 / Gemma 4 / Gemini 3 Live
  chat/
    ChatPanel.tsx           ← Text-mode chat (LLM7 → Gemma escalation)
    LiveTutorPanel.tsx      ← Voice-mode live session UI
    ChatInput.tsx / ChatMessages.tsx / MessageBubble.tsx
  whiteboard/               ← tldraw integration (shared across both modes)
  diagrams/                 ← Mermaid + Schemdraw renderers
  common/ErrorBoundary.tsx
hooks/
  useGeminiLive.ts          ← Gemini Live session: connect/mic/audio/whiteboard/transcript
  useVoiceTA.ts             ← Web Speech API voice hook (text mode)
  useChatPersistence.ts     ← LocalStorage chat persistence
  useWhiteboardCapture.ts   ← Canvas export utility
lib/
  ai/llm7.ts                ← LLM7 provider (server-only)
  ai/openrouter.ts          ← OpenRouter Gemma provider (server-only)
  ai/gemini.ts              ← Gemini Live model constants
  types.ts                  ← Shared TypeScript types
public/
  worklets/mic-processor.js ← AudioWorklet: Float32 → PCM16 conversion for mic
```

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- [@tldraw/tldraw](https://tldraw.dev) (interactive canvas)
- [Vercel AI SDK v5](https://ai-sdk.dev) + `@ai-sdk/openai-compatible`
- [@google/genai](https://github.com/googleapis/js-genai) (Gemini Live API)
- [Mermaid.js](https://mermaid.js.org)
- [LLM7.io](https://llm7.io) — free text-only LLM
- [OpenRouter](https://openrouter.ai) — Gemma 4 multimodal
- [Google Gemini 3 Flash Live](https://ai.google.dev/gemini-api/docs/live) — real-time voice
