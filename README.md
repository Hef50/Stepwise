# Stepwise — AI Tutor MVP

A responsive AI tutoring web app with a streaming chat interface, interactive tldraw whiteboard, voice input/output, and diagram rendering.

## Features

- **Split layout** — side-by-side chat + whiteboard on tablets/laptops; tabbed on mobile
- **Streaming AI chat** — powered by LLM7 (OpenAI-compatible) via Vercel AI SDK v5
- **Vision analysis** — capture the whiteboard and send it to Gemini for analysis
- **Mermaid diagrams** — flowcharts and diagrams rendered inline from AI responses
- **Schemdraw diagrams** — circuit/physics diagram code displayed with an elegant placeholder
- **Voice interface** — Web Speech API for free, fully local STT + TTS
- **File upload** — attach images and PDFs to the AI context
- **LocalStorage persistence** — chat history survives page refresh

## Quick Start  

```bash
# 1. Clone and install
npm install

# 2. Configure environment variables
cp .env.example .env.local
# Fill in LLM7_API_KEY and GEMINI_API_KEY

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description | Where to get |
|---|---|---|
| `LLM7_API_KEY` | LLM7 API token for text generation | [dash.llm7.io](https://dash.llm7.io) |
| `GEMINI_API_KEY` | Google Gemini key for vision analysis | [aistudio.google.com](https://aistudio.google.com/apikey) |

## Architecture

```
app/
  api/
    chat/route.ts       ← LLM7 streaming text endpoint (server-only)
    vision/route.ts     ← Gemini vision endpoint (server-only)
  layout.tsx
  page.tsx
components/
  layout/AppShell.tsx   ← Responsive split/tabbed layout
  chat/                 ← Chat UI components
  whiteboard/           ← tldraw integration
  diagrams/             ← Mermaid + Schemdraw renderers
  common/               ← ErrorBoundary
hooks/
  useVoiceTA.ts         ← Web Speech API voice hook
  useChatPersistence.ts ← LocalStorage chat persistence
  useWhiteboardCapture.ts ← Canvas export utility
lib/
  ai/llm7.ts            ← LLM7 provider (server-only)
  ai/gemini.ts          ← Gemini provider (server-only)
  persistence/          ← ChatStore interface + LocalStorage impl
  whiteboard/           ← Canvas capture utilities
  markdown/             ← Message block parser
  types.ts              ← Shared TypeScript types
```

## Swap Points (future upgrades)

### Replace LocalStorage with Supabase
1. Implement the `ChatStore` interface in `lib/persistence/supabaseChatStore.ts`
2. In `hooks/useChatPersistence.ts`, pass a `SupabaseChatStore` instance via the `store` option

### Replace Web Speech API with OpenAI Whisper + TTS
1. Create `hooks/useVoiceOpenAI.ts` that implements and returns `VoiceControls`
2. In `components/chat/ChatPanel.tsx`, replace `useVoiceTA` import with `useVoiceOpenAI`
3. No other component changes required — the interface is identical

### Replace LLM7 with another provider
1. Edit `lib/ai/llm7.ts` to use any Vercel AI SDK provider
2. Update `app/api/chat/route.ts` to use the new model

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- [@tldraw/tldraw](https://tldraw.dev) (interactive canvas)
- [Vercel AI SDK v5](https://ai-sdk.dev)
- [Mermaid.js](https://mermaid.js.org) (diagram rendering)
- [LLM7.io](https://llm7.io) (free OpenAI-compatible LLM API)
- [Google Gemini](https://aistudio.google.com) (vision analysis)
