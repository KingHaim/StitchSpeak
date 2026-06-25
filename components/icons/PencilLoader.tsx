import React from 'react';

export const PencilLoader: React.FC<React.SVGProps<SVGSVGElement>> = ({ className = '', ...props }) => (
  <svg
    className={`pencil ${className}`}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle
      className="pencil__stroke"
      r="70"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeDasharray="439.82 439.82"
      strokeDashoffset="439.82"
      strokeLinecap="round"
    />

    <g className="pencil__rotate">
      <circle
        className="pencil__body1"
        r="56"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeDasharray="351.86 351.86"
        strokeDashoffset="351.86"
      />
      <circle
        className="pencil__body2"
        r="64.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeDasharray="406.84 406.84"
        strokeDashoffset="406.84"
        opacity="0.38"
      />
      <circle
        className="pencil__body3"
        r="47.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeDasharray="296.88 296.88"
        strokeDashoffset="296.88"
        opacity="0.7"
      />

      <g className="pencil__eraser">
        <g className="pencil__eraser-skew">
          <rect x="-12" y="-12" width="24" height="24" rx="5" fill="currentColor" opacity="0.18" />
          <rect x="-10" y="-10" width="20" height="20" rx="4" fill="currentColor" opacity="0.34" />
          <path d="M-10 -2h20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </g>
      </g>

      <g className="pencil__point">
        <path d="M-11 -10L14 0L-11 10Z" fill="currentColor" opacity="0.2" />
        <path d="M14 0L25 0" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M-11 -10L14 0L-11 10Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </g>
    </g>
  </svg>
);
