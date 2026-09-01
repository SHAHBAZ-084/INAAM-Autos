import { APP_DISPLAY_NAME } from '../../config/brand';

type BusinessNameProps = {
  name?: string | null;
  className?: string;
  as?: 'h1' | 'h2' | 'span' | 'div' | 'p';
};

/** Renders the business name on up to 2 centered lines, wrapping instead of truncating. */
export function BusinessName({ name, className = '', as: Tag = 'span' }: BusinessNameProps) {
  const text = name?.trim() || APP_DISPLAY_NAME;
  return <Tag className={`business-name-display ${className}`.trim()}>{text}</Tag>;
}
