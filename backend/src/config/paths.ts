import fs from 'fs';
import path from 'path';
import { APP_DB_NAME, LEGACY_DB_NAME } from './brand';

export { APP_DB_NAME };

function userDataEnv(): string {
  return (process.env.INAAM_USER_DATA ?? process.env.USMAN_USER_DATA ?? '').trim();
}

function copySidecar(srcBase: string, destBase: string) {
  for (const suffix of ['-wal', '-shm']) {
    const src = srcBase + suffix;
    const dest = destBase + suffix;
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

/** Copy a previous garments POS database into the new filename when needed. */
export function migrateLegacyDatabaseFile(dataRoot: string): void {
  const dest = path.join(dataRoot, APP_DB_NAME);
  if (fs.existsSync(dest)) return;

  const candidates = [path.join(dataRoot, LEGACY_DB_NAME)];
  const appData = process.env.APPDATA?.trim();
  if (appData) {
    candidates.push(
      path.join(appData, 'Usman Mall', LEGACY_DB_NAME),
      path.join(appData, 'usman-garments', LEGACY_DB_NAME),
      path.join(appData, 'Usman-Garments', LEGACY_DB_NAME),
    );
  }

  for (const src of candidates) {
    if (!src || !fs.existsSync(src)) continue;
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.copyFileSync(src, dest);
    copySidecar(src, dest);
    return;
  }
}

/** True when running under packaged Electron (INAAM_USER_DATA / USMAN_USER_DATA set by main process). */
export function isAppDataMode(): boolean {
  return Boolean(userDataEnv());
}

/** Root folder for DB, uploads, logs, and default backups. */
export function getDataRoot(): string {
  if (isAppDataMode()) {
    return userDataEnv();
  }
  return path.resolve(__dirname, '../../prisma/data');
}

export function getDatabasePath(): string {
  if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL?.startsWith('file:')) {
    const fromUrl = process.env.DATABASE_URL.slice(5);
    return path.normalize(fromUrl);
  }
  const root = getDataRoot();
  migrateLegacyDatabaseFile(root);
  return path.join(root, APP_DB_NAME);
}

export function getDatabaseUrl(): string {
  if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const dbPath = getDatabasePath().replace(/\\/g, '/');
  return `file:${dbPath}`;
}

export function getUploadsDir(): string {
  const dir = path.join(getDataRoot(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogsDir(): string {
  const dir = path.join(getDataRoot(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Default backup storage inside user data; manual backups may also use BusinessSettings.backupFolderPath. */
export function getDefaultBackupsDir(): string {
  const dir = path.join(getDataRoot(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveBackupDestination(customFolder?: string | null): string {
  const trimmed = customFolder?.trim();
  if (trimmed) {
    fs.mkdirSync(trimmed, { recursive: true });
    return trimmed;
  }
  return getDefaultBackupsDir();
}

export function describeDataLocation(): {
  mode: 'development' | 'appdata' | 'test';
  dataRoot: string;
  databasePath: string;
} {
  if (process.env.NODE_ENV === 'test') {
    const dbPath = getDatabasePath();
    return {
      mode: 'test',
      dataRoot: path.dirname(dbPath),
      databasePath: dbPath,
    };
  }
  return {
    mode: isAppDataMode() ? 'appdata' : 'development',
    dataRoot: getDataRoot(),
    databasePath: getDatabasePath(),
  };
}
