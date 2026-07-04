"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gradually reveals `fullText` at `charsPerSecond`.
 * When `charsPerSecond` is null, returns `fullText` immediately (instant mode).
 * Resets when `messageId` changes.
 */
export function useTextReveal(
  fullText: string,
  charsPerSecond: number | null,
  messageId: string | undefined
): string {
  const [revealedCount, setRevealedCount] = useState(0);
  const [trackedMessageId, setTrackedMessageId] = useState(messageId);
  const fullTextRef = useRef(fullText);
  const speedRef = useRef(charsPerSecond);
  const countRef = useRef(0);

  if (messageId !== trackedMessageId) {
    setTrackedMessageId(messageId);
    setRevealedCount(0);
  }

  useEffect(() => {
    fullTextRef.current = fullText;
  }, [fullText]);

  useEffect(() => {
    speedRef.current = charsPerSecond;
  }, [charsPerSecond]);

  useEffect(() => {
    countRef.current = revealedCount;
  }, [revealedCount]);

  useEffect(() => {
    if (charsPerSecond === null) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const speed = speedRef.current;
      if (speed === null) return;

      const target = fullTextRef.current.length;
      if (countRef.current < target) {
        const deltaSec = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        countRef.current = Math.min(
          target,
          countRef.current + Math.max(1, Math.floor(speed * deltaSec))
        );
        setRevealedCount(countRef.current);
      }

      if (countRef.current < fullTextRef.current.length) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [charsPerSecond, messageId]);

  if (charsPerSecond === null) return fullText;
  return fullText.slice(0, revealedCount);
}
