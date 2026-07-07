import React from 'react';

export const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span className={`material-symbols-outlined ${className ?? ''}`} aria-hidden>
    {name}
  </span>
);

export const PrototypeBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-on-secondary-container">
    <Icon name="science" className="text-sm" />
    Prototype only
  </span>
);
