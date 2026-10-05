import { csrfHeaders } from './apiService';

type LogLevel = 'info' | 'warn' | 'error';

interface ClientLogEntry {
  level: LogLevel;
  message: string;
  page: string;
  timestamp: string;
}

const MAX_QUEUE = 100;
const queue: ClientLogEntry[] = [];
let flushTimer: number | undefined;
let flushing = false;

function serialize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function enqueue(level: LogLevel, args: unknown[]) {
  queue.push({
    level,
    message: args.map(serialize).join(' ').slice(0, 2_000),
    page: window.location.pathname,
    timestamp: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flushClientLogs();
  }, 1_000);
}

export async function flushClientLogs() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const entries = queue.splice(0, 20);

  try {
    const response = await fetch('/api/client-logs', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...csrfHeaders(),
      },
      body: JSON.stringify({ entries }),
    });
    if (!response.ok) queue.unshift(...entries);
  } catch {
    queue.unshift(...entries);
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

export function installClientLogger() {
  const globalState = window as typeof window & { __nevaproLoggerInstalled?: boolean };
  if (globalState.__nevaproLoggerInstalled) return;
  globalState.__nevaproLoggerInstalled = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => {
    original.log(...args);
    enqueue('info', args);
  };
  console.info = (...args) => {
    original.info(...args);
    enqueue('info', args);
  };
  console.warn = (...args) => {
    original.warn(...args);
    enqueue('warn', args);
  };
  console.error = (...args) => {
    original.error(...args);
    enqueue('error', args);
  };

  window.addEventListener('error', (event) => {
    enqueue('error', [event.error || event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    enqueue('error', ['Unhandled promise rejection', event.reason]);
  });
  window.addEventListener('pagehide', () => {
    void flushClientLogs();
  });
}

installClientLogger();
