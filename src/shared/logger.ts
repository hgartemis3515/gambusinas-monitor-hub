import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel =
  (process.env['MONITOR_HUB_LOG'] as LogLevel | undefined) ?? 'info';

let logFilePath: string | null = null;
let fileReady = false;

function isMain(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions?.electron != null &&
    (process as { type?: string }).type === 'browser'
  );
}

async function ensureFile(): Promise<void> {
  if (fileReady || !isMain()) return;
  try {
    const dir = join(app.getPath('userData'), 'logs');
    await fs.mkdir(dir, { recursive: true });
    logFilePath = join(dir, 'hub.log');
    fileReady = true;
  } catch {
    fileReady = false;
  }
}

async function appendFile(line: string): Promise<void> {
  if (!logFilePath) return;
  try {
    await fs.appendFile(logFilePath, line + '\n', 'utf8');
  } catch {
    /* noop */
  }
}

function ts(): string {
  return new Date().toISOString();
}

async function emit(level: LogLevel, msg: string, meta?: unknown): Promise<void> {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;
  const suffix = meta !== undefined ? ' ' + safeJson(meta) : '';
  const line = `[${ts()}] ${level.toUpperCase()} ${msg}${suffix}`;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
  await ensureFile();
  await appendFile(line);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  debug: (m: string, meta?: unknown) => void emit('debug', m, meta),
  info: (m: string, meta?: unknown) => void emit('info', m, meta),
  warn: (m: string, meta?: unknown) => void emit('warn', m, meta),
  error: (m: string, meta?: unknown) => void emit('error', m, meta),
};

export function getLogFilePath(): string | null {
  return logFilePath;
}
