import type { ChatSession, SerializedMessage } from "@/lib/types";

// ─── Provider-agnostic interface ─────────────────────────────────────────────
// Swap point: implement this interface with a SupabaseChatStore to migrate
// from localStorage without touching any hook or component.

export interface ChatStore {
  load(sessionId: string): ChatSession | null;
  save(session: ChatSession): void;
  clear(sessionId: string): void;
  listSessions(): string[];
}

// ─── LocalStorage implementation ─────────────────────────────────────────────

const PREFIX = "stepwise_chat_";
const INDEX_KEY = "stepwise_chat_index";

function sessionKey(id: string): string {
  return `${PREFIX}${id}`;
}

export class LocalStorageChatStore implements ChatStore {
  load(sessionId: string): ChatSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(sessionKey(sessionId));
      if (!raw) return null;
      return JSON.parse(raw) as ChatSession;
    } catch {
      return null;
    }
  }

  save(session: ChatSession): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        sessionKey(session.id),
        JSON.stringify(session)
      );
      this.addToIndex(session.id);
    } catch {
      // Storage quota exceeded or private browsing — silently continue
    }
  }

  clear(sessionId: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(sessionKey(sessionId));
    this.removeFromIndex(sessionId);
  }

  listSessions(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  private addToIndex(id: string): void {
    const sessions = this.listSessions();
    if (!sessions.includes(id)) {
      sessions.push(id);
      window.localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
    }
  }

  private removeFromIndex(id: string): void {
    const sessions = this.listSessions().filter((s) => s !== id);
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
  }
}

export function serializeMessages(
  messages: Array<{ id: string; role: string; content: string; createdAt?: Date | string }>
): SerializedMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role as SerializedMessage["role"],
    content: m.content,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : m.createdAt ?? new Date().toISOString(),
  }));
}
