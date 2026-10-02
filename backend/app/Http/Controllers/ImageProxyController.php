<?php

namespace App\Http\Controllers;

use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ImageProxyController extends Controller
{
    private const MAX_BYTES = 5 * 1024 * 1024;

    public function show(Request $request): Response
    {
        $rawUrl = $request->query('url');
        if (! is_string($rawUrl) || trim($rawUrl) === '') {
            return response('URL missing', 400);
        }
        $url = trim($rawUrl);

        for ($redirects = 0; $redirects <= 5; $redirects++) {
            $parts = parse_url($url);
            $allowedHosts = array_merge(
                ['enem.dev', 'api.enem.dev', 'img.enemhub.com.br'],
                config('services.allowed_image_hosts', []),
            );

            if (! is_array($parts)
                || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
                || ! in_array(strtolower($parts['host'] ?? ''), array_map('strtolower', $allowedHosts), true)
                || (isset($parts['port']) && ! in_array($parts['port'], [80, 443], true))
                || isset($parts['user'])
                || isset($parts['pass'])) {
                return response('Acesso negado: dominio nao permitido.', 403);
            }

            $buffer = null;
            $upstream = null;
            try {
                $upstreamResponse = Http::withOptions(['allow_redirects' => false, 'stream' => true])
                    ->withHeaders([
                        'User-Agent' => 'Mozilla/5.0 (compatible; NevaApp/1.0)',
                        'Referer' => 'https://enem.dev/',
                    ])
                    ->timeout(8)
                    ->get($url);

                if ($upstreamResponse->redirect()) {
                    $location = $upstreamResponse->header('Location');
                    $upstreamResponse->toPsrResponse()->getBody()->close();
                    if (! $location || $redirects === 5) {
                        return response('Proxy error', 504);
                    }
                    $url = (string) UriResolver::resolve(new Uri($url), new Uri($location));

                    continue;
                }

                if (! $upstreamResponse->successful()) {
                    $upstreamResponse->toPsrResponse()->getBody()->close();

                    return response('Fetch error', $upstreamResponse->status());
                }

                $contentType = (string) $upstreamResponse->header('Content-Type', '');
                if (! Str::startsWith(strtolower($contentType), 'image/')) {
                    $upstreamResponse->toPsrResponse()->getBody()->close();

                    return response('Unsupported media type', 415);
                }
                $declaredLength = filter_var($upstreamResponse->header('Content-Length'), FILTER_VALIDATE_INT);
                if ($declaredLength !== false && $declaredLength > self::MAX_BYTES) {
                    $upstreamResponse->toPsrResponse()->getBody()->close();

                    return response('Image too large', 413);
                }

                $buffer = fopen('php://temp/maxmemory:65536', 'w+b');
                if ($buffer === false) {
                    $upstreamResponse->toPsrResponse()->getBody()->close();

                    return response('Proxy error', 500);
                }
                $upstream = $upstreamResponse->toPsrResponse()->getBody();
                $received = 0;
                while (! $upstream->eof()) {
                    $chunk = $upstream->read(65536);
                    if ($chunk === '') {
                        break;
                    }
                    $received += strlen($chunk);
                    if ($received > self::MAX_BYTES) {
                        $upstream->close();
                        fclose($buffer);

                        return response('Image too large', 413);
                    }
                    if (fwrite($buffer, $chunk) !== strlen($chunk)) {
                        throw new \RuntimeException('Unable to buffer the upstream image.');
                    }
                }
                $upstream->close();
                rewind($buffer);

                return response()->stream(function () use ($buffer): void {
                    try {
                        while (! feof($buffer)) {
                            $chunk = fread($buffer, 65536);
                            if ($chunk === false || $chunk === '') {
                                break;
                            }
                            echo $chunk;
                            flush();
                        }
                    } finally {
                        fclose($buffer);
                    }
                }, 200, [
                    'Content-Type' => $contentType,
                    'Content-Length' => (string) $received,
                    'Cache-Control' => 'public, max-age=86400',
                    'X-Content-Type-Options' => 'nosniff',
                ]);
            } catch (\Throwable $exception) {
                if ($upstream !== null) {
                    $upstream->close();
                }
                if (is_resource($buffer)) {
                    fclose($buffer);
                }
                report($exception);

                return response('Proxy error', 504);
            }
        }

        return response('Proxy error', 504);
    }
}
