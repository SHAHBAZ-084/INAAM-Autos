import { ChangeEvent, FocusEvent, forwardRef, useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { hasRomanLetters, romanUrduToUrdu } from '../../i18n/romanUrdu';
import { TextInput } from './PageShell';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Convert while typing (default true only when language is URDU). */
  liveConvert?: boolean;
};

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  liveConvert?: boolean;
};

/** Direct Urdu letters for the on-screen pad (URDU mode only). */
const URDU_PAD_KEYS = [
  'ا', 'ب', 'پ', 'ت', 'ٹ', 'ث', 'ج', 'چ', 'ح', 'خ',
  'د', 'ڈ', 'ذ', 'ر', 'ڑ', 'ز', 'ژ', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل',
  'م', 'ن', 'ں', 'و', 'ہ', 'ھ', 'ء', 'ی', 'ے', 'آ',
];

function useRomanUrduField(
  value: string,
  onValueChange: (value: string) => void,
  liveConvert: boolean | undefined,
) {
  const { language, t } = useLanguage();
  // Roman→Urdu conversion ONLY in URDU mode (not English, not Combined).
  const convertEnabled = language === 'URDU';
  const shouldLive = liveConvert ?? convertEnabled;
  const [draft, setDraft] = useState(value);
  const [showPad, setShowPad] = useState(false);

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

  function insertUrduChar(ch: string) {
    const next = `${draft}${ch}`;
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
    showPad,
    setShowPad,
    commit,
    handleRawChange,
    insertUrduChar,
    resolvedPlaceholder,
    t,
  };
}

function UrduKeyboardPad({
  onInsert,
  onBackspace,
  onClose,
  t,
}: {
  onInsert: (ch: string) => void;
  onBackspace: () => void;
  onClose: () => void;
  t: (s: string) => string;
}) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface1 p-2" dir="rtl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-textMuted">{t('Urdu keyboard')}</span>
        <button type="button" className="text-xs text-accent underline" onClick={onClose}>
          {t('Hide')}
        </button>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {URDU_PAD_KEYS.map((ch) => (
          <button
            key={ch}
            type="button"
            className="rounded border border-border bg-surface2 px-0.5 py-1.5 text-sm font-medium text-textPrimary hover:bg-surface3"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(ch)}
          >
            {ch}
          </button>
        ))}
        <button
          type="button"
          className="col-span-2 rounded border border-border bg-surface2 px-1 py-1.5 text-xs hover:bg-surface3"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(' ')}
        >
          {t('Space')}
        </button>
        <button
          type="button"
          className="col-span-2 rounded border border-border bg-surface2 px-1 py-1.5 text-xs hover:bg-surface3"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBackspace}
        >
          {t('Backspace')}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-textMuted">
        {t('English keyboard: type Roman Urdu. Or tap Urdu keys below.')}
      </p>
    </div>
  );
}

/**
 * Text field: Roman Urdu → Urdu script only when system language is URDU.
 * English / Combined modes behave like a normal English input (no conversion, no Urdu pad).
 */
export const RomanUrduInput = forwardRef<HTMLInputElement, InputProps>(function RomanUrduInput(
  { value, onValueChange, liveConvert, onBlur, onFocus, className, placeholder, ...rest },
  ref,
) {
  const field = useRomanUrduField(value, onValueChange, liveConvert);

  return (
    <div>
      <TextInput
        ref={ref}
        {...rest}
        value={field.draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => field.handleRawChange(e.target.value)}
        onFocus={(e) => {
          if (field.convertEnabled) field.setShowPad(true);
          onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          field.commit(field.draft);
          onBlur?.(e);
        }}
        className={className}
        dir={field.convertEnabled ? 'rtl' : undefined}
        // Do not set lang="ur" — that opens the OS Urdu IME and fights Roman typing.
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={field.resolvedPlaceholder(placeholder)}
      />
      {field.convertEnabled && field.showPad ? (
        <UrduKeyboardPad
          t={field.t}
          onInsert={field.insertUrduChar}
          onBackspace={() => {
            const next = field.draft.slice(0, -1);
            field.handleRawChange(next);
          }}
          onClose={() => field.setShowPad(false)}
        />
      ) : null}
      {field.convertEnabled && !field.showPad ? (
        <button
          type="button"
          className="mt-1 text-xs text-accent underline"
          onClick={() => field.setShowPad(true)}
        >
          {field.t('Show Urdu keyboard')}
        </button>
      ) : null}
    </div>
  );
});

/** Multi-line: Roman→Urdu only in URDU mode. */
export const RomanUrduTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function RomanUrduTextarea(
  { value, onValueChange, liveConvert, onBlur, onFocus, className, placeholder, rows = 3, ...rest },
  ref,
) {
  const field = useRomanUrduField(value, onValueChange, liveConvert);

  return (
    <div>
      <textarea
        ref={ref}
        {...rest}
        rows={rows}
        value={field.draft}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => field.handleRawChange(e.target.value)}
        onFocus={(e) => {
          if (field.convertEnabled) field.setShowPad(true);
          onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
          field.commit(field.draft);
          onBlur?.(e);
        }}
        className={`w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary outline-none ring-accent focus:ring-2 ${className ?? ''}`}
        dir={field.convertEnabled ? 'rtl' : undefined}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={field.resolvedPlaceholder(placeholder)}
      />
      {field.convertEnabled && field.showPad ? (
        <UrduKeyboardPad
          t={field.t}
          onInsert={field.insertUrduChar}
          onBackspace={() => {
            const next = field.draft.slice(0, -1);
            field.handleRawChange(next);
          }}
          onClose={() => field.setShowPad(false)}
        />
      ) : null}
      {field.convertEnabled && !field.showPad ? (
        <button
          type="button"
          className="mt-1 text-xs text-accent underline"
          onClick={() => field.setShowPad(true)}
        >
          {field.t('Show Urdu keyboard')}
        </button>
      ) : null}
    </div>
  );
});
