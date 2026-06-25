import React, { useEffect, useRef, useState } from 'react';
import { fetchPatternThumbnail } from '../services/patternsService';

const PLACEHOLDER_IMAGES = [
  '/landing-hero.jpg',
  '/landing-community.jpg',
  '/logo.png',
];

function placeholderFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i)) % 997;
  return PLACEHOLDER_IMAGES[h % PLACEHOLDER_IMAGES.length];
}

/**
 * In-memory cache of resolved object URLs keyed on patternId+token. Saves a
 * round-trip when the user toggles between filters/views — but small enough
 * that we don't worry about eviction (one entry per pattern in the gallery).
 */
const blobUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(idToken: string, patternId: string): string {
  return `${idToken.slice(-12)}:${patternId}`;
}

async function resolveThumbnailUrl(
  idToken: string,
  patternId: string,
): Promise<string | null> {
  const key = cacheKey(idToken, patternId);
  const cached = blobUrlCache.get(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      const blob = await fetchPatternThumbnail(idToken, patternId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(key, url);
      return url;
    } catch (err) {
      console.warn(`[thumbnail] fetch failed for ${patternId}:`, err);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

export interface PatternThumbnailProps {
  patternId: string;
  /** When false, skip the network fetch entirely and show the placeholder. */
  hasThumbnail: boolean;
  idToken: string | null;
  /** Stable seed for the deterministic placeholder (typically the source file name). */
  fallbackKey: string;
  alt?: string;
  className?: string;
}

/**
 * Renders the server-stored page-1 thumbnail for a pattern, falling back to a
 * deterministic placeholder when the thumbnail is missing, the user is in
 * guest mode, or the auth token has expired. Object URLs are cached so the
 * same image isn't fetched repeatedly across re-renders.
 */
export const PatternThumbnail: React.FC<PatternThumbnailProps> = ({
  patternId,
  hasThumbnail,
  idToken,
  fallbackKey,
  alt = '',
  className,
}) => {
  const [src, setSrc] = useState<string>(() => placeholderFor(fallbackKey));
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setSrc(placeholderFor(fallbackKey));
    if (!hasThumbnail || !idToken) return;
    void (async () => {
      const url = await resolveThumbnailUrl(idToken, patternId);
      if (cancelRef.current) return;
      if (url) setSrc(url);
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [patternId, hasThumbnail, idToken, fallbackKey]);

  return <img src={src} alt={alt} className={className} loading="lazy" />;
};
