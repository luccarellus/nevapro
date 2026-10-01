<?php

namespace App\Http\Controllers;

use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Illuminate\Http\Client\ConnectionException;
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

            try {
                $response = Http::withOptions(['allow_redirects' => false])
                    ->withHeaders([
                        'User-Agent' => 'Mozilla/5.0 (compatible; NevaApp/1.0)',
                        'Referer' => 'https://enem.dev/',
                    ])
                    ->timeout(8)
                    ->get($url);
            } catch (ConnectionException) {
                return response('Proxy error', 504);
            }

            if ($response->redirect()) {
                $location = $response->header('Location');
                if (! $location || $redirects === 5) {
                    return response('Proxy error', 504);
                }

                $url = (string) UriResolver::resolve(new Uri($url), new Uri($location));

                continue;
            }

            if (! $response->successful()) {
                return response('Fetch error', $response->status());
            }

            $contentType = (string) $response->header('Content-Type', '');
            if (! Str::startsWith(strtolower($contentType), 'image/')) {
                return response('Unsupported media type', 415);
            }

            $content = $response->body();
            if ((int) $response->header('Content-Length', 0) > self::MAX_BYTES || strlen($content) > self::MAX_BYTES) {
                return response('Image too large', 413);
            }

            return response($content)
                ->header('Content-Type', $contentType)
                ->header('Cache-Control', 'public, max-age=86400');
        }

        return response('Proxy error', 504);
    }
}
