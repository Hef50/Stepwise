# Stepwise merge plan: Arlene modes on Haresh whiteboard

## Objective

Integrate the user-facing interaction modes from `arlene-voice-features` into
`haresh-whiteboard-features` while keeping Haresh's newer whiteboard, rich chat,
course-material, and low-level Gemini Live implementations.

The resulting application has three modes:

| Mode | Primary interaction | Whiteboard behavior |
|---|---|---|
| Text | Typed chat | Haresh equations, handwritten labels, and animated diagrams render from chat responses. |
| Mixed | Typed chat plus browser speech recognition/read-aloud | Uses the *same* Haresh chat and whiteboard pipeline as Text mode. |
| Audio | Gemini Live office-hours call | Keeps Haresh's audio transport and whiteboard streaming; adds an explicit audio-to-whiteboard draw path. |

This is a **selective integration**, not a wholesale `git merge`. The branches
share `ceef257` (`Checkpoint 1 complete`), but they evolved different app-shell,
chat, and Live API contracts after that point.

## Non-negotiable architectural decisions

1. **Start from Haresh.** `haresh-whiteboard-features` remains the integration
   base. It owns the current `AppShell`, rich whiteboard functions, PDF/course
   material support, provider escalation, and Animated tldraw shapes.
2. **Use Arlene's mode model.** Replace Haresh's top-level `text` / `voice`
   selection with Arlene's `text` / `mixed` / `audio` selection. Do not nest
   Arlene's selector inside Haresh's old selector.
3. **Share one Text/Mixed chat implementation.** Text and Mixed must use one
   `ChatPanel` and one message history. Mode only changes how the user supplies
   input and consumes replies; it must not fork the whiteboard/chat behavior.
4. **Do not replace Haresh's renderer.** Keep `useWhiteboardMath`, custom
   tldraw shapes, LaTeX conversion, text conversion, diagram conversion,
   draw queue, reveal synchronization, and speed settings.
5. **Do not replace Haresh's Live transport wholesale.** Keep its AudioWorklet,
   PCM handling, interruption behavior, whiteboard frames, and `/api/live/token`
   route. Port Arlene's captions, transcript UX, mute semantics, and error
   handling into that foundation.
6. **Keep a single tldraw editor.** `AppShell` continues to mount one shared
   whiteboard; all three modes receive the same capture and render callbacks.
7. **Avoid duplicate endpoints.** The target's `/api/live/token` stays the only
   Live token endpoint. Do not add Arlene's `/api/live-token` route.

## Scope map

### Keep as the source of truth from Haresh

- `components/layout/AppShell.tsx`
  - shared whiteboard mounting, responsive layout, render callbacks, and
    whiteboard settings overlay.
- `components/chat/ChatPanel.tsx`
  - provider selection, image/Gemma escalation, PDF context, tool-event queue,
    equations, labels, diagrams, retries, and chat persistence.
- `hooks/useWhiteboardMath.ts` and `lib/whiteboard/**`
  - all animated LaTeX, handwritten text, diagram geometry, settings, and
    persistence behavior.
- `components/chat/LiveTutorPanel.tsx` and `hooks/useGeminiLive.ts`
  - Live panel baseline, AudioWorklet capture, interruption, audio playback,
    automatic whiteboard frame sending, and transcript assembly.
- `app/api/chat/route.ts`
  - LLM7/Gemma selection, structured whiteboard tools, PDF enrichment, and
    target-specific error codes.
- `app/api/live/token/route.ts`
  - established endpoint, token response contract, and Live model constants.
- `lib/types.ts`
  - preserve all existing app, provider, PDF, message-metadata, whiteboard,
    custom-shape, and draw-queue types.

### Port or adapt from Arlene

- `lib/settings.ts`
  - persistent browser speech preferences; remove or defer settings that do not
    yet have a target feature owner.
- `lib/speech.ts`
  - markdown cleanup for browser text-to-speech.
- `lib/rateLimit.ts`
  - reusable rate-limit detection and friendly response helpers, mapped to
    Haresh's `LLM7_*` and `GEMMA_*` error messages.
