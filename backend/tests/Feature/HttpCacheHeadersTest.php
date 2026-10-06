<?php

namespace Tests\Feature;

use App\Http\Middleware\HttpCacheHeaders;
use Illuminate\Http\Request;
use Tests\TestCase;

class HttpCacheHeadersTest extends TestCase
{
    public function test_api_get_responses_are_not_shared_or_cached(): void
    {
        foreach (['/api/materials', '/api/questoes', '/api/leaderboard'] as $path) {
            $request = Request::create($path, 'GET');
            $response = (new HttpCacheHeaders)->handle(
                $request,
                fn () => response()->json(['data' => []]),
            );

            $cacheControl = $response->headers->get('Cache-Control');
            self::assertStringContainsString('no-store', $cacheControl);
            self::assertStringContainsString('private', $cacheControl);
            self::assertStringNotContainsString('public', $cacheControl);
        }
    }
}
