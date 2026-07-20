export const RATE_LIMIT_MESSAGE = "RATE_LIMIT_REACHED";

export function isRateLimitMessage(value: unknown): boolean {
  return typeof value === "string" && /RATE_LIMIT_REACHED|LLM7_RATE_LIMITED|GEMMA_RATE_LIMITED|rate limit|quota|too many requests|429/i.test(value);
}

export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
    if (candidate.status === 429 || candidate.statusCode === 429) return true;
    return isRateLimitMessage(candidate.message);
  }
  return isRateLimitMessage(error);
}

export function rateLimitResponse(message = "Rate limit reached. Please retry later.") {
  return Response.json({ error: message, rateLimited: true }, { status: 429 });
}