- `hooks/useVoiceTA.ts`
  - separate STT/TTS support detection, voice speed, mute state, transcript
    history, browser speech queue, and optional transcript callback.
- `components/chat/VoiceControls.tsx`
  - microphone, mute/read-aloud, and voice-speed controls adapted to the
    target's existing `ChatInput` interface.
- `components/chat/AudioOnlyPanel.tsx`
  - use as design/behavior input for the Live transcript and controls; either
    rename/adapt it into `LiveTutorPanel` or compose it inside that panel.
- `components/common/SettingsPanel.tsx`
  - adapt its browser-voice preferences into the existing target settings
    surface instead of creating a competing settings dialog.
- selected parts of Arlene's `useGeminiLive.ts`
  - caption state, persistent transcript history, explicit mute state, manual
    whiteboard-share feedback, and graceful rate-limit handling.

### Deliberately do not copy unchanged

- Arlene `components/chat/ChatPanel.tsx` and `components/layout/AppShell.tsx`.
  They assume a different nested mode layout and omit target whiteboard/PDF
  contracts.
- Arlene `app/api/chat/route.ts`. It lacks the target's provider/tool support.
- Arlene `app/api/vision/route.ts`. Haresh already supplies native image parts
  to Gemma, including whiteboard snapshots. Reconsider only as a separately
  approved fallback feature.
- Arlene `app/api/live-token/route.ts`. It conflicts with the target endpoint
  path and response shape.
- Arlene `lib/ai/gemini.ts`. It contains vision helpers, whereas the target file
  contains Live API constants.
- Arlene `package.json` and `package-lock.json`. Begin from target dependencies;
  regenerate the lockfile only if the final adapted code actually needs a new
  dependency.

## Phase 0 — safety and baseline

1. Verify both working trees are clean before changing either branch.
2. Confirm the merge base remains `ceef257` and that the intended heads are:
   - source: `arlene-voice-features` (`b2471ea` at analysis time)
   - target: `haresh-whiteboard-features` (`5b7f7ec` at analysis time)
3. Create an integration branch from the target repository, for example:

   ```bash
   cd Stepwise-haresh
   git switch haresh-whiteboard-features
   git switch -c integrate/arlene-three-modes
   ```

4. Do **not** perform a blind merge into that branch. Keep the source repository
   available for `git show`, diffs, and targeted ports.
5. Run the target's existing type-check/lint/test commands before edits and
   record known baseline failures. Do not attribute pre-existing failures to the
   integration.
6. Use a real `.env.local` only locally. Never copy Arlene's local environment
   file or commit API keys.

## Phase 1 — define and persist the three-mode contract

### Goal

Make `text`, `mixed`, and `audio` a single, explicit application state without
duplicated panels or separate whiteboards.

### Steps

1. In `lib/types.ts`, replace/extend `AppMode` so it represents:

   ```ts
   type AppMode = "text" | "mixed" | "audio";
   ```

   Keep `ChatProvider`, `ActiveModel`, and every existing whiteboard/PDF type.
   Do not replace the whole file with Arlene's smaller version.
2. Decide on a stable storage key and migration:
   - Preserve the existing `stepwise_mode` key if possible.
   - Treat old stored value `voice` as `audio` on first read.
   - Accept only `text`, `mixed`, and `audio` after migration.
   - Write the migrated value back so future loads are deterministic.
3. In `AppShell`, replace the two-button Text/Live selector with three buttons:
   Text, Mixed, and Audio.
4. Keep the model badge behavior clear:
   - Text and Mixed display the active text provider (`llm7` or `gemma`).
   - Audio displays `gemini-live` while that mode is active.
5. Keep the same responsive split/tab layout. The whiteboard panel remains
   mounted once per viewport layout, regardless of active mode.
6. Update mobile tab labels so the chat tab reads Text, Mixed, or Audio as
   appropriate while the board tab remains unchanged.
7. Confirm switching between Text and Mixed does not reset messages, provider
   escalation state, course materials, or rendered-whiteboard bookkeeping.
