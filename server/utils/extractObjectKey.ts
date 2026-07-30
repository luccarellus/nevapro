/**
 * Extracts the Backblaze B2 object key from a stored file URL.
 *
 * Handles all URL formats used by the system:
 *   - `/api/storage/object?file=materials/uuid.jpg`  (proxied)
 *   - `materials/uuid.jpg`                            (raw key)
 *   - `https://bucket.s3.us-east-005.backblazeb2.com/materials/uuid.jpg` (direct B2)
 *   - External links (not B2) → returns null
 *
 * @returns The object key (e.g. "avatars/uuid.jpg") or null if not a B2 file.
 */
export function extractObjectKey(value: string): string | null {
  if (!value) return null;

  // /api/storage/object?file=materials/abc.jpg → materials/abc.jpg
  const proxyMatch = value.match(/\/api\/storage\/object\?file=([^&]+)/);
  if (proxyMatch) return decodeURIComponent(proxyMatch[1]);

  // Raw key pattern: materials/uuid.ext or avatars/uuid_v2.min.jpg
  const rawMatch = value.match(/^(avatars|materials)\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9.]+$/);
  if (rawMatch) return rawMatch[0];

  // Full B2 URL: extract path after bucket name
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // B2 URLs look like: /bucket/avatars/uuid.ext
    // We want: avatars/uuid.ext
    if (pathParts.length >= 2) {
      const prefix = pathParts[0]; // "avatars" or "materials" (or bucket name)
      const candidate = pathParts.slice(1).join('/');
      // Check if the bucket name is in the path
      if (prefix === 'avatars' || prefix === 'materials') {
        return candidate;
      }
    }
  } catch {
    // Invalid URL — not ours
  }

  return null;
}


