import { useCombobox } from 'downshift';
import type { Ref } from 'react';
import { useState } from 'react';

import type { Location } from '../../api/types';
import { CheckIcon, PinIcon } from '../../components/icons';
import { GEOCODE_MIN_CHARS } from '../../lib/constants';
import { FieldMessage } from './FieldMessage';
import { useGeocode } from './useGeocode';

type LocationComboboxProps = {
  id: string;
  label: string;
  placeholder: string;
  value: Location | null;
  onChange: (location: Location | null) => void;
  onBlur: () => void;
  inputRef?: Ref<HTMLInputElement>;
  error?: string | undefined;
  marker: 'origin' | 'destination';
};

/** Only a picked suggestion counts as a value; typing clears it, so free text never submits. */
export function LocationCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  inputRef,
  error,
  marker,
}: LocationComboboxProps) {
  const [inputValue, setInputValue] = useState(value?.label ?? '');
  const isPicked = value !== null && inputValue === value.label;
  const { suggestions, isSearching, hasError, isQueryable } = useGeocode(inputValue, !isPicked);

  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } =
    useCombobox<Location>({
      id,
      items: suggestions,
      inputValue,
      selectedItem: value,
      itemToString: (item) => item?.label ?? '',
      onInputValueChange: ({ inputValue: next, type }) => {
        setInputValue(next);
        if (type === useCombobox.stateChangeTypes.InputChange && value !== null) onChange(null);
      },
      onSelectedItemChange: ({ selectedItem }) => {
        onChange(selectedItem);
      },
    });

  const status = lookupStatus({
    isPicked,
    isSearching,
    hasError,
    isQueryable,
    inputValue,
    count: suggestions.length,
  });
  const describedBy = `${id}-status${error ? ` ${id}-error` : ''}`;

  return (
    <div className="relative">
      <label {...getLabelProps()} className="field-label">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
          <LocationMarker kind={marker} />
        </span>
        <input
          {...getInputProps({ ref: inputRef, onBlur })}
          className="field-input pr-10 pl-10"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
        />
        {isPicked && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <CheckIcon className="size-[18px] text-brand-600" />
          </span>
        )}
      </div>
      <ul
        {...getMenuProps()}
        className={`absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-surface p-1 shadow-float ${
          isOpen && suggestions.length > 0 ? '' : 'hidden'
        }`}
      >
        {isOpen &&
          suggestions.map((item, index) => (
            <li
              key={`${item.label}-${item.lat}-${item.lon}`}
              {...getItemProps({ item, index })}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                highlightedIndex === index ? 'bg-brand-50 text-ink' : 'text-ink-soft'
              }`}
            >
              <PinIcon
                className={`size-4 shrink-0 ${highlightedIndex === index ? 'text-brand-600' : 'text-slate-400'}`}
              />
              <span className="truncate">{item.label}</span>
            </li>
          ))}
      </ul>
      <p
        id={`${id}-status`}
        className="mt-1.5 text-xs text-slate-500 empty:mt-0"
        aria-live="polite"
      >
        {status}
      </p>
      <FieldMessage id={`${id}-error`} message={error} />
    </div>
  );
}

function LocationMarker({ kind }: { kind: 'origin' | 'destination' }) {
  return kind === 'origin' ? (
    <span className="size-3 rounded-full border-[3px] border-brand-600 bg-surface" />
  ) : (
    <span className="size-3 rounded-full bg-coral-500 ring-[3px] ring-coral-100" />
  );
}

type StatusInput = {
  isPicked: boolean;
  isSearching: boolean;
  hasError: boolean;
  isQueryable: boolean;
  inputValue: string;
  count: number;
};

function lookupStatus(input: StatusInput): string {
  if (input.isPicked) return '';
  if (input.isSearching) return 'Searching…';
  if (input.hasError) return "Couldn't load suggestions. Keep typing to try again.";
  if (input.isQueryable && input.count === 0) return 'No matching places in the US.';
  if (input.inputValue.trim().length > 0 && !input.isQueryable) {
    return `Type at least ${GEOCODE_MIN_CHARS} characters, then pick a suggestion.`;
  }
  return '';
}
