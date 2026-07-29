import { AsyncLocalStorage } from 'node:async_hooks';
import { storeB2Log } from './b2LogStorage';

export interface ApplicationLogEntry {
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  environment: string;
  timestamp: string;
  source?: string;
}

interface RequestLogContext {
  entries: ApplicationLogEntry[];
  flushed: boolean;
}

const requestLogs = new AsyncLocalStorage<RequestLogContext>();

export function runWithLogContext<T>(callback: () => T): T {
  return requestLogs.run({ entries: [], flushed: false }, callback);
}

export function enqueueLog(entry: ApplicationLogEntry): boolean {
  const context = requestLogs.getStore();
  if (!context || context.flushed) return false;
  context.entries.push(entry);
  return true;
}

export async function flushLogContext(request: Record<string, unknown>): Promise<void> {
  const context = requestLogs.getStore();
  if (!context || context.flushed) return;
  context.flushed = true;
  if (context.entries.length === 0) return;

  const groups = new Map<string, ApplicationLogEntry[]>();
  for (const entry of context.entries) {
    const entries = groups.get(entry.category) || [];
    entries.push(entry);
    groups.set(entry.category, entries);
  }

  await Promise.all(
    Array.from(groups, ([category, events]) =>
      storeB2Log(category, { request, events }),
    ),
  );
}
