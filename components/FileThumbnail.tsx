import React, { useEffect, useState } from 'react';
import { loadPdfJs } from '../services/pdfClient';

interface FileThumbnailProps {
  file: File;
  fallbackText: string;
  className?: string;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export const FileThumbnail: React.FC<FileThumbnailProps> = ({ file, fallbackText, className }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      setSrc(null);
      try {
        if (file.type.startsWith('image/')) {
          objectUrl = URL.createObjectURL(file);
          if (!cancelled) setSrc(objectUrl);
          return;
        }
        if (!isPdf(file) || file.size === 0) return;

        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const page = await pdf.getPage(1);
        const naturalViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.5, 320 / naturalViewport.width) });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        if (!cancelled) setSrc(canvas.toDataURL('image/jpeg', 0.82));
      } catch (error) {
        console.warn('[thumbnail] Could not render source file:', error);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src ? (
    <img src={src} alt={`${file.name} first page`} className={className} />
  ) : (
    <span className="font-headline italic text-4xl text-primary" aria-hidden>
      {fallbackText}
    </span>
  );
};