8. Confirm entering Audio disconnects any browser STT/TTS activity and entering
   Text/Mixed disconnects a Live session cleanly.

### Acceptance criteria

- Browser reload restores all three modes correctly, including migration from
  stored `voice`.
- No mode switch remounts a second tldraw editor.
- Text/Mixed preserves ChatPanel state; Audio has explicit session cleanup.

## Phase 2 — refactor the target chat panel to support Text and Mixed

### Goal

Use one target `ChatPanel` for both typed and browser-assisted interaction.

### Steps

1. Add an `interactionMode: "text" | "mixed"` prop to Haresh's `ChatPanel`.
   Keep Audio outside of this component; it is a Live session, not a text-chat
   variant.
2. Preserve the target's current props exactly:
   - capture callback
   - LaTeX/text/diagram render callbacks
   - focus callback
   - clear-whiteboard callback
   - editor-ready flag
   - active-model callback
   - developer controls and chat text speed
3. Update `AppShell` to render one `ChatPanel` for Text and Mixed, passing the
   selected interaction mode. Render the adapted Live panel only for Audio.
4. Preserve the target submit path unchanged:
   - native image file parts
   - Gemma escalation
   - whiteboard capture as an image part
   - course-material PDF metadata
   - whiteboard-intent detection
   - provider/error/retry behavior
5. In Mixed mode only, wire browser STT completion to:
   - place the transcript into the input;
   - optionally submit it after a short, cancellable delay;
   - respect `isLoading`, empty-transcript guards, and form cancellation.
6. In Mixed mode only, queue the completed assistant response for browser TTS
   when TTS is enabled. Use `stripMarkdownForSpeech` before speaking.
7. When a user starts listening, cancel active browser TTS. When an assistant
   response starts streaming, do not speak partial fragments unless the queue
   design explicitly supports them; speak the finalized response once.
8. When switching away from Mixed, cancel recognition, queued utterances, and
   pending auto-submit timers.

### Acceptance criteria

- Text mode remains behaviorally identical to the target baseline.
- Mixed mode can dictate a question and use every target chat feature.
- Mixed responses retain animated equations, whiteboard labels, diagrams,
  course-material attachments, image escalation, retry, and persistence.
- Switching Text ⇄ Mixed does not duplicate, lose, or re-render prior messages.

## Phase 3 — integrate enhanced browser voice state and controls

### Goal

Bring Arlene's richer browser voice controls into the target without breaking
the existing ChatInput/VoiceControls contract.

### Steps

1. Add the necessary fields to the existing `VoiceState` in `lib/types.ts`:
   - independent `sttSupported` and `ttsSupported`
   - `soundEnabled`
   - `voiceSpeed`
   - `ttsStatus` (if useful to UI)
   - bounded `transcriptHistory`
2. Add methods to `VoiceControls` only after every caller is identified:
   - `preloadSpeech`
   - `enqueueSpeech`
   - `toggleSound`
   - `setVoiceSpeed`
   - `clearTranscriptHistory`
3. Preserve the old minimal methods (`startListening`, `stopListening`, `speak`,
   `cancelSpeech`) so all target callers continue to work.
4. Port `lib/settings.ts`, but keep its schema narrow initially:
   - `talkingSpeed`
   - `ttsEnabled`
   - defer `autosaveWhiteboard` unless a target feature takes ownership of it.
5. Implement storage parsing defensively and migrate invalid values to defaults.
6. Adapt `useVoiceTA` rather than replacing it blindly:
   - retain client-only API checks to prevent hydration mismatches;
   - retain target cleanup behavior;
   - implement speech recognition final/interim text correctly;
   - append bounded transcript history;
   - use persistent TTS enable/speed settings;
   - strip markdown before creating utterances;
   - cancel stale utterances before starting a new user-directed read;
   - make browser-specific errors human-readable.
7. Adapt `VoiceControls.tsx` to support:
   - microphone start/stop where STT is available;
   - read-aloud/mute where TTS is available;
   - speed selection;
   - disabled states during incompatible modes;
   - accessible labels and tooltips.
