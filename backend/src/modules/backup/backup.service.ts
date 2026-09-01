import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  getDatabasePath,
  getDefaultBackupsDir,
  getDataRoot,
  getUploadsDir,
  resolveBackupDestination,
} from '../../config/paths';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { withWindowsSafeShellEnv } from '../../lib/shell-env';
import { AppError } from '../../utils/helpers';
import { localDateKey } from '../reports/date-range';
import { getBusinessSettings } from '../settings/settings.service';
import {
  APP_BACKUP_PREFIX,
  APP_DB_NAME,
  APP_DISPLAY_NAME,
  APP_SLUG,
  BACKUP_APP_IDS,
  LEGACY_BACKUP_PREFIX,
} from '../../config/brand';

export type BackupManifest = {
  version: 1;
  app: (typeof BACKUP_APP_IDS)[number];
  createdAt: string;
  databaseFile: string;
  databaseSha256: string;
  uploadsIncluded: boolean;
  settingsSnapshot: Record<string, unknown>;
};

export type BackupEntry = {
  id: string;
  folderPath: string;
  createdAt: string;
  databaseSize: number;
  totalSize: number;
  label: string;
  isAutomatic: boolean;
};

const LAST_AUTO_MARKER = '.last-auto-backup-date';

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Estimate bytes needed for backup (DB + uploads + headroom). */
export function estimateBackupBytes(): number {
  const db = fs.existsSync(getDatabasePath()) ? fs.statSync(getDatabasePath()).size : 0;
  const uploads = dirSize(getUploadsDir());
  return Math.ceil((db + uploads) * 1.2 + 5 * 1024 * 1024);
}

