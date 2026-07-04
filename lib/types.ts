// ─── App Mode ────────────────────────────────────────────────────────────────

export type AppMode = "text" | "voice";

export type ChatProvider = "llm7" | "gemma";

export type ActiveModel = "llm7" | "gemma" | "gemini-live";

// ─── Chat API ────────────────────────────────────────────────────────────────

export interface ChatRequestBody {
  messages: unknown[];
  provider: ChatProvider;
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
