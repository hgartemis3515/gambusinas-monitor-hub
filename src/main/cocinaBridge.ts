import { promises as fs } from 'node:fs';
import { app, dialog } from 'electron';
import { join } from 'node:path';
import type { CocinaLayoutImport, LayoutSlot } from '../shared/types.js';
import { logger } from '../shared/logger.js';
import { notifyInboxUpdated } from './inboxEvents.js';

function inboxDir(): string {
  return join(app.getPath('userData'), 'cocina-inbox');
}

function latestPath(): string {
  return join(inboxDir(), 'latest.json');
}

async function clearJsonFiles(except?: string): Promise<void> {
  try {
    const dir = inboxDir();
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const full = join(dir, f);
      if (except && full === except) continue;
      await fs.unlink(full).catch(() => undefined);
    }
  } catch {
    /* noop */
  }
}

export async function readInbox(): Promise<CocinaLayoutImport | null> {
  try {
    const latest = latestPath();
    try {
      const raw = await fs.readFile(latest, 'utf8');
      const data = JSON.parse(raw) as CocinaLayoutImport;
      logger.info('cocinaBridge: inbox leído', { file: 'latest.json', slots: data.slots?.length });
      return data;
    } catch {
      const dir = inboxDir();
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
      const json = files[files.length - 1];
      if (!json) return null;
      const raw = await fs.readFile(join(dir, json), 'utf8');
      const data = JSON.parse(raw) as CocinaLayoutImport;
      logger.info('cocinaBridge: inbox leído (legacy)', { file: json, slots: data.slots?.length });
      return data;
    }
  } catch {
    return null;
  }
}

export async function clearInbox(): Promise<void> {
  await clearJsonFiles();
}

export async function writeInbox(data: CocinaLayoutImport): Promise<string> {
  await fs.mkdir(inboxDir(), { recursive: true });
  const file = latestPath();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  await clearJsonFiles(file);
  logger.info('cocinaBridge: inbox escrito', { file, slots: data.slots?.length });
  notifyInboxUpdated();
  return file;
}

export async function importFromFile(): Promise<CocinaLayoutImport | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar layout desde App Cocina',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const raw = await fs.readFile(result.filePaths[0] as string, 'utf8');
  const data = JSON.parse(raw) as CocinaLayoutImport;
  logger.info('cocinaBridge: importado', { path: result.filePaths[0], slots: data.slots?.length });
  return data;
}

export function validateSlots(slots: unknown): LayoutSlot[] | null {
  if (!Array.isArray(slots)) return null;
  return slots.filter(
    (s): s is LayoutSlot =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as LayoutSlot).monitorIndex === 'number' &&
      typeof (s as LayoutSlot).mode === 'string',
  );
}
