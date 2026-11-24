import { useEffect, useState } from 'react';

export const IDB_MEDIA_PREFIX = 'idb-media://';

export interface MediaBlobRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: string;
}

type BlobLoader = (id: string) => Promise<MediaBlobRecord | null>;

let registeredLoader: BlobLoader | null = null;
const objectUrlCache = new Map<string, string>();
const inFlightResolutions = new Map<string, Promise<string>>();

export function registerMediaBlobLoader(loader: BlobLoader): void {
  registeredLoader = loader;
}

export function isIdbMediaUri(uri?: string | null): uri is string {
  return typeof uri === 'string' && uri.startsWith(IDB_MEDIA_PREFIX);
}

export function extractMediaId(uri: string): string {
  return uri.slice(IDB_MEDIA_PREFIX.length);
}

export function revokeCachedMediaUrl(uriOrId: string): void {
  const uri = isIdbMediaUri(uriOrId) ? uriOrId : `${IDB_MEDIA_PREFIX}${uriOrId}`;
  const existing = objectUrlCache.get(uri);
  if (existing && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(existing);
    } catch {
      // Ignore revoke error
    }
  }
  objectUrlCache.delete(uri);
}

export function clearMediaObjectUrlCache(): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const url of objectUrlCache.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }
  }
  objectUrlCache.clear();
}

export function getCachedMediaUrlSync(src: string): string {
  if (!isIdbMediaUri(src)) return src;
  return objectUrlCache.get(src) || '';
}

export async function resolveMediaUrl(src?: string | null): Promise<string> {
  if (!src) return '';
  if (!isIdbMediaUri(src)) return src;

  const cached = objectUrlCache.get(src);
  if (cached) return cached;

  const existingFlight = inFlightResolutions.get(src);
  if (existingFlight) return existingFlight;

  const task = (async () => {
    try {
      if (!registeredLoader) return '';
      const record = await registeredLoader(extractMediaId(src));
      if (!record?.blob) return '';
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const objUrl = URL.createObjectURL(record.blob);
        objectUrlCache.set(src, objUrl);
        return objUrl;
      }
      return await blobToDataUrl(record.blob);
    } catch {
      return '';
    } finally {
      inFlightResolutions.delete(src);
    }
  })();

  inFlightResolutions.set(src, task);
  return task;
}

export function useResolvedMediaUrl(src?: string | null): string {
  const [resolved, setResolved] = useState<string>(() => {
    if (!src) return '';
    if (!isIdbMediaUri(src)) return src;
    return objectUrlCache.get(src) || '';
  });

  useEffect(() => {
    let active = true;
    if (!src) {
      setResolved('');
      return;
    }
    if (!isIdbMediaUri(src)) {
      setResolved(src);
      return;
    }
    const cached = objectUrlCache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    setResolved('');
    void resolveMediaUrl(src).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not serialize media Blob.'));
      reader.readAsDataURL(blob);
      return;
    }
    blob
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        resolve(`data:${blob.type || 'application/octet-stream'};base64,${b64}`);
      })
      .catch(reject);
  });
}

export function dataUrlToBlob(dataUrl: string, fallbackMime = 'application/octet-stream'): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
  const mimeType = match?.[1] || fallbackMime;
  const base64 = (match ? match[2] : dataUrl).trim();
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