8. Ensure `ChatInput` only exposes the auto-submit/mixed-specific behavior when
   its `interactionMode` is Mixed. Text should still allow an intentional,
   user-triggered “read response” action if desired.

### Acceptance criteria

- Safari/unsupported-browser cases degrade to typed chat without broken controls.
- Mute and speed persist across reloads.
- A speech-recognition error does not leave the input or TTS queue stuck.
- Text mode retains manual voice affordances; Mixed adds automatic interaction.

## Phase 4 — consolidate settings

### Goal

Expose voice preferences without two competing settings panels.

### Steps

1. Keep `WhiteboardSettingsPanel` as the settings entry point in `AppShell`.
2. Add a clearly separated **Voice** section to that existing panel, or create
   a shared settings dialog shell containing Whiteboard and Voice sections.
3. Port only the useful behavior from Arlene's `SettingsPanel`:
   - TTS enabled/muted setting
   - speech rate
   - reset-to-defaults action
4. Do not add Arlene's standalone `app/settings/page.tsx` unless a settings
   route is a separately desired product feature.
5. Ensure reset affects voice settings only unless the UI clearly says it resets
   both whiteboard and voice preferences.

### Acceptance criteria

- Users find all persistent preferences in one predictable place.
- Changing speech speed immediately affects subsequent browser read-aloud.
- Existing Haresh whiteboard settings remain intact.

## Phase 5 — evolve Audio mode without regressing the Live transport

### Goal

Use an Arlene-style call/captions interface on top of Haresh's more mature
Gemini Live implementation.

### Steps

1. Keep the target endpoint path `/api/live/token` and its `token`, `model`,
   and expiration contract. Do not introduce a second endpoint.
2. Retain Haresh's Live implementation details:
   - AudioWorklet microphone capture;
   - input/output PCM sample-rate handling;
   - scheduled playback;
   - interruption playback cancellation;
   - periodic whiteboard frames;
   - teardown of tracks, worklet, audio context, and socket.
3. Extend the target Live state with Arlene-inspired UI state:
   - muted/unmuted status;
   - interim input caption;
   - interim output caption;
   - bounded completed transcript history;
   - whiteboard synchronization timestamp/status;
   - normalized rate-limit flag.
4. Add a `toggleMute` implementation to the target hook that starts/stops only
   microphone input without destroying the session unless the desired product
   behavior explicitly says otherwise.
5. Preserve automatic whiteboard streaming while active. Add an explicit
   “refresh/share whiteboard now” control that sends one immediate frame and
   gives visible feedback.
6. Adapt Arlene's `AudioOnlyPanel` styling and transcript design into
   `LiveTutorPanel`, or compose it as a child. Do not mount two separate Live
   panels or two `useGeminiLive` hook instances.
7. Make captions render in order:
   - completed historical rows;
   - interim user caption;
   - interim tutor caption.
8. On interruption, stop queued audio immediately and clear only the relevant
   interim output caption; preserve completed transcript rows.
9. Map token, session, and rate-limit failures to a retryable panel state.
10. On Audio-mode exit, intentionally close the session and stop microphone
    tracks before returning to Text or Mixed.

### Acceptance criteria

- Audio mode can connect, mute/unmute, end, retry, and manually refresh the
  whiteboard without leaks or duplicate audio.
- Whiteboard frames continue to reach the Live tutor during a call.
- Captions are readable and survive individual turns.
- Existing Live interruption behavior remains functional.

## Phase 6 — add LaTeX, text, and diagram rendering to Audio mode

### Current limitation

Haresh's Text chat renderer receives structured tool calls and fallback markers
from `/api/chat`. Gemini Live currently returns speech/captions, not the same
structured whiteboard draw events. Therefore Audio must get an intentional,
separate audio-to-whiteboard command path.

### Required design

Audio rendering must invoke the **same** callbacks passed to target ChatPanel:

- `renderLatexOnCanvas`
- `renderTextOnCanvas`
- `renderDiagramOnCanvas`
- `focusLatexShape` when appropriate

