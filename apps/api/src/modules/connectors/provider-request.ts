const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

type ProviderRequestOptions = {
  provider: string;
  endpoint: string | URL;
  init: RequestInit;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export async function fetchProviderRequest({
  provider,
  endpoint,
  init,
  maxRetries = 2,
  baseDelayMs = 100,
  maxDelayMs = 1_000
}: ProviderRequestOptions): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(endpoint, init);

    if (response.ok) {
      return response;
    }

    const shouldRetry =
      transientStatuses.has(response.status) && attempt < maxRetries;

    if (!shouldRetry) {
      const text = await safeReadText(response);
      throw new Error(
        `${provider} API request failed: ${response.status}${text ? ` ${text}` : ""}`
      );
    }

    await delay(retryDelayMs(response, attempt, baseDelayMs, maxDelayMs));
  }
}

function retryDelayMs(
  response: Response,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
) {
  const retryAfterDelay = parseRetryAfterMs(response.headers?.get("Retry-After"));

  if (retryAfterDelay !== null) {
    return Math.min(retryAfterDelay, maxDelayMs);
  }

  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitter = Math.floor(Math.random() * Math.max(1, exponential * 0.25));
  return Math.min(exponential + jitter, maxDelayMs);
}

function parseRetryAfterMs(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const dateMs = Date.parse(normalized);
  if (Number.isNaN(dateMs)) {
    return null;
  }

  return Math.max(0, dateMs - Date.now());
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
