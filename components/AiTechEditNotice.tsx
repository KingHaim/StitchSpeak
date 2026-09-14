import React from 'react';

/**
 * Locked product copy (Patterns craft gate): the automated-draft ≠ published
 * tech edit line shown on the translate/review path. Keep the wording in this
 * one place — every surface that needs the disclaimer renders this component.
 */
export const AI_TECH_EDIT_NOTICE =
  'This is an automated draft translation, not a published tech edit. Number and glossary checks are automated — have a human tech editor review the pattern before publication.';

export const AiTechEditNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p
    data-testid="ai-tech-edit-notice"
    className={`flex items-start gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant leading-snug ${className}`}
  >
    <span className="material-symbols-outlined text-lg text-primary shrink-0 mt-px" aria-hidden>
      info
    </span>
    <span>{AI_TECH_EDIT_NOTICE}</span>
  </p>
);
