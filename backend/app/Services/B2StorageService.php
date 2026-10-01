<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;

/**
 * Storage Backblaze B2 via filesystem S3 do Laravel.
 * Mesma semântica da API Express: upload, remoção e resolução de URL pública.
 */
class B2StorageService
{
    private const DISK = 'b2';

    public function put(string $key, string $contents): bool
    {
        return Storage::disk(self::DISK)->put($key, $contents);
    }

    public function delete(string $key): bool
    {
        return Storage::disk(self::DISK)->delete($key);
    }

    public function exists(string $key): bool
    {
        return Storage::disk(self::DISK)->exists($key);
    }

    public function get(string $key): ?string
    {
        return Storage::disk(self::DISK)->exists($key)
            ? Storage::disk(self::DISK)->get($key)
            : null;
    }

    public function url(string $key): string
    {
        return Storage::disk(self::DISK)->url($key);
    }

    /**
     * Extrai a object key de uma URL B2 armazenada no banco.
     * Espelha extractObjectKey() do Express.
     */
    public static function extractObjectKey(string $url): ?string
    {
        $bucket = config('filesystems.disks.b2.bucket');
        $host = parse_url($url, PHP_URL_HOST) ?? '';
        $path = parse_url($url, PHP_URL_PATH) ?? '';

        if ($host && str_contains($host, 'backblazeb2.com')) {
            // /file/<bucket>/<key> ou /<bucket>/<key>
            $path = preg_replace('#^/file/'.preg_quote($bucket, '#').'/#', '', $path)
                ?? preg_replace('#^/'.preg_quote($bucket, '#').'/#', '', $path) ?? $path;

            return ltrim($path, '/') ?: null;
        }

        return null;
    }
}