It must never duplicate Haresh's conversion or tldraw-shape code in the Live
panel.

### Recommended first implementation: explicit draw requests

1. Add `renderLatexOnCanvas`, `renderTextOnCanvas`, and
   `renderDiagramOnCanvas` props to the Audio/Live panel from `AppShell`.
2. Add an explicit user action in Audio mode, such as **Draw on whiteboard**,
   alongside the camera/whiteboard controls.
3. Define a small, typed draw-request format with three variants:

   ```ts
   type AudioWhiteboardRequest =
     | { kind: "latex"; latex: string; displayMode?: boolean }
     | { kind: "text"; text: string }
     | { kind: "diagram"; spec: DiagramSpec };
   ```

4. Convert an explicit user intent (spoken or typed) into this format through a
   server-side helper route or an existing model request. The helper must return
   JSON that validates against the target's existing LaTeX/text/`DiagramSpec`
   expectations.
5. Call the corresponding Haresh render callback only after validation.
6. Announce the outcome in Audio captions, for example: “I added the quadratic
   formula to the whiteboard.”
7. Do not parse arbitrary natural-language captions with regular expressions as
   the authoritative renderer. Use a structured response/validation boundary.
8. Add a concise activity state: preparing → drawing → complete/failed.
9. Make duplicate protection explicit. Repeated draw requests must not create
   multiple identical shapes unless the user intentionally asks for another.

### Optional second implementation: Live tool/function calls

If the selected Gemini Live configuration and SDK support application function
calls reliably for the deployed model, add registered functions for drawing:

- `render_math_whiteboard`
- `render_text_whiteboard`
- `render_diagram_whiteboard`

Before adopting this path, verify model/SDK support, interruption behavior,
tool-call completion semantics, validation, timeout/retry behavior, and whether
the Live model can generate a complete `DiagramSpec`. Keep the explicit
draw-request path as the product fallback.

### Acceptance criteria

- A user can ask in Audio mode to put a formula, label, or diagram on the board.
- The output uses Haresh's existing animations, draw speeds, font settings,
  text styles, and diagram styles.
- The Live tutor receives the newly rendered board on the next automatic frame
  (or an immediate refresh).
- Invalid or incomplete draw requests fail visibly without corrupting the board.

## Phase 7 — API and error-handling consolidation

### Steps

1. Keep Haresh's `/api/chat` provider and whiteboard-tool behavior intact.
2. Add `rateLimit` helper use only where it improves consistent presentation:
   - Live token endpoint;
   - Live connection errors;
   - client-side chat error classification.
3. Treat existing identifiers such as `LLM7_RATE_LIMITED` and
   `GEMMA_RATE_LIMITED` as rate-limit messages in the shared classifier.
4. Do not replace target error codes with Arlene's single
   `RATE_LIMIT_REACHED` value; support both during the transition.
5. Improve the Live token route only by carefully porting safe behavior:
   - graceful missing-key response rather than module-load failure;
   - optional `GOOGLE_GENERATIVE_AI_API_KEY` fallback if desired;
   - rate-limit-specific response;
   - no API key sent to the browser.
6. Re-evaluate the separate Arlene vision route only after the core merge:
   Haresh's direct Gemma image-part approach is the default; a separate vision
   analysis may cost an additional model request and duplicate context.

### Acceptance criteria

- No server route imports a source-only module accidentally.
- Text, Mixed, and Audio give a clear retry path for provider or quota failures.
- All API keys remain server-only.

## Phase 8 — dependencies, documentation, and repository hygiene

### Steps

1. Retain Haresh's `package.json` as the initial dependency manifest. It already
   contains the target renderer/PDF dependencies that Arlene does not list.
2. Add a package only when the final integrated code imports it and no equivalent
   target dependency exists.
3. Regenerate `package-lock.json` from the final manifest; do not hand-merge
   large lockfile sections.
4. Keep Haresh's `next.config.ts` server external-package configuration for
   `pdf-parse` and `@google/genai`.
