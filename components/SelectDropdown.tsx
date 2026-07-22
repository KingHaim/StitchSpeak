import { ChevronDown } from '@untitledui/icons';
import { Button as AriaButton } from 'react-aria-components';
import { Dropdown } from '@/components/ui/base/dropdown/dropdown';
import { cx } from '@/utils/cx';

export type SelectDropdownOption = {
  id: string;
  label: string;
  isDisabled?: boolean;
};

type SelectDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectDropdownOption[];
  placeholder?: string;
  label?: string;
  labelClassName?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  /** Dark/admin surfaces */
  variant?: 'default' | 'inverse';
  'aria-label'?: string;
};

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  label,
  labelClassName,
  id,
  disabled = false,
  className,
  buttonClassName,
  variant = 'default',
  'aria-label': ariaLabel,
}: SelectDropdownProps) {
  const selected = options.find((o) => o.id === value);
  const selectedKeys = value ? new Set([value]) : new Set<string>();
  const isInverse = variant === 'inverse';

  return (
    <div className={cx('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className={cx(
            'mb-1.5 block text-xs font-semibold uppercase tracking-wider',
            isInverse ? 'text-white/55' : 'text-on-surface-variant',
            labelClassName,
          )}
        >
          {label}
        </label>
      )}
      <Dropdown.Root>
        <AriaButton
          id={id}
          isDisabled={disabled}
          aria-label={ariaLabel ?? label ?? placeholder}
          className={(state) =>
            cx(
              'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm outline-hidden transition-colors',
              isInverse
                ? 'border-white/15 bg-white/10 text-white'
                : 'border-outline-variant/40 bg-surface-container-lowest text-on-surface',
              !disabled && (isInverse ? 'hover:bg-white/15' : 'hover:border-outline-variant/60'),
              state.isFocusVisible && (isInverse ? 'ring-2 ring-white/40' : 'ring-2 ring-primary/40'),
              disabled && 'cursor-not-allowed opacity-50',
              buttonClassName,
            )
          }
        >
          <span
            className={cx(
              'min-w-0 flex-1 truncate',
              !selected && (isInverse ? 'text-white/45' : 'text-on-surface-variant'),
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            aria-hidden
            className={cx(
              'size-4 shrink-0 stroke-[2.25px]',
              isInverse ? 'text-white/55' : 'text-on-surface-variant',
            )}
          />
        </AriaButton>
        <Dropdown.Popover placement="bottom start" className="w-[var(--trigger-width)]">
          <Dropdown.Menu
            selectionMode="single"
            selectedKeys={selectedKeys}
            disallowEmptySelection={Boolean(value) || options.length === 0}
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              if (key != null) onChange(String(key));
            }}
          >
            {options.map((option) => (
              <Dropdown.Item
                key={option.id}
                id={option.id}
                label={option.label}
                textValue={option.label}
                isDisabled={option.isDisabled}
              />
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>
    </div>
  );
}
