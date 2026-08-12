export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel =
  (process.env.MONITOR_HUB_LOG as LogLevel | undefined) ?? 'info';

function ts(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, msg: string, meta?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;
  const suffix = meta !== undefined ? ' ' + safeJson(meta) : '';
  const line = `[${ts()}] ${level.toUpperCase()} ${msg}${suffix}`;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