5. Update the README after behavior is stable:
   - describe Text, Mixed, and Audio modes;
   - document whiteboard rendering availability in each mode;
   - document environment variables and the Live route accurately;
   - include browser support constraints for Web Speech API.
6. Keep `.env.local` ignored and never include its contents in commits.
7. Remove or separately address tracked `.cursor/debug-*.log` files only with
   explicit approval; they are unrelated hygiene, not merge functionality.

## Phase 9 — verification matrix

Run these checks after each focused implementation commit, then repeat the full
matrix before merging the integration branch.

### Automated checks

1. Install dependencies from the final lockfile.
2. Run TypeScript checking with incremental output disabled if needed.
3. Run linting.
4. Run the existing test suite, if present.
5. Run a production build in a clean environment.
6. Check for accidental route duplication:
   - only `/api/live/token` should be active;
   - no imports should point to `/api/live-token`.
7. Search for unresolved merge markers and stale source-only imports.

### Manual Text-mode checks

1. Send a plain LLM7 text question.
2. Attach an image and verify Gemma escalation.
3. Capture the whiteboard and verify it becomes a Gemma image part.
4. Use course material/PDF context.
5. Request an equation, short label, and diagram.
6. Verify all three animate on the board and respect existing settings.
7. Retry and provider-fallback error states.

### Manual Mixed-mode checks

1. Dictate a question and verify correct input/submission behavior.
2. Submit a typed question while browser TTS is active; confirm TTS cancels.
3. Verify completed assistant text is read once when enabled.
4. Change speed and mute settings; reload and confirm persistence.
5. Repeat the Text-mode image, PDF, LaTeX, label, diagram, and retry cases.
6. Switch to Text and back to Mixed; verify the same chat history and board.
7. Test unsupported STT/TTS browser behavior.

### Manual Audio-mode checks

1. Connect, grant microphone access, and confirm input/output audio.
2. Verify interim captions and completed transcript rows.
3. Interrupt the tutor; confirm pending playback stops cleanly.
4. Mute/unmute without creating a second socket or audio context.
5. Draw on the whiteboard while speaking; verify automatic frames update.
6. Press manual whiteboard refresh; verify feedback and Live visibility.
7. Request a LaTeX equation, label, and diagram through the Audio draw path.
8. Verify they use the same Haresh animation/style settings as Text/Mixed.
9. Disconnect and switch modes; confirm microphone/audio resources release.
10. Exercise missing-key, token error, and rate-limit recovery paths.

### Responsive checks

1. Desktop split layout at minimum and maximum chat widths.
2. Mobile tabs in all three modes.
3. Rotate/narrow viewport while a Live session is active.
4. Confirm no second tldraw instance is mounted during responsive transitions.

## Suggested commit sequence

Keep each commit reviewable and reversible:

1. `refactor: introduce text mixed and audio app modes`
2. `feat: share haresh chat and whiteboard pipeline with mixed mode`
3. `feat: add persistent browser speech controls`
4. `feat: consolidate voice settings with whiteboard settings`
5. `feat: improve live tutor captions mute and whiteboard feedback`
6. `feat: render latex text and diagrams from audio mode`
7. `fix: unify live and chat rate-limit handling`
8. `docs: document three modes and merge architecture`

Do not mix dependency regeneration, unrelated debug-log cleanup, or broad
formatting with functional commits.

## Final merge criteria

The integration branch is ready only when all of the following are true:

- Text, Mixed, and Audio are first-class, persisted modes.
- Text and Mixed share one chat history and one complete Haresh whiteboard
  pipeline.
- LaTeX, text labels, and diagrams render from Text and Mixed without regressions.
- Audio has a validated path to render LaTeX, text labels, and diagrams using
  Haresh's existing renderer.
- Only one tldraw editor and one Live session are active at a time.
- Haresh PDF/Gemma/whiteboard features remain available.
- Browser voice preferences and Live call behavior degrade safely.
- Build, type-check, lint, and the manual matrix pass.
- No secrets, source-only routes, duplicate endpoints, merge markers, or
  unrelated workspace artifacts are committed.
