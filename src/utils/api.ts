export function normalizeApiErrorMessage(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: string | { message?: string; code?: number; status?: string };
        message?: string;
      };
      const inner =
        typeof parsed?.error === 'string'
          ? parsed.error
          : parsed?.error?.message || parsed?.message;
      if (inner) {
        if (/high demand|UNAVAILABLE|503/i.test(inner)) {
          return 'Our AI Skincare Specialist is experiencing temporary high demand. Please wait a moment and try again.';
        }
        return inner;
      }
    } catch {
      // fall through to raw text
    }
  }
  if (/high demand|UNAVAILABLE/i.test(trimmed)) {
    return 'Our AI Skincare Specialist is experiencing temporary high demand. Please wait a moment and try again.';
  }
  return trimmed;
}

export function mapHttpStatusToErrorMessage(
  status: number,
  contentType: string | null,
  rawBody: string,
  fallback: string,
): string {
  const isJson = Boolean(contentType?.includes('application/json'));
  const isHtml = Boolean(contentType?.includes('text/html')) || /^\s*</i.test(rawBody);

  if (isJson && rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as { error?: string; message?: string };
      const msg = normalizeApiErrorMessage(parsed.error || parsed.message, '');
      if (msg) return msg;
    } catch {
      // fall through to status-based diagnostic
    }
  }

  if (isHtml) {
    if (status === 404) {
      return 'AI API endpoint was not found (HTTP 404). Please verify the backend API routes are deployed.';
    }
    if (status === 401 || status === 403) {
      return `Request was blocked before reaching the API (HTTP ${status}). Please refresh the page and sign in again.`;
    }
    if (status === 502 || status === 503 || status === 504) {
      return `The server gateway returned a temporary error (HTTP ${status}). Please try again in a moment.`;
    }
    if (status >= 200 && status < 300) {
      return 'The API endpoint returned an HTML page instead of API data. Verify the backend server handles /api/* in production.';
    }
    return `The server returned an unexpected HTML response (HTTP ${status}). Please check deployment API routing.`;
  }

  switch (status) {
    case 400:
      return 'Invalid request sent to the AI Specialist. Please check your input and try again.';
    case 401:
      return 'AI service authentication failed (HTTP 401). Verify GEMINI_API_KEY configuration.';
    case 403:
      return 'Please verify your GEMINI_API_KEY in the Settings > Secrets panel (HTTP 403).';
    case 404:
      return 'AI API route not found (HTTP 404). Verify the server endpoint path.';
    case 405:
      return 'HTTP method not allowed for this AI endpoint (HTTP 405).';
    case 429:
      return 'AI service rate limit reached (HTTP 429). Please wait a few seconds and try again.';
    case 500:
      return 'AI server encountered an internal error (HTTP 500). Please try again shortly.';
    case 502:
    case 503:
      return `AI service is temporarily unavailable (HTTP ${status}). Please wait a moment and try again.`;
    case 504:
      return 'AI consultation timed out (HTTP 504). Please retry your request.';
    default:
      return rawBody.trim() && rawBody.length < 240 ? rawBody.trim() : fallback;
  }
}

export async function safeParseJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const contentType = response.headers.get('content-type');
  const rawBody = await response.text();

  if (!contentType?.includes('application/json')) {
    throw new Error(mapHttpStatusToErrorMessage(response.status, contentType, rawBody, fallbackError));
  }

  let data: (T & { error?: string; message?: string }) | null = null;
  try {
    data = rawBody.trim()
      ? (JSON.parse(rawBody) as T & { error?: string; message?: string })
      : ({} as T & { error?: string; message?: string });
  } catch {
    throw new Error(mapHttpStatusToErrorMessage(response.status, 'text/plain', rawBody, 'API returned invalid JSON.'));
  }

  if (!response.ok) {
    throw new Error(normalizeApiErrorMessage(data?.error || data?.message, fallbackError));
  }

  return data as T;
}

export function prepareUploadImageDataUrl(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (!rawDataUrl) {
        reject(new Error('Could not read the selected image file.'));
        return;
      }

      const rawMime = file.type || 'image/jpeg';
      // Keep small images untouched; resize/compress larger smartphone photos so they stay well under API limits
      if (file.size <= 1_500_000) {
        resolve({ dataUrl: rawDataUrl, mimeType: rawMime });
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1600;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ dataUrl: rawDataUrl, mimeType: rawMime });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedUrl = canvas.toDataURL('image/jpeg', 0.86);
          resolve({ dataUrl: compressedUrl, mimeType: 'image/jpeg' });
        } catch {
          resolve({ dataUrl: rawDataUrl, mimeType: rawMime });
        }
      };
      img.onerror = () => resolve({ dataUrl: rawDataUrl, mimeType: rawMime });
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}
