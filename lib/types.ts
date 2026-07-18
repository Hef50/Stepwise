// ─── App Mode ────────────────────────────────────────────────────────────────

export type AppMode = "text" | "voice";

export type ChatProvider = "llm7" | "gemma";

export type ActiveModel = "llm7" | "gemma" | "gemini-live";

// ─── Chat API ────────────────────────────────────────────────────────────────

export interface ChatRequestBody {
  messages: unknown[];
  provider: ChatProvider;
  forceWhiteboard?: boolean;
  /** Dev Mode: force LLM7 path to fail (for error-banner testing). */
  forceLlm7Fail?: boolean;
  /** Dev Mode: stream a canned whiteboard smoke-test response (no LLM). */
  smokeTest?: boolean;
}

// ─── Live Session ─────────────────────────────────────────────────────────────

export type LiveStatus = "idle" | "connecting" | "active" | "speaking" | "error";

export interface LiveTranscriptLine {
  id: string;
  role: "user" | "model";
  text: string;
  partial: boolean;
}

// ─── Canvas / Whiteboard ─────────────────────────────────────────────────────

export interface CanvasPayload {
  /** base-64 PNG data URL of the whiteboard snapshot */
  imageDataUrl: string;
  /** SVG string of the whiteboard (may be empty when canvas is blank) */
  svgString: string;
  /** ISO timestamp of capture */
  capturedAt: string;
}

/** A single resolved SVG path element extracted from MathJax SVG output */
export interface SvgPathData {
  /** The `d` attribute of the path element */
  d: string;
  /** Optional `transform` attribute (translate/scale from MathJax layout) */
  transform?: string;
}

/** Props for the animated LaTeX custom tldraw shape */
export interface LatexAnimatedShapeProps {
  /** Original LaTeX string, stored for serialization and re-render */
  latex: string;
  /** Flat array of resolved SVG path elements to animate */
  svgPaths: SvgPathData[];
  /** viewBox string from the MathJax SVG output (e.g. "0 0 652 182") */
  viewBox: string;
  /** Shape width in canvas units */
  w: number;
  /** Shape height in canvas units */
  h: number;
  /** When true, play stroke-draw animation once then settle to filled */
  animate: boolean;
  /** Per-path draw duration (ms) baked at creation; 0 = no animation */
  stepMs: number;
}

/** Draw mode for handwritten whiteboard text */
export type WhiteboardTextDrawMode = "stroke" | "outline";

/** Props for the animated handwritten-text custom tldraw shape */
export interface TextAnimatedShapeProps {
  /** Original label / key-term string */
  text: string;
  /** Per-glyph SVG path elements to animate */
  svgPaths: SvgPathData[];
  /** viewBox string from opentype path layout */
  viewBox: string;
  /** Shape width in canvas units */
  w: number;
  /** Shape height in canvas units */
  h: number;
  /** When true, play stroke-draw animation once then settle */
  animate: boolean;
  /** Per-path draw duration (ms) baked at creation; 0 = no animation */
  stepMs: number;
  /** stroke = single-line pen; outline = filled handwriting font */
  mode: WhiteboardTextDrawMode;
  /** CSS color baked at creation */
  color: string;
  /** Font size (px) used when paths were generated — for rescale */
  fontSize: number;
}

/** Unified whiteboard draw-queue item (equations + labels, emission order). */
export interface WhiteboardDrawQueueItem {
  kind: "latex" | "text";
  content: string;
}

// ─── Chat / Persistence ───────────────────────────────────────────────────────

export interface MessagePdfAttachment {
  id: string;
  name: string;
  pageCount: number;
  /** Full extracted text — shown in the attachment viewer, not in the chat bubble */
  text: string;
}

export interface StepwiseMessageMetadata {
  attachments?: MessagePdfAttachment[];
}

export interface SerializedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: MessagePdfAttachment[];
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  messages: SerializedMessage[];
  savedAt: string;
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export type VoiceMode = "idle" | "listening" | "speaking" | "error";

export interface VoiceState {
  mode: VoiceMode;
  transcript: string;
  error: string | null;
  supported: boolean;
}

export interface VoiceControls {
  state: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
}

// ─── Diagram Blocks ───────────────────────────────────────────────────────────

export type DiagramType = "mermaid" | "schemdraw";

export interface TextBlock {
  kind: "text";
  content: string;
}

export interface DiagramBlock {
  kind: "diagram";
  diagramType: DiagramType;
  code: string;
}

export type MessageBlock = TextBlock | DiagramBlock;

// ─── File Upload ──────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  /** base-64 data URL */
  dataUrl: string;
  size: number;
}

// ─── Course Materials (persistent PDFs) ──────────────────────────────────────

export interface CourseMaterial {
  id: string;
  name: string;
  pageCount: number;
  /** Full extracted text — persisted locally, injected into LLM when enabled */
  text: string;
  enabled: boolean;
  addedAt: string;
}

// ─── Materials Extract API ────────────────────────────────────────────────────

export interface MaterialExtractRequest {
  /** base-64 PDF data URL */
  dataUrl: string;
  name: string;
}

export interface MaterialExtractResponse {
  text: string;
  pageCount: number;
  name: string;
}
