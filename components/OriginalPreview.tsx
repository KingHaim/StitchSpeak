import React, { useMemo } from 'react';

interface OriginalPreviewProps {
  file: File;
  variant?: 'card' | 'studio';
}

export const OriginalPreview: React.FC<OriginalPreviewProps> = ({ file, variant = 'card' }) => {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const sizeLabel = `${(file.size / 1024).toFixed(1)} KB`;

  const compactCard = (
    <div
      className={
        variant === 'studio'
          ? 'flex items-center gap-3 p-3 bg-surface-container-lowest/80 border border-outline-variant/20 rounded-xl shadow-inner'
          : 'flex items-center gap-3 p-3 bg-white border border-brand-200 rounded-xl shadow-inner'
      }
    >
      <svg
        className={`w-8 h-8 shrink-0 ${variant === 'studio' ? 'text-primary' : 'text-brand-500'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
      <div className="min-w-0">
        <p className={`text-sm font-medium truncate ${variant === 'studio' ? 'text-on-surface' : 'text-brand-800'}`}>{file.name}</p>
        <p className={`text-xs ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}>{sizeLabel}</p>
      </div>
    </div>
  );

  if (file.type === 'application/pdf') {
    return (
      <>
        <div className="lg:hidden">{compactCard}</div>
        <div
          className={
            variant === 'studio'
              ? 'hidden lg:block w-full min-h-[min(500px,70vh)] lg:min-h-[500px] lg:h-[500px] bg-white/95 border border-outline-variant/15 rounded-lg overflow-hidden shadow-inner'
              : 'hidden lg:block w-full h-[32rem] bg-white border border-brand-200 rounded-xl overflow-hidden shadow-inner'
          }
        >
          <object
            data={objectUrl}
            type="application/pdf"
            className="w-full h-full"
          >
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <svg
                className={`w-10 h-10 mb-3 ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className={`text-sm font-medium ${variant === 'studio' ? 'text-on-surface' : 'text-brand-500'}`}>{file.name}</p>
              <p className={`text-xs mt-1 ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}>PDF preview not available in this browser</p>
            </div>
          </object>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="lg:hidden">{compactCard}</div>
      <div
        className={
          variant === 'studio'
            ? 'hidden lg:flex w-full min-h-[min(500px,70vh)] lg:min-h-[500px] lg:h-[500px] bg-white/95 border border-outline-variant/15 rounded-lg overflow-hidden shadow-inner flex-col items-center justify-center p-6 text-center'
            : 'hidden lg:flex w-full h-[32rem] bg-white border border-brand-200 rounded-xl overflow-hidden shadow-inner flex-col items-center justify-center p-6 text-center'
        }
      >
        <svg
          className={`w-10 h-10 mb-3 ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className={`text-sm font-medium ${variant === 'studio' ? 'text-on-surface' : 'text-brand-500'}`}>{file.name}</p>
        <p className={`text-xs mt-1 ${variant === 'studio' ? 'text-on-surface-variant' : 'text-brand-400'}`}>{sizeLabel}</p>
      </div>
    </>
  );
};
