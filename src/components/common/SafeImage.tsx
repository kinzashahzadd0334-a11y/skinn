import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { isIdbMediaUri, useResolvedMediaUrl } from '../../db/mediaResolver';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function SafeImage({ src, alt, className = '', fallbackTitle }: SafeImageProps) {
  const resolvedSrc = useResolvedMediaUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src, resolvedSrc]);

  const awaitingIdbResolution = isIdbMediaUri(src) && !resolvedSrc;

  if (awaitingIdbResolution) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-gradient-to-br from-[#F1EAE0] via-[#FAF6EE] to-[#E9DFD0] text-[#4A5D3F]/60 ${className}`}
      >
        <Sparkles className="w-5 h-5 animate-pulse" strokeWidth={1.5} />
      </div>
    );
  }

  if (failed || !resolvedSrc) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F1EAE0] via-[#FAF6EE] to-[#E9DFD0] text-[#4A5D3F] p-6 text-center ${className}`}
      >
        <Sparkles className="w-7 h-7 opacity-60 mb-2" strokeWidth={1.5} />
        <span className="font-display text-lg text-[#232620]">{fallbackTitle || alt}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
