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

    public static function isConfigured(): bool
    {
        return filled(config('filesystems.disks.b2.key'))
            && filled(config('filesystems.disks.b2.secret'))
            && filled(config('filesystems.disks.b2.bucket'))
            && filled(config('filesystems.disks.b2.endpoint'));
    }

    public function put(string $key, string $contents): bool
    {
        return Storage::disk(self::DISK)->put($key, $contents);
    }

    public function putFile(string $key, string $path, ?string $contentType = null): bool
    {
        $stream = fopen($path, 'rb');
        if ($stream === false) {
            throw new \RuntimeException('Não foi possível abrir o arquivo para upload.');
        }

        try {
            $options = $contentType ? ['ContentType' => $contentType] : [];

            return Storage::disk(self::DISK)->put($key, $stream, $options);
        } finally {
            fclose($stream);
        }
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

    public function mimeType(string $key): ?string
    {
        return Storage::disk(self::DISK)->mimeType($key) ?: null;
    }

    public function url(string $key): string
    {
        return Storage::disk(self::DISK)->url($key);
    }

    /**
     * Extrai a object key de uma URL B2 armazenada no banco.
     * Espelha extractObjectKey() do Express.
     */
    /**
     * Assina uma object key com HMAC-SHA256 (mesma semântica de storageUrl.ts do Express).
     * Usada em URLs /api/storage/object?file=...&s=... para evitar acesso direto sem autorização.
     */
    public static function signObjectKey(string $key): string
    {
        $secret = (string) config('services.jwt_secret');
        $raw = hash_hmac('sha256', 'storage:'.$key, $secret, true);
        $base64Url = rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

        return substr($base64Url, 0, 32);
    }

    /**
     * Verifica a assinatura de uma object key em tempo constante.
     */
    public static function verifyObjectSignature(string $key, mixed $signature): bool
    {
        if (! is_string($signature) || $signature === '') {
            return false;
        }

        $expected = self::signObjectKey($key);

        return hash_equals($expected, $signature);
    }

    public static function extractObjectKey(string $url): ?string
    {
        if (str_starts_with($url, '/api/storage/object?file=')) {
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            $url = (string) ($query['file'] ?? '');
        }
        if (preg_match('~^(avatars|materials)/[^?#]+$~', $url)) {
            return $url;
        }

        $bucket = config('filesystems.disks.b2.bucket');
        $host = parse_url($url, PHP_URL_HOST) ?? '';
        $path = parse_url($url, PHP_URL_PATH) ?? '';

        if ($host && str_contains($host, 'backblazeb2.com')) {
            // /file/<bucket>/<key> ou /<bucket>/<key>
            if (is_string($bucket) && $bucket !== '') {
                $path = preg_replace('#^/file/'.preg_quote($bucket, '#').'/#', '', $path) ?? $path;
                $path = preg_replace('#^/'.preg_quote($bucket, '#').'/#', '', $path) ?? $path;
            }

            return ltrim($path, '/') ?: null;
        }

        return null;
    }

    public static function resolveStoredUrl(?string $url): string
    {
        if (! $url) {
            return '';
        }
        if (str_starts_with($url, '/api/storage/object?file=')) {
            return $url;
        }

        $key = self::extractObjectKey($url);

        if (! $key) {
            return $url;
        }

        return '/api/storage/object?file='.rawurlencode($key).'&s='.rawurlencode(self::signObjectKey($key));
    }
}
