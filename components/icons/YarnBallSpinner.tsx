import React from 'react';

export const YarnBallSpinner: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <g className="animate-spin" style={{ transformOrigin: '50% 50%' }}>
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.2"
      />
      <path
        d="M26,35 C40,20 60,20 74,35"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M26,65 C40,80 60,80 74,65"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M35,26 C20,40 20,60 35,74"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M65,26 C80,40 80,60 65,74"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse
        cx="50"
        cy="50"
        rx="45"
        ry="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        transform="rotate(-20 50 50)"
        opacity="0.8"
      />
    </g>
  </svg>
);
