export const RATE_LIMIT_MESSAGE = "RATE_LIMIT_REACHED";

export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object") {
    const maybeError = error as {
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
      responseBody?: unknown;
    };

    if (maybeError.status === 429 || maybeError.statusCode === 429) {
      return true;
    }

    if (
      isRateLimitMessage(maybeError.message) ||
      isRateLimitMessage(maybeError.responseBody)
    ) {
      return true;
    }
  }

  return isRateLimitMessage(error);
}

export function isRateLimitMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /RATE_LIMIT_REACHED|rate limit|quota|too many requests|429/i.test(value);
}

export function rateLimitResponse(
  message = "Rate limit reached. Please retry later."
): Response {
  return Response.json(
    {
      error: message,
      rateLimited: true,
    },
    { status: 429 }
  );
}
