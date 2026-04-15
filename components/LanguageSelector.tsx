
import React, { useState, useRef, useEffect } from 'react';
import type { Language } from '../types';
import { LANGUAGES } from '../constants';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelectLanguage: (language: Language) => void;
  disabled?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onSelectLanguage,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const handleSelect = (language: Language) => {
    onSelectLanguage(language);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full sm:w-64" ref={wrapperRef}>
      <label className="block text-sm font-medium text-brand-500 mb-1">Translate to:</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full bg-white border border-brand-200 rounded-lg shadow-sm pl-3 pr-10 py-2 text-left focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors duration-200 disabled:bg-brand-100 disabled:text-brand-400"
      >
        <span className="block truncate">{selectedLanguage.name}</span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {LANGUAGES.map((language) => (
            <li
              key={language.code}
              onClick={() => handleSelect(language)}
              className="text-gray-900 cursor-default select-none relative py-2 pl-3 pr-9 hover:bg-brand-50"
            >
              <span className={`block truncate ${selectedLanguage.code === language.code ? 'font-semibold' : 'font-normal'}`}>
                {language.name}
              </span>
              {selectedLanguage.code === language.code && (
                <span className="text-brand-600 absolute inset-y-0 right-0 flex items-center pr-4">
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
