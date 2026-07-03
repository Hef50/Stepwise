// ─── Canvas / Whiteboard ─────────────────────────────────────────────────────

export interface CanvasPayload {
  /** base-64 PNG data URL of the whiteboard snapshot */
  imageDataUrl: string;
  /** SVG string of the whiteboard (may be empty when canvas is blank) */
  svgString: string;
  /** ISO timestamp of capture */
  capturedAt: string;
}

// ─── Chat / Persistence ───────────────────────────────────────────────────────

export interface SerializedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
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

export type DiagramType = "mermaid" | "schemdraw" | "svg";

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

// ─── Vision API ───────────────────────────────────────────────────────────────

/** Determines how the VLM interprets the whiteboard image. */
export type VisionTask = "describe" | "check_work";

export interface VisionRequest {
  prompt?: string;
  images: string[];
  /** Determines the VLM system prompt / interpretation mode. Defaults to "describe". */
  task?: VisionTask;
  /** Optional problem statement or tutor context used in "check_work" grading. */
  context?: string;
}

export interface VisionResponse {
  analysis: string;
  /** Echoed task so callers know which mode produced the response. */
  task: VisionTask;
}

// ─── Course Materials ─────────────────────────────────────────────────────────

export interface CourseMaterial {
  id: string;
  name: string;
  /** Full plain-text content extracted from the PDF. */
  text: string;
  pageCount: number;
  uploadedAt: string;
  /** Whether this material is currently injected into the tutor system prompt. */
  active: boolean;
}

export interface PdfExtractResponse {
  name: string;
  text: string;
  pageCount: number;
}

// ─── Whiteboard Shape Instructions ────────────────────────────────────────────

export type WhiteboardShapeKind = "text" | "latex" | "mermaid" | "schemdraw" | "svg";

/**
 * A single instruction for placing an AI-authored shape on the tldraw canvas.
 * Emitted by the AI in a structured fenced block and parsed by the chat pipeline.
 */
export interface WhiteboardShapeInstruction {
  kind: WhiteboardShapeKind;
  /** The text, LaTeX expression, Mermaid source, or Schemdraw code. */
  content: string;
  /** Optional canvas coordinates. Defaults to auto-placement if omitted. */
  x?: number;
  y?: number;
  /** Optional display width in px. */
  width?: number;
  /** Optional display height in px (text shapes auto-calculate from content). */
  height?: number;
}
