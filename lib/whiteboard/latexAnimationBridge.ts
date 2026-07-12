/**
 * Bridges LatexAnimatedShapeUtil → useWhiteboardMath so `renderLatex` can
 * await the stroke-draw animation finishing before the next equation starts.
 */

type ResolveFn = () => void;

const waiters = new Map<string, ResolveFn>();

/** Resolves when the shape's draw animation completes (or immediately if none). */
export function waitForLatexAnimation(shapeId: string): Promise<void> {
  return new Promise((resolve) => {
    waiters.set(shapeId, resolve);
  });
}

/** Called by the shape renderer when the draw animation settles. */
export function notifyLatexAnimationComplete(shapeId: string): void {
  const resolve = waiters.get(shapeId);
  if (!resolve) return;
  waiters.delete(shapeId);
  resolve();
}

/** Drop a waiter without resolving (e.g. createShape failed after registering). */
export function cancelLatexAnimationWait(shapeId: string): void {
  waiters.delete(shapeId);
}
