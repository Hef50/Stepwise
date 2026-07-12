/**
 * Detects whether the user's message is requesting something be drawn,
 * shown, or explained on the whiteboard / canvas.
 */
const INTENT_RE =
  /\b(?:on\s+(?:the\s+)?(?:whiteboard|board|canvas)|draw(?:\s+(?:on|it|me|this|that))?|sketch(?:\s+(?:it|this|that))?|write\s+(?:on|that|this|it)|show\s+(?:me\s+)?(?:on\s+(?:the\s+)?(?:whiteboard|board|canvas))|explain\s+(?:on|using|on\s+the)\s+(?:whiteboard|board|canvas)|diagram(?:\s+(?:it|this|that))?|visuali[sz]e)\b/i;

export function detectWhiteboardIntent(text: string): boolean {
  return INTENT_RE.test(text);
}
