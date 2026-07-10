import { useState } from 'react';

interface ProxiedImageProps {
  src?: string;
  alt?: string;
  className?: string;
}

/**
 * Processes an image URL through the CORS proxy when needed.
 */
export function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/api/imagem?url=')) return url;
  if (url.startsWith('//')) return `/api/imagem?url=${encodeURIComponent('https:' + url)}`;
  if (url.startsWith('/')) return `/api/imagem?url=${encodeURIComponent('https://api.enem.dev' + url)}`;
  if (!url.startsWith('http')) return `/api/imagem?url=${encodeURIComponent('https://api.enem.dev/v1/' + url)}`;
  if (url.includes('enem.dev')) return `/api/imagem?url=${encodeURIComponent(url)}`;
  return url;
}

/**
 * A unified, reusable image component for ENEM question images.
 * Handles CORS proxying, loading errors with fallback, and consistent styling.
 */
export default function ProxiedImage({ src, alt, className = '' }: ProxiedImageProps) {
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(() => src ? getProxiedImageUrl(src) : '');
  const [triedOriginal, setTriedOriginal] = useState(false);

  if (!currentSrc) return null;

  const handleError = () => {
    if (currentSrc.includes('/api/imagem') && !triedOriginal) {
      // Fallback: try the original URL directly
      const urlParams = new URLSearchParams(currentSrc.split('?')[1]);
      const original = urlParams.get('url');
      if (original) {
        setTriedOriginal(true);
        setCurrentSrc(original);
        return;
      }
    }
    setHasError(true);
  };

  if (hasError) return null;

  return (
    <span className="block my-6 md:my-8">
      <img
        src={currentSrc}
        alt={alt || 'Imagem da questão'}
        className={`max-w-full h-auto rounded-2xl md:rounded-3xl mx-auto bg-bg-sidebar p-3 md:p-4 shadow-inner ring-1 ring-border-color ${className}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={handleError}
      />
    </span>
  );
}

/**
 * Shared ReactMarkdown image component override.
 * Use as: components={{ img: MarkdownImage }}
 */
export function MarkdownImage(props: { src?: string; alt?: string }) {
  return <ProxiedImage src={props.src} alt={props.alt} />;
}
