import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

/**
 * Hardcoded smoke-test assistant response for Dev Mode ("t" in chat).
 *
 * Uses the LLM7 NO_TOOLS format so the real client path is exercised:
 *   - chat text streaming / reveal
 *   - $$...$$ → LaTeX whiteboard shapes
 *   - [[board: ...]] → handwritten whiteboard labels
 *
 * MAINTAINER NOTE: Update this suite whenever you add whiteboard / chat
 * features (e.g. diagrams, Mermaid, new board markers, tool-call paths).
 * Keep each section intentionally simple so failures are easy to spot.
 */
export const SMOKE_TEST_RESPONSE = `[[board: Smoke test]]

This is a **Dev Mode** whiteboard smoke test (no LLM tokens used).

First, a labeled quadratic formula:

[[board: Quadratic formula]]

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

Next, the discriminant and a second equation:

[[board: Discriminant]]

$$
\\Delta = b^2 - 4ac
$$

And a short title-style label with another bit of display math:

[[board: Chain rule]]

$$
\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}
$$

If you see streamed chat text, animated LaTeX, and handwritten labels on the board in order, the UI smoke path is healthy.
`;

const CHUNK_SIZE = 14;
const CHUNK_DELAY_MS = 22;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stream the canned smoke-test response as a UI message stream (SSE). */
export function createSmokeTestStreamResponse(): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });

      const textId = "smoke-test-text";
      writer.write({ type: "text-start", id: textId });

      for (let i = 0; i < SMOKE_TEST_RESPONSE.length; i += CHUNK_SIZE) {
        writer.write({
          type: "text-delta",
          id: textId,
          delta: SMOKE_TEST_RESPONSE.slice(i, i + CHUNK_SIZE),
        });
        await sleep(CHUNK_DELAY_MS);
      }

      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
