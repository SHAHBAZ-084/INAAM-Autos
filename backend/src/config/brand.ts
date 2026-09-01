/** Display and internal identifiers for this POS instance. */

export const APP_DISPLAY_NAME = 'INAAM AUTOS & SPARE PARTS';
export const APP_SHORT_NAME = 'INAAM AUTOS';
export const APP_TAGLINE = 'Quality Auto Parts, Trusted Service';
export const APP_INVOICE_FOOTER = 'Thank you for shopping at INAAM AUTOS & SPARE PARTS';
export const APP_INVOICE_PREFIX = 'IA-';

/** Internal slug used in backups, health checks, and file names. */
export const APP_SLUG = 'inaam-autos';
export const APP_DB_NAME = 'inaam-autos.db';
export const APP_BACKUP_PREFIX = 'inaam-autos-backup-';

/** Accepted backup `app` values (current + previous garments POS). */
export const BACKUP_APP_IDS = ['inaam-autos', 'usman-mall'] as const;
export const LEGACY_DB_NAME = 'usman-garments.db';
export const LEGACY_BACKUP_PREFIX = 'usman-mall-backup-';

export const DEFAULT_PRIMARY_COLOR = '#0A0A0A';
export const DEFAULT_BRAND_COLOR = '#C8102E';

export const LEGACY_BUSINESS_NAME = 'Usman Mall';
export const LEGACY_TAGLINE = 'Quality Clothes, Your Style';
export const LEGACY_INVOICE_FOOTER = 'Thank you for shopping at Usman Mall';
export const LEGACY_INVOICE_PREFIX = 'UM-';
export const LEGACY_PRIMARY_COLOR = '#111111';
export const LEGACY_SECONDARY_COLOR = '#C99618';
