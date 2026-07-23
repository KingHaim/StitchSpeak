import { ChevronDown } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { Dropdown } from '@/components/ui/base/dropdown/dropdown';
import { cx } from '@/utils/cx';
import {
  WEBSITE_LANGUAGES,
  type WebsiteLocale,
} from '../utils/websiteLocalization';

interface WebsiteLanguageSelectorProps {
  value: WebsiteLocale;
  onChange: (locale: WebsiteLocale) => void;
  ariaLabel: string;
}

export function WebsiteLanguageSelector({
  value,
  onChange,
  ariaLabel,
}: WebsiteLanguageSelectorProps) {
  const selectedLanguage =
    WEBSITE_LANGUAGES.find((language) => language.code === value) ??
    WEBSITE_LANGUAGES[0];

  return (
    <Dropdown.Root>
      <AriaButton
        aria-label={ariaLabel}
        className={(state) =>
          cx(
            'group inline-flex h-11 items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest/75 px-2.5 text-sm font-semibold text-on-surface shadow-sm outline-hidden transition',
            'hover:border-outline-variant/55 hover:bg-surface-container-lowest',
            state.isPressed && 'translate-y-px bg-surface-container',
            state.isFocusVisible && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
          )
        }
      >
        <span
          className="text-lg leading-none"
          role="img"
          aria-label={selectedLanguage.name}
        >
          {selectedLanguage.flag}
        </span>
        <span className="hidden sm:inline">{selectedLanguage.shortName}</span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 stroke-[2.5px] text-on-surface-variant transition-transform group-aria-expanded:rotate-180"
        />
      </AriaButton>

      <Dropdown.Popover placement="bottom end" className="w-48">
        <Dropdown.Menu
          aria-label={ariaLabel}
          selectionMode="single"
          selectedKeys={new Set([value])}
          disallowEmptySelection
          onSelectionChange={(keys) => {
            const nextLocale = [...keys][0];
            if (typeof nextLocale === 'string') {
              onChange(nextLocale as WebsiteLocale);
            }
          }}
        >
          {WEBSITE_LANGUAGES.map((language) => (
            <Dropdown.Item
              key={language.code}
              id={language.code}
              label={`${language.flag}  ${language.name}`}
              textValue={language.name}
            />
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}
