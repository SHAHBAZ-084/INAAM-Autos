import { ChangeEvent, FocusEvent, forwardRef, useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { hasRomanLetters, romanUrduToUrdu } from '../../i18n/romanUrdu';
import { TextInput } from './PageShell';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Convert while typing (default true when language is URDU or BOTH). */
  liveConvert?: boolean;
};

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  liveConvert?: boolean;
};

function useRomanUrduField(
  value: string,
  onValueChange: (value: string) => void,
  liveConvert: boolean | undefined,
) {
  const { language, t } = useLanguage();
  const convertEnabled = language === 'URDU' || language === 'BOTH';
  const shouldLive = liveConvert ?? convertEnabled;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit(raw: string) {
    if (!convertEnabled || !hasRomanLetters(raw)) {
      onValueChange(raw);
      setDraft(raw);
      return;
    }
    const converted = romanUrduToUrdu(raw);
    onValueChange(converted);
    setDraft(converted);
  }

  function handleRawChange(next: string) {
    if (shouldLive && convertEnabled && hasRomanLetters(next)) {
      const converted = romanUrduToUrdu(next);
      setDraft(converted);
      onValueChange(converted);
      return;
    }
    setDraft(next);
    onValueChange(next);
  }

  const resolvedPlaceholder = (placeholder: string | undefined) =>
    placeholder
      ? t(String(placeholder))
      : convertEnabled
        ? t('Type Roman Urdu — saved as Urdu')
        : undefined;

  return {
    draft,
    convertEnabled,
    commit,
    handleRawChange,
    resolvedPlaceholder,
  };
}

/**
 * Text field that accepts Roman Urdu typing and stores/displays pure Urdu script
 * when system language is URDU or BOTH. English mode behaves like a normal input.
 */
export const RomanUrduInput = forwardRef<HTMLInputElement, InputProps>(function RomanUrduInput(
  { value, onValueChange, liveConvert, onBlur, className, placeholder, ...rest },
  ref,
) {
  const field = useRomanUrduField(value, onValueChange, liveConvert);

  return (
    <TextInput
      ref={ref}
      {...rest}
      value={field.draft}
      onChange={(e: ChangeEvent<HTMLInputElement>) => field.handleRawChange(e.target.value)}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        field.commit(field.draft);
        onBlur?.(e);
      }}
      className={className}
      dir={field.convertEnabled ? 'auto' : undefined}
      lang={field.convertEnabled ? 'ur' : undefined}
      placeholder={field.resolvedPlaceholder(placeholder)}
    />
  );
});

/** Multi-line Roman Urdu → Urdu (invoice footer, return policy, notes, address). */
export const RomanUrduTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function RomanUrduTextarea(
  { value, onValueChange, liveConvert, onBlur, className, placeholder, rows = 3, ...rest },
  ref,
) {
  const field = useRomanUrduField(value, onValueChange, liveConvert);

  return (
    <textarea
      ref={ref}
      {...rest}
      rows={rows}
      value={field.draft}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => field.handleRawChange(e.target.value)}
      onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
        field.commit(field.draft);
        onBlur?.(e);
      }}
      className={`w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary outline-none ring-accent focus:ring-2 ${className ?? ''}`}
      dir={field.convertEnabled ? 'auto' : undefined}
      lang={field.convertEnabled ? 'ur' : undefined}
      placeholder={field.resolvedPlaceholder(placeholder)}
    />
  );
});
