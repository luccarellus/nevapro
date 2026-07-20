export function resolveStoredFileUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const storedValue = value.trim();
  if (storedValue.startsWith('/api/storage/object?file=')) return storedValue;

  let objectKey = storedValue.match(/^(avatars|materials)\/.+$/)?.[0];
  if (!objectKey) {
    try {
      const pathname = decodeURIComponent(new URL(storedValue).pathname);
      objectKey = pathname.match(/\/(avatars|materials)\/(.+)$/)?.[0]?.slice(1);
    } catch {
      return storedValue;
    }
  }

  return objectKey
    ? `/api/storage/object?file=${encodeURIComponent(objectKey)}`
    : storedValue;
}
