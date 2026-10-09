import { csrfHeaders } from './apiService';

type LogLevel = 'info' | 'warn' | 'error';

interface ClientLogEntry {
  level: LogLevel;
  message: string;
  page: string;
  timestamp: string;
}

const MAX_QUEUE = 100;
// Telemetria é best-effort: em falhas 5xx/rede, re-tenta com backoff
// exponencial e descarta a fila após N falhas consecutivas. O loop antigo
// re-tentava a cada 1s para sempre, inundando o console e um servidor caído.
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 8;
const queue: ClientLogEntry[] = [];
let flushTimer: number | undefined;
let flushing = false;
let consecutiveFailures = 0;

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
  const serialized = args.map(serialize).join(' ');
  // Ignora erros normais de sessão não autenticada / 401 e falhas amortecidas
  if (
    serialized.includes('401') ||
    serialized.includes('Request failed: 401') ||
    serialized.includes('Falha amortecida')
  ) {
    return;
  }

  queue.push({
    level,
    message: serialized.slice(0, 2_000),
    page: window.location.pathname,
    timestamp: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
}

function scheduleFlush(delayMs = RETRY_BASE_DELAY_MS) {
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flushClientLogs();
  }, delayMs);
}

export async function flushClientLogs() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const entries = queue.splice(0, 20);

  let failed = false;
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
    // 4xx (validação/rate limit): descarta sem retry.
    if (!response.ok && response.status >= 500) failed = true;
  } catch {
    failed = true;
  } finally {
    flushing = false;
  }

  if (!failed) {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Servidor inalcançável por tempo prolongado — descarta a telemetria
      // em vez de martelar o endpoint em loop.
      queue.length = 0;
      consecutiveFailures = 0;
      return;
    }
    queue.unshift(...entries);
  }

  if (queue.length > 0) {
    scheduleFlush(
      failed
        ? Math.min(RETRY_BASE_DELAY_MS * 2 ** (consecutiveFailures - 1), RETRY_MAX_DELAY_MS)
        : RETRY_BASE_DELAY_MS,
    );
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
