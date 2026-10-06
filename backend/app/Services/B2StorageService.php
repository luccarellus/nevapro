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
        // Validação de segurança: só permite upload em caminhos permitidos
        // para evitar path traversal e escrita em locais arbitrários.
        if (! $this->isAllowedKey($key)) {
            throw new \InvalidArgumentException('Caminho de upload não permitido: '.$key);
        }
        return Storage::disk(self::DISK)->put($key, $contents);
    }

    public function putFile(string $key, string $path, ?string $contentType = null): bool
    {
        // Validação de segurança: só permite upload em caminhos permitidos.
        if (! $this->isAllowedKey($key)) {
            throw new \InvalidArgumentException('Caminho de upload não permitido: '.$key);
        }

        // Validação de conteúdo: verifica MIME type real do arquivo
        // para evitar uploads de arquivos maliciosos com extensão falsa.
        $realMime = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = finfo_file($realMime, $path);
        finfo_close($realMime);

        $allowedMimes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
        ];

        if (! in_array($detectedMime, $allowedMimes, true)) {
            throw new \InvalidArgumentException('Tipo de arquivo não permitido: '.$detectedMime);
        }

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
        // Validação de segurança: só permite deletar em caminhos permitidos.
        if (! $this->isAllowedKey($key)) {
            throw new \InvalidArgumentException('Caminho de delete não permitido: '.$key);
        }
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

        // Se a URL não for reconhecida como nosso armazenamento, não laçamos
        // redirecionamento para evitar abrir buracos de segurança.
        $parsed = parse_url($url);
        $host = $parsed['host'] ?? '';

        // Se for um host desconhecido que não seja B2 nem API interna, retorna o URL original.
        // Isso previne abrir buracos de segurança com URLs arbitrárias.
        if ($host && ! str_contains($host, 'backblazeb2.com')) {
            return $url;
        }

        return '/api/storage/object?file='.rawurlencode($key).'&s='.rawurlencode(self::signObjectKey($key));
    }

    /**
     * Valida se uma chave de armazenamento está dentro dos caminhos permitidos.
     * Prevenção de path traversal e escrita em locais arbitrários.
     */
    private function isAllowedKey(string $key): bool
    {
        // Allow paths: avatars/<id>/*, materials/*, logs/*
        $allowedPrefixes = ['avatars/', 'materials/', 'logs/'];

        foreach ($allowedPrefixes as $prefix) {
            if (str_starts_with($key, $prefix)) {
                // Garantir que não há path traversal (../)
                $normalized = str_replace(['../', './', '//'], '', $key);
                return str_starts_with($normalized, $prefix);
            }
        }

        return false;
    }
}
