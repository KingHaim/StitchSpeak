import React from 'react';
import type { Language } from '../types';
import { LANGUAGES } from '../constants';
import { SelectDropdown } from './SelectDropdown';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelectLanguage: (language: Language) => void;
  label?: string;
  languages?: Language[];
  disabled?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onSelectLanguage,
  label = 'Translate to:',
  languages,
  disabled = false,
}) => {
  const items = languages ?? LANGUAGES;

  return (
    <SelectDropdown
      className="w-full sm:w-64"
      label={label}
      labelClassName="normal-case tracking-normal text-sm font-medium text-brand-500 mb-1"
      value={selectedLanguage.code}
      disabled={disabled}
      aria-label={label}
      buttonClassName="border-brand-200 bg-white py-2 shadow-sm focus-visible:ring-brand-500"
      options={items.map((language) => ({
        id: language.code,
        label: language.name,
      }))}
      onChange={(code) => {
        const language = items.find((item) => item.code === code);
        if (language) onSelectLanguage(language);
      }}
    />
  );
};
