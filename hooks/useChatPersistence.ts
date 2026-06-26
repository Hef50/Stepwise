"use client";

import { useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  LocalStorageChatStore,
  type ChatStore,
} from "@/lib/persistence/chatStore";
import type { ChatSession, SerializedMessage } from "@/lib/types";

const DEFAULT_SESSION_ID = "default";
const SAVE_DEBOUNCE_MS = 800;

interface UseChatPersistenceOptions {
  sessionId?: string;
  store?: ChatStore;
}

interface UseChatPersistenceReturn {
  loadMessages: () => SerializedMessage[];
  saveMessages: (messages: UIMessage[]) => void;
  clearSession: () => void;
}

/**
 * useChatPersistence — saves and restores chat messages.
 *
 * Backed by LocalStorageChatStore by default. To swap to Supabase:
 *   const store = new SupabaseChatStore(supabaseClient);
 *   useChatPersistence({ store });
 */
export function useChatPersistence(
  options: UseChatPersistenceOptions = {}
): UseChatPersistenceReturn {
  const sessionId = options.sessionId ?? DEFAULT_SESSION_ID;
  const storeRef = useRef<ChatStore>(
    options.store ?? new LocalStorageChatStore()
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const loadMessages = useCallback((): SerializedMessage[] => {
    const session = storeRef.current.load(sessionId);
    return session?.messages ?? [];
  }, [sessionId]);

  const saveMessages = useCallback(
    (messages: UIMessage[]) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        const serialized: SerializedMessage[] = messages.map((m) => {
          const textPart = m.parts.find((p) => p.type === "text");
          const content = textPart?.type === "text" ? textPart.text : "";
          return {
            id: m.id,
            role: m.role as SerializedMessage["role"],
            content,
            createdAt: new Date().toISOString(),
          };
        });

        const session: ChatSession = {
          id: sessionId,
          messages: serialized,
          savedAt: new Date().toISOString(),
        };

        storeRef.current.save(session);
      }, SAVE_DEBOUNCE_MS);
    },
    [sessionId]
  );

  const clearSession = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    storeRef.current.clear(sessionId);
  }, [sessionId]);

  return { loadMessages, saveMessages, clearSession };
}
