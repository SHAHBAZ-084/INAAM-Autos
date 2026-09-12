import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { SecondaryButton } from './PageShell';

/** Close / back to the parent hub (or previous section). */
export function HubCloseButton({
  to,
  label = 'Close',
}: {
  to: string;
  label?: string;
}) {
  const { t } = useLanguage();
  const text = t(label);
  return (
    <Link to={to} aria-label={text}>
      <SecondaryButton type="button" className="inline-flex items-center gap-1.5">
        <X className="h-4 w-4" aria-hidden />
        {text}
      </SecondaryButton>
    </Link>
  );
}
