/**
 * Shared constants and helpers for all AI-authored whiteboard custom shapes.
 *
 * Each shape file is intentionally self-contained and imports only from
 * this module for shared primitives — never from sibling shape files —
 * so that two developers can work on different shapes in parallel without
 * merge conflicts.
 */

export const DEFAULT_SHAPE_WIDTH = 400;
export const DEFAULT_SHAPE_HEIGHT = 200;

/** Minimum dimensions to prevent degenerate shapes. */
export const MIN_WIDTH = 120;
export const MIN_HEIGHT = 60;