export async function getFreeDiskSpaceBytes(targetDir: string): Promise<number | null> {
  try {
    if (process.platform === 'win32') {
      const drive = path.parse(path.resolve(targetDir)).root.replace('\\', '');
      const ps = `(Get-PSDrive -Name '${drive.replace(':', '')}').Free`;
      const out = execSync(`powershell -NoProfile -Command "${ps}"`, {
        encoding: 'utf8',
        env: withWindowsSafeShellEnv(),
      }).trim();
      const n = Number(out);
      return Number.isFinite(n) ? n : null;
    }
    const { statfsSync } = await import('fs');
    const stats = statfsSync(targetDir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

export async function assertDiskSpaceForBackup(destRoot: string, neededBytes: number) {
  const free = await getFreeDiskSpaceBytes(destRoot);
  if (free != null && free < neededBytes) {
    throw new AppError(507, 'Not enough disk space for backup', 'DISK_FULL');
  }
}

function backupFolderName(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${APP_BACKUP_PREFIX}${stamp}`;
}

export async function createBackup(options: {
  destinationFolder?: string | null;
  automatic?: boolean;
  label?: string;
  /** When true, never read BusinessSettings via Prisma (required during schema upgrades). */
  skipSettingsSnapshot?: boolean;
}): Promise<BackupEntry> {
  const destRoot = resolveBackupDestination(options.destinationFolder);
  const needed = estimateBackupBytes();
  await assertDiskSpaceForBackup(destRoot, needed);

  const folderName = backupFolderName();
  const folderPath = path.join(destRoot, folderName);
  fs.mkdirSync(folderPath, { recursive: true });

  const dbSrc = getDatabasePath();
  if (!fs.existsSync(dbSrc)) {
    throw new AppError(500, 'Database file not found');
  }

  // Checkpoint WAL so backup is consistent (returns rows — use queryRaw)
  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');

  const dbDest = path.join(folderPath, APP_DB_NAME);
  fs.copyFileSync(dbSrc, dbDest);
  const databaseSha256 = sha256File(dbDest);

  const uploadsDest = path.join(folderPath, 'uploads');
  copyDirRecursive(getUploadsDir(), uploadsDest);

  // Never block a DB file backup on Prisma model reads. During upgrades the client
  // may already know columns (e.g. releaseMarker) that migrate has not applied yet.
  let settingsSnapshot: Record<string, unknown> = { note: 'settings snapshot skipped' };
  if (!options.skipSettingsSnapshot) {
    try {
      const settings = await getBusinessSettings();
      settingsSnapshot = { ...settings, logoUrl: undefined };
    } catch (err) {
      logger.warn('Backup settings snapshot skipped (schema may be mid-upgrade)', {
        error: err instanceof Error ? err.message : String(err),
      });
      settingsSnapshot = { note: 'settings snapshot unavailable' };
    }
  }

  const manifest: BackupManifest = {
    version: 1,
    app: APP_SLUG,
    createdAt: new Date().toISOString(),
    databaseFile: APP_DB_NAME,
    databaseSha256,
    uploadsIncluded: true,
    settingsSnapshot,
  };
  fs.writeFileSync(path.join(folderPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const totalSize = dirSize(folderPath);
  const entry: BackupEntry = {
    id: folderName,
    folderPath,
    createdAt: manifest.createdAt,
    databaseSize: fs.statSync(dbDest).size,
    totalSize,
    label: options.label ?? (options.automatic ? 'Automatic daily backup' : 'Manual backup'),
    isAutomatic: Boolean(options.automatic),
  };

  logger.info('Backup created', { folderPath, totalSize, automatic: options.automatic });
  return entry;
}

export function validateBackupFolder(folderPath: string): BackupManifest {
  if (!fs.existsSync(folderPath)) {
    throw new AppError(400, 'Backup folder not found', 'BACKUP_INVALID');
  }
  const manifestPath = path.join(folderPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new AppError(400, `Not a valid ${APP_DISPLAY_NAME} backup (missing manifest)`, 'BACKUP_INVALID');
  }
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
  } catch {
    throw new AppError(400, 'Backup manifest is unreadable', 'BACKUP_INVALID');
  }
  if (!(BACKUP_APP_IDS as readonly string[]).includes(manifest.app) || manifest.version !== 1) {
    throw new AppError(400, 'Unsupported backup format', 'BACKUP_INVALID');
  }
  const dbPath = path.join(folderPath, manifest.databaseFile);
  if (!fs.existsSync(dbPath)) {
    throw new AppError(400, 'Backup database file missing', 'BACKUP_INVALID');
  }
  const actual = sha256File(dbPath);
  if (actual !== manifest.databaseSha256) {
    throw new AppError(400, 'Backup integrity check failed — file may be corrupt', 'BACKUP_CORRUPT');
  }
  return manifest;
}

export async function listBackups(customFolder?: string | null): Promise<BackupEntry[]> {
  const roots = [getDefaultBackupsDir()];
  const custom = customFolder?.trim();
  if (custom && !roots.includes(custom)) roots.push(custom);

  const entries: BackupEntry[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const folderPath = path.join(root, name);
      if (!fs.statSync(folderPath).isDirectory()) continue;
      const manifestPath = path.join(folderPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
        const dbPath = path.join(folderPath, manifest.databaseFile);
        entries.push({
          id: name,
          folderPath,
          createdAt: manifest.createdAt,
          databaseSize: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
          totalSize: dirSize(folderPath),
          label: name.startsWith(APP_BACKUP_PREFIX) || name.startsWith(LEGACY_BACKUP_PREFIX) ? 'Backup' : name,
          isAutomatic: name.includes('auto') || false,
        });
      } catch {
        /* skip invalid */
      }
    }
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function allowedBackupRoots(): Promise<string[]> {
  const roots = [path.resolve(getDefaultBackupsDir())];
  try {
    const settings = await getBusinessSettings();
    const custom = settings.backupFolderPath?.trim();
    if (custom) roots.push(path.resolve(custom));
  } catch {
    /* settings may be unavailable during upgrades */
  }
  return [...new Set(roots)];
}

function isUnderBackupRoot(folderPath: string, roots: string[]): boolean {
  const resolved = path.resolve(folderPath);
  return roots.some((root) => {
    const rel = path.relative(root, resolved);
    return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

function isRecognizedBackupFolderName(folderPath: string): boolean {
  const name = path.basename(folderPath);
  return name.startsWith(APP_BACKUP_PREFIX) || name.startsWith(LEGACY_BACKUP_PREFIX);
}

function readBackupManifestApp(folderPath: string): string | null {
  const manifestPath = path.join(folderPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
    return manifest.app ?? null;
  } catch {
    return null;
  }
}

function assertBackupFolderDeletable(folderPath: string, roots: string[]): string {
  const resolved = path.resolve(folderPath.trim());
  if (!fs.existsSync(resolved)) {
    throw new AppError(404, 'Backup folder not found', 'BACKUP_NOT_FOUND');
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new AppError(400, 'Path is not a backup folder', 'BACKUP_INVALID');
  }

  const dataRoot = path.resolve(getDataRoot());
  const dbPath = path.resolve(getDatabasePath());
  const uploads = path.resolve(getUploadsDir());
  if (resolved === dataRoot || resolved === dbPath || resolved === uploads) {
    throw new AppError(400, 'Cannot delete protected application data', 'BACKUP_FORBIDDEN');
  }

  for (const root of roots) {
    if (resolved === path.resolve(root)) {
      throw new AppError(400, 'Cannot delete the backups root folder', 'BACKUP_INVALID');
    }
  }

  const app = readBackupManifestApp(resolved);
  if (!app || !(BACKUP_APP_IDS as readonly string[]).includes(app)) {
    throw new AppError(400, `Not a valid ${APP_DISPLAY_NAME} backup folder`, 'BACKUP_INVALID');
  }

  const permitted =
    isUnderBackupRoot(resolved, roots) ||
    (isRecognizedBackupFolderName(resolved) && app != null);

  if (!permitted) {
    throw new AppError(403, 'Backup folder is not in an allowed backup location', 'BACKUP_FORBIDDEN');
  }

  return resolved;
}

/** Permanently remove a backup folder and all of its contents. */
export async function deleteBackup(folderPath: string): Promise<void> {
  const roots = await allowedBackupRoots();
  const resolved = assertBackupFolderDeletable(folderPath, roots);
  fs.rmSync(resolved, { recursive: true, force: true });
  logger.info('Backup deleted', { folderPath: resolved });
}

export async function getLastBackupInfo(): Promise<{ lastBackupAt: string | null; lastAutomaticAt: string | null }> {
  const backups = await listBackups();
  const lastBackupAt = backups[0]?.createdAt ?? null;
  const marker = path.join(getDefaultBackupsDir(), LAST_AUTO_MARKER);
  const lastAutomaticAt = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null;
  return { lastBackupAt, lastAutomaticAt };
}

function todayKey() {
  return localDateKey(new Date());
}

export async function runDailyBackupIfNeeded(): Promise<BackupEntry | null> {
  const marker = path.join(getDefaultBackupsDir(), LAST_AUTO_MARKER);
  const today = todayKey();
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === today) {
    return null;
  }
  const entry = await createBackup({ automatic: true, label: 'Automatic daily backup' });
  fs.writeFileSync(marker, today, 'utf8');
  return entry;
}

export async function runPreMigrationBackup(): Promise<BackupEntry | null> {
  // Empty / half-created DBs have no tables yet — nothing to snapshot, and
  // querying BusinessSettings would throw and block migrate deploy.
  const tableCheck = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' LIMIT 1`,
  );
  if (!tableCheck.length) {
    logger.info('Pre-migration backup skipped — database has no tables yet');
    return null;
  }

  return createBackup({
    label: 'Pre-migration safety backup',
    automatic: false,
    skipSettingsSnapshot: true,
  });
}

/**
 * Replace the live DB file with a validated backup copy.
 * Used after a failed migrate so half-applied schema never remains live.
 */
export async function restoreLiveDatabaseFromBackup(backupFolderPath: string): Promise<void> {
  const manifest = validateBackupFolder(backupFolderPath);
  const dbSrc = path.join(backupFolderPath, manifest.databaseFile);
  const dbDest = getDatabasePath();

  const { shutdownDatabase, configureSqlite } = await import('../../lib/prisma');
  await shutdownDatabase();

  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbDest + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.copyFileSync(dbSrc, dbDest);
  await configureSqlite();
  logger.info('Live database restored from backup', { from: backupFolderPath });
}

/** Safety-copy current data, then restore from validated backup folder. Caller must restart app. */
export async function restoreBackup(backupFolderPath: string): Promise<{ safetyBackupPath: string }> {
  validateBackupFolder(backupFolderPath);

  const safety = await createBackup({ label: 'Pre-restore safety copy' });

  const uploadsSrc = path.join(backupFolderPath, 'uploads');
  const uploadsDest = getUploadsDir();
  if (fs.existsSync(uploadsDest)) fs.rmSync(uploadsDest, { recursive: true, force: true });
  copyDirRecursive(uploadsSrc, uploadsDest);

  await restoreLiveDatabaseFromBackup(backupFolderPath);

  logger.info('Backup restored', { from: backupFolderPath, safety: safety.folderPath });
  return { safetyBackupPath: safety.folderPath };
}

export function openLogsFolder(): string {
  return path.join(getDataRoot(), 'logs');
}
