
import React from 'react';

export const UploadIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="-1.5 -1 23 18"
    className={['shrink-0 overflow-visible', className].filter(Boolean).join(' ')}
    {...props}
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 4.25A5.5 5.5 0 0 0 5 1.5a5.5 5.5 0 0 0-5 5.207A5.5 5.5 0 0 0 4.5 13H8m-2 2 4-4 4 4m-4-4v12"
    />
  </svg>
);
