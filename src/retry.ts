export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // Add randomness to prevent thundering herd
}

export const DEFAULT_MOVEMENT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 1,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = "RetryError";
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_MOVEMENT_RETRY_CONFIG,
  operationName: string = "operation"
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt > config.maxRetries) {
        console.error(
          `💥 ${operationName} failed after ${config.maxRetries} retries - killing process`
        );
        throw new RetryError(
          `${operationName} failed after ${config.maxRetries} attempts`,
          attempt - 1,
          lastError
        );
      }

      const delay = calculateDelay(attempt - 1, config);
      console.log(
        `⚠️  ${operationName} failed (attempt ${attempt}/${
          config.maxRetries + 1
        }), retrying in ${delay}ms...`
      );
      console.log(`   Error: ${lastError.message}`);

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  // Calculate exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitterFactor * (Math.random() - 0.5);

  return Math.max(0, Math.round(cappedDelay + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
