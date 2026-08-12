import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LayoutProfile, LayoutSlot } from '../shared/types.js';
import { logger } from '../shared/logger.js';

function storeDir(): string {
  return join(app.getPath('userData'), 'layouts');
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(storeDir(), { recursive: true });
}

function profilePath(id: string): string {
  return join(storeDir(), `${id}.json`);
}

export async function listLayouts(): Promise<LayoutProfile[]> {
  await ensureDir();
  const files = await fs.readdir(storeDir());
  const profiles: LayoutProfile[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(join(storeDir(), f), 'utf8');
      profiles.push(JSON.parse(raw) as LayoutProfile);
    } catch (err) {
      logger.warn('layoutStore: perfil corrupto', { file: f, err });
    }
  }
  profiles.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return profiles;
}

export async function saveLayout(name: string, slots: LayoutSlot[]): Promise<LayoutProfile> {
  await ensureDir();
  const now = new Date().toISOString();
  const profile: LayoutProfile = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    slots,
  };
  await fs.writeFile(profilePath(profile.id), JSON.stringify(profile, null, 2), 'utf8');
  logger.info('layoutStore: guardado', { id: profile.id, name, slots: slots.length });
  return profile;
}

export async function deleteLayout(id: string): Promise<void> {
  try {
    await fs.unlink(profilePath(id));
    logger.info('layoutStore: borrado', { id });
  } catch (err) {
    logger.warn('layoutStore: no se pudo borrar', { id, err });
  }
}

export async function getLayout(id: string): Promise<LayoutProfile | null> {
  try {
    const raw = await fs.readFile(profilePath(id), 'utf8');
    return JSON.parse(raw) as LayoutProfile;
  } catch {
    return null;
  }
}
