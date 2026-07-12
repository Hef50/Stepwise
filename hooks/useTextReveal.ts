"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gradually reveals `fullText` at `charsPerSecond`.
 * When `charsPerSecond` is null, returns `fullText` immediately (instant mode).
 * Resets when `messageId` changes.
 *
 * Changing speed mid-reveal only affects *upcoming* characters — already
 * revealed text is never erased or rewound.
 *
 * When `paused` is true (e.g. a LaTeX equation is drawing on the whiteboard),
 * the reveal freezes in place and resumes when paused flips back to false.
 */
export function useTextReveal(
  fullText: string,
  charsPerSecond: number | null,
  messageId: string | undefined,
  paused = false
): string {
  const [revealedCount, setRevealedCount] = useState(0);
  const [trackedMessageId, setTrackedMessageId] = useState(messageId);
  const fullTextRef = useRef(fullText);
  const speedRef = useRef(charsPerSecond);
  const pausedRef = useRef(paused);
  const countRef = useRef(0);

  if (messageId !== trackedMessageId) {
    setTrackedMessageId(messageId);
    setRevealedCount(0);
    countRef.current = 0;
  }

  fullTextRef.current = fullText;
  speedRef.current = charsPerSecond;
  pausedRef.current = paused;

  // Instant mode: jump to the end (unless paused for a whiteboard draw).
  useEffect(() => {
    if (charsPerSecond !== null) return;
    if (paused) return;
    const len = fullTextRef.current.length;
    if (countRef.current < len) {
      countRef.current = len;
      setRevealedCount(len);
    }
  }, [charsPerSecond, fullText, paused]);

  // Progressive reveal loop. Re-runs when more text streams in, but never
  // resets countRef — so a mid-stream speed change only affects the rate
  // of characters that have not been written yet.
  useEffect(() => {
    if (charsPerSecond === null) return;

    let rafId = 0;
    let lastTime = performance.now();
    // Carry fractional chars so very slow speeds (<1 char/frame) still advance
    let frac = countRef.current - Math.floor(countRef.current);

    const tick = (now: number) => {
      const speed = speedRef.current;
      if (speed === null) return;

      // Freeze progress while a whiteboard equation is drawing, but keep the
      // loop alive so we resume seamlessly when paused clears.
      if (pausedRef.current) {
        lastTime = now;
        rafId = requestAnimationFrame(tick);
        return;
      }

      const target = fullTextRef.current.length;
      const current = Math.floor(countRef.current);

      if (current < target) {
        const deltaSec = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        frac += speed * deltaSec;
        const whole = Math.floor(frac);
        if (whole > 0) {
          frac -= whole;
          const next = Math.min(target, current + whole);
          countRef.current = next + frac;
          setRevealedCount(next);
        }
        rafId = requestAnimationFrame(tick);
      } else {
        // Caught up — keep a cheap poll so new streamed tokens re-enter
        lastTime = now;
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId, charsPerSecond === null]);

  if (charsPerSecond === null && !paused) return fullText;
  return fullText.slice(0, revealedCount);
}
