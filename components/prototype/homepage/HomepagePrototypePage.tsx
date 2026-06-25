/**
 * PROTOTYPE — Three homepage/app-experience directions for StitchSpeak.
 * Question: Should landing stay editorial, lead with the upload tool, or preview the app shell?
 *
 * Open in dev: http://localhost:5173/?prototype=homepage&variant=A
 * Variants: A (editorial), B (tool-first), C (app shell)
 */
import React, { useEffect, useState } from 'react';
import { PrototypeSwitcher } from '../PrototypeSwitcher';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

const VARIANTS = [
  { key: 'A', name: 'Editorial landing', Component: VariantA },
  { key: 'B', name: 'Tool-first workshop', Component: VariantB },
  { key: 'C', name: 'App shell preview', Component: VariantC },
] as const;

type VariantKey = (typeof VARIANTS)[number]['key'];

const readVariant = (): VariantKey => {
  const key = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return VARIANTS.some((variant) => variant.key === key) ? (key as VariantKey) : 'A';
};

export const HomepagePrototypePage: React.FC = () => {
  const [variant, setVariant] = useState<VariantKey>(readVariant);

  useEffect(() => {
    const syncFromUrl = () => setVariant(readVariant());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const active = VARIANTS.find((item) => item.key === variant) ?? VARIANTS[0];
  const ActiveComponent = active.Component;

  return (
    <>
      <ActiveComponent />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant}
      />
    </>
  );
};
