import React, { useEffect, useRef, useState } from 'react';
import { fetchPatternThumbnail } from '../services/patternsService';

const PLACEHOLDER_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCpgaNtjUhnSj5fWpj87xmX14PtoZKyHM7hb4baN2rDogUl65AO0ibafZ14ruclNXszrqk0cPDsCbAQq0jE2uTl7O0ugog66FNhf1kPoqLnYm9G0Dmgo_p15HugFXDveT8JMwFc2YxswiVWaSfBXg1eVcGZlylIZ6N73Kahrmf5dldNq_zWvJ08qcuJkbp9tfMrZT6HO1nRl6P9ZWWUdfDnvSVTVMKYyIz_3dHa0rWbju1HWc3Utons2RGNYkGyTUCf3odTrnnWErM',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBc1XcTX1NH1noyUs-CXlYFOGPQoB8-zLXACloiMpophzG7iU2hFGxGHCCrl5-UNrvNUC4NIFh-yxE8X8k4HbFNvkyT_z_1hBo4jJq_PaHq9hHi2lOuLm90sHTm8QH0uKCMA6GW4Q2zo7XlLdfGrL0-n_frRJNzMXfErQf1OPbMsqUO4qwx5kI0rIdAgocq-Hh_8LJanOI3KgnDxYZbB7_1QY9BMnGGFBm64B9ok9USAepNMoUli77GQ-VYPLggACUvNXOSutENALw',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAp8x6mkJk3z5RUuLaSMeAjbAKwvKaMZ-nkWyd7yUY1EiDFQJ3jCQPF72QAmumkHFSMibgT6ETApHcxoeOnJMC2yZSS8SRw_GPEaD7VCUIqVab9adIh4Vrj2PyZ9Kmoml5D7TXbu3qd3t6jSAz6XNGjJxsDi-IieoldJMsU00-CuOgUjpZXRjS4B2LSRCbau5M-qfT4CrA3SyxYkRMqy9J0b2-gW__Ggl1kH22W0uRgYBRisC1hDqBHl_1D8Hwb5kDorxgh6u4N3Tg',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCPVwqLvTsZs-KtIZWItODiMcwjwvM9h9FLVPpPgTLADVi5IQozJmmlCWdrKnMkNpijSDBCoELeDzXED6JP6U4iPrOlQeCKE5oQlbDdo-ZHNcf7TtXLxOWQIhQlpjq7cYiD0-rQilb4tf_rKlhJ4bdlNnVO_hMocuHpvU9SBgz7FS2r0XKjViTxY2WqoZ1-9Pjh8yYuIKqD686gVnrb9fzpeTuF3XGp4bYc2ejIcV-xHP4Em8ZwvbhEEmRgBYqZ8Za4zknhArYJjmU',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCkHtLFIfOMQAPJNey1MQuD47ZSqkdBh-UxMDGfYMd13j8x5buZm7nPAJO1z0QCyb0HC3z-OK9D0tNcF5Vk7P67htIZEX6mIWM9673x3A41GZemb6RpMFHj63oxZTYNLqGaQguRZyYaF7LWs8rXwsjcjRmnGyAIzUwr71JYSHVX86Yeb1LDPT_Bs08Gzz7FxhrKtEQSJvVhn6jolOPMW1bWxVaVbLnaBKsZPj2OB8qSQOxlxVTEk7JC1k3I-GlxEB4hQlrv6ZlSXqU',
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
