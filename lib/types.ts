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

export type InteractionMode = "text" | "mixed" | "audio";

export type VoiceMode = "idle" | "listening" | "speaking" | "error";

export interface VoiceTranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface VoiceState {
  mode: VoiceMode;
  transcript: string;
  captions: string;
  error: string | null;
  supported: boolean;
  nativeVoiceModeEnabled: boolean;
  transcriptHistory: VoiceTranscriptEntry[];
  voiceSpeed: number;
}

export interface VoiceControls {
  state: VoiceState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  toggleNativeVoiceMode: () => void;
  setVoiceSpeed: (speed: number) => void;
  clearTranscriptHistory: () => void;
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

// ─── Vision API ───────────────────────────────────────────────────────────────

export interface VisionRequest {
  prompt: string;
  images: string[];
}

export interface VisionResponse {
  analysis: string;
}
