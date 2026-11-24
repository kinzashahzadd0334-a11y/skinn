import { GoogleGenAI } from '@google/genai';

export const GEMINI_MODEL = 'gemini-4-hydrogen';

export class AIServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AIServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AIServiceError(
      'Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
      503,
      'MISSING_GEMINI_KEY',
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractStatusCode(error: unknown): number {
  const errObj = error as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
    cause?: { status?: number; code?: string };
  };
  const candidate = errObj?.statusCode ?? errObj?.status ?? errObj?.response?.status ?? errObj?.cause?.status;
  if (typeof candidate === 'number' && candidate >= 100 && candidate < 600) {
    return candidate;
  }
  const msg = error instanceof Error ? error.message : '';
  const match = msg.match(/\b(400|401|403|404|408|413|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : 500;
}

function sanitizeErrorMessage(raw: string): string {
  // Defensively redact any Google API key pattern if ever echoed inside an upstream error string
  return raw.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]').trim();
}

export function formatGeminiError(
  error: unknown,
  routeLabel = 'ai',
): { status: number; message: string; code: string } {
  const rawMsg = error instanceof Error ? error.message : String(error || 'Unexpected AI service error.');
  const safeMsg = sanitizeErrorMessage(rawMsg);
  const errObj = error as { name?: string; code?: string; cause?: { code?: string } };
  const errCode = errObj?.code || errObj?.cause?.code || '';
  const statusCode = extractStatusCode(error);

  let formatted: { status: number; message: string; code: string };

  if (errCode === 'MISSING_GEMINI_KEY') {
    formatted = {
      status: 503,
      code: 'MISSING_GEMINI_KEY',
      message: safeMsg,
    };
  } else if (errCode === 'EMPTY_AI_RESPONSE') {
    formatted = {
      status: 502,
      code: 'EMPTY_AI_RESPONSE',
      message: 'AI Beauty Expert returned an empty response. Please rephrase your question and try again.',
    };
  } else if (errCode === 'INVALID_AI_JSON') {
    formatted = {
      status: 502,
      code: 'INVALID_AI_JSON',
      message: 'AI Beauty Expert returned an unreadable response format. Please retry.',
    };
  } else if (errCode === 'CLIENT_ABORTED') {
    formatted = {
      status: 499,
      code: 'CLIENT_ABORTED',
      message: 'Request was cancelled before completion.',
    };
  } else if (
    errCode === 'AI_TIMEOUT' ||
    errObj?.name === 'TimeoutError' ||
    statusCode === 504 ||
    statusCode === 408 ||
    /ETIMEDOUT|timed?\s*out/i.test(`${errCode} ${safeMsg}`)
  ) {
    formatted = {
      status: 504,
      code: 'AI_TIMEOUT',
      message: 'The AI Beauty Expert took too long to respond. Please try again.',
    };
  } else if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(safeMsg) || statusCode === 403) {
    formatted = {
      status: 403,
      code: 'API_KEY_INVALID',
      message: 'Please verify your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  } else if (/UNAUTHENTICATED|invalid authentication/i.test(safeMsg) || statusCode === 401) {
    formatted = {
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'AI service authentication failed. Please check GEMINI_API_KEY in Settings > Secrets.',
    };
  } else if (/NOT_FOUND|model.*not found/i.test(safeMsg) || statusCode === 404) {
    formatted = {
      status: 404,
      code: 'AI_MODEL_NOT_FOUND',
      message: 'Configured AI model or endpoint was not found. Please verify model configuration.',
    };
  } else if (/INVALID_ARGUMENT|bad request/i.test(safeMsg) || statusCode === 400) {
    formatted = {
      status: 400,
      code: 'INVALID_ARGUMENT',
      message: 'The request could not be processed by the AI service. Please check your message or photo and try again.',
    };
  } else if (/RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(safeMsg) || statusCode === 429) {
    formatted = {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message: 'AI rate quota temporarily reached. Please wait a few seconds and try again.',
    };
  } else if (/UNAVAILABLE|high demand|overloaded/i.test(safeMsg) || statusCode === 503 || statusCode === 502) {
    formatted = {
      status: statusCode === 502 ? 502 : 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'Our AI Beauty Expert is experiencing temporary high demand. Please wait a moment and try again.',
    };
  } else if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|network/i.test(`${errCode} ${safeMsg}`)) {
    formatted = {
      status: 502,
      code: 'AI_NETWORK_ERROR',
      message: 'Unable to reach the AI service right now. Please check connectivity and retry.',
    };
  } else {
    formatted = {
      status: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      code: 'AI_SERVICE_ERROR',
      message: safeMsg || 'AI Beauty Expert encountered an unexpected server error.',
    };
  }

  console.error(
    `[AI Error] route=${routeLabel} status=${formatted.status} code=${formatted.code} detail=${JSON.stringify(safeMsg.slice(0, 240))}`,
  );

  return formatted;
}

function isRetryableGeminiError(error: unknown): boolean {
  const status = extractStatusCode(error);
  const errObj = error as { code?: string; name?: string; cause?: { code?: string } };
  const msg = error instanceof Error ? error.message : '';
  const code = errObj?.code || errObj?.cause?.code || '';

  if (code === 'MISSING_GEMINI_KEY' || status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  if (errObj?.name === 'AbortError' || /aborted/i.test(msg)) {
    return false;
  }
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|ECONNRESET|ETIMEDOUT|fetch failed/i.test(`${code} ${msg}`)
  );
}

export async function withGeminiRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; maxRetries?: number; parentSignal?: AbortSignal } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 35_000;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.parentSignal?.aborted) {
      throw new AIServiceError('Request cancelled by client.', 499, 'CLIENT_ABORTED');
    }

    const attemptController = new AbortController();
    const onParentAbort = () => attemptController.abort(options.parentSignal?.reason);
    options.parentSignal?.addEventListener('abort', onParentAbort, { once: true });

    const timer = setTimeout(() => {
      attemptController.abort(new Error(`AI request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      return await operation(attemptController.signal);
    } catch (error) {
      lastError = error;
      if (attemptController.signal.aborted && !options.parentSignal?.aborted) {
        throw new AIServiceError('The AI Beauty Expert timed out while generating a response.', 504, 'AI_TIMEOUT');
      }
      if (attempt >= maxRetries || !isRetryableGeminiError(error)) {
        throw error;
      }
      const delayMs = 450 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      clearTimeout(timer);
      options.parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }

  throw lastError;
}

