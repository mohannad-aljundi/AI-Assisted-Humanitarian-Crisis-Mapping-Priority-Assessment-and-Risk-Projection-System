export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryable?: (error: unknown) => boolean;
}

const DEFAULT_RETRYABLE = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    return (
      name === "aborterror" ||
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("econnreset") ||
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("503") ||
      msg.includes("502")
    );
  }
  return false;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const isRetryable = options.retryable ?? DEFAULT_RETRYABLE;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200,
        maxDelayMs
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
