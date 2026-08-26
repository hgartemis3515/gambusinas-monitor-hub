import { promises as fs } from 'node:fs';
import { app, dialog } from 'electron';
import { join } from 'node:path';
import type { CocinaLayoutImport, HubCocinero, LayoutSlot } from '../shared/types.js';
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

/** Inbox para el renderer: sin JWT. */
export function toPublicInbox(data: CocinaLayoutImport | null): CocinaLayoutImport | null {
  if (!data) return null;
  const { authBundle: _omit, ...rest } = data;
  return {
    ...rest,
    slots: (rest.slots || []).map((s) => ({
      ...s,
      url: s.url ? s.url.replace(/#hubAuth=[^#]*/, '') : s.url,
    })),
  };
}

export function rewriteSlotUrl(url: string, monitorIndex: number, cocineroId: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('monitor', String(monitorIndex));
    u.searchParams.set('cocineroId', cocineroId);
    return u.toString();
  } catch {
    const cid = encodeURIComponent(cocineroId);
    let next = url.replace(/([?&])cocineroId=[^&#]*/i, `$1cocineroId=${cid}`);
    if (!/[?&]cocineroId=/i.test(next)) {
      next += (next.includes('?') ? '&' : '?') + `cocineroId=${cid}`;
    }
    next = next.replace(/([?&])monitor=\d+/i, `$1monitor=${monitorIndex}`);
    return next;
  }
}

export function tokenFromInbox(data: CocinaLayoutImport | null): string | null {
  const raw = data?.authBundle;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const token = (parsed as { token?: string })?.token;
    return token || null;
  } catch {
    return null;
  }
}

export async function setInboxCocinero(
  monitorIndex: number,
  cook: HubCocinero,
): Promise<CocinaLayoutImport> {
  const data = await readInbox();
  if (!data?.slots?.length) {
    throw new Error('No hay layout de Cocina. Envíalo desde App Cocina.');
  }
  const slots = [...data.slots];
  const idx = slots.findIndex((s) => Number(s.monitorIndex) === Number(monitorIndex));
  const template = (idx >= 0 ? slots[idx] : null) || slots.find((s) => s.url) || slots[0];
  if (!template?.url) {
    throw new Error('El layout no tiene URL de cocina para este monitor.');
  }
  const next: LayoutSlot = {
    ...template,
    monitorIndex: Number(monitorIndex),
    url: rewriteSlotUrl(template.url, Number(monitorIndex), cook.id),
    cocineroId: cook.id,
    cocineroNombre: cook.nombre,
    label: cook.nombre,
  };
  if (idx >= 0) slots[idx] = next;
  else slots.push(next);
  const updated: CocinaLayoutImport = { ...data, slots };
  await writeInbox(updated);
  return updated;
}
