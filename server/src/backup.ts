import fs from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type { BackupFileInfo, BackupList } from "../../shared/types";
import { backupDir, getDb, replaceDatabaseFile } from "./db";
import { HttpError } from "./http";
import { enqueue } from "./lock";
import { stamp } from "./time";

const FILE_PATTERN = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.db$/;
const MAX_FILES = 30;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const assertBackupName = (fileName: string) => {
  if (!FILE_PATTERN.test(fileName)) throw new HttpError(400, "Arquivo de backup inválido.");
  return path.join(backupDir, fileName);
};

const describe = (fileName: string): BackupFileInfo => {
  const fullPath = assertBackupName(fileName);
  const stat = fs.statSync(fullPath);
  const match = fileName.match(/^backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  const createdAt = match ? `${match[1]} ${match[2]}:${match[3]}:${match[4]}` : stat.mtime.toISOString();
  return { fileName, createdAt, size: stat.size };
};

export const listBackups = (): BackupList => {
  fs.mkdirSync(backupDir, { recursive: true });
  const files = fs
    .readdirSync(backupDir)
    .filter((fileName) => FILE_PATTERN.test(fileName))
    .map((fileName) => ({ fileName, mtime: fs.statSync(path.join(backupDir, fileName)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((file) => describe(file.fileName));
  return { directory: backupDir, files };
};

const uniqueName = () => {
  const base = `backup-${stamp()}.db`;
  if (!fs.existsSync(path.join(backupDir, base))) return base;
  let index = 2;
  let candidate = `backup-${stamp()}-${index}.db`;
  while (fs.existsSync(path.join(backupDir, candidate))) {
    index += 1;
    candidate = `backup-${stamp()}-${index}.db`;
  }
  return candidate;
};

const pruneBackups = () => {
  const files = listBackups().files;
  files.slice(MAX_FILES).forEach((file) => {
    fs.rmSync(path.join(backupDir, file.fileName), { force: true });
  });
};

export const createBackupFile = async () => {
  fs.mkdirSync(backupDir, { recursive: true });
  const fileName = uniqueName();
  await backup(getDb(), path.join(backupDir, fileName));
  pruneBackups();
  return describe(fileName);
};

const assertReadableBackup = (fullPath: string) => {
  if (!fs.existsSync(fullPath)) throw new HttpError(404, "Cópia não encontrada.");
  let test: DatabaseSync | null = null;
  try {
    test = new DatabaseSync(fullPath, { readOnly: true });
    test.prepare("SELECT id FROM clients LIMIT 1").get();
    test.prepare("SELECT id FROM service_orders LIMIT 1").get();
    test.prepare("SELECT id FROM payables LIMIT 1").get();
    test.prepare("SELECT id FROM receivables LIMIT 1").get();
  } catch {
    throw new HttpError(400, "Esse arquivo não é uma cópia válida do sistema.");
  } finally {
    test?.close();
  }
};

export const restoreBackupFile = (fileName: string) => {
  const fullPath = assertBackupName(fileName);
  assertReadableBackup(fullPath);
  replaceDatabaseFile(fullPath);
};

const createIfDue = async () => {
  const newest = listBackups().files[0];
  if (newest) {
    const match = newest.createdAt.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const created = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      );
      if (Date.now() - created.getTime() < MAX_AGE_MS) return;
    }
  }
  await createBackupFile();
  console.log("Backup automático criado.");
};

export const startBackupSchedule = () => {
  const tick = () => {
    enqueue(() => createIfDue()).catch((error: unknown) => {
      console.error("Falha no backup automático.", error);
    });
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
};
