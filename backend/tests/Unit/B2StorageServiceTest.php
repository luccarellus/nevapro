<?php

namespace Tests\Unit;

use App\Services\B2StorageService;
use Tests\TestCase;

class B2StorageServiceTest extends TestCase
{
    public function test_it_extracts_keys_from_proxy_urls_and_b2_urls(): void
    {
        config(['filesystems.disks.b2.bucket' => 'nevapro']);

        $this->assertSame(
            'materials/report.pdf',
            B2StorageService::extractObjectKey('/api/storage/object?file=materials%2Freport.pdf'),
        );
        $this->assertSame(
            'materials/report.pdf',
            B2StorageService::extractObjectKey('https://s3.us-east-005.backblazeb2.com/file/nevapro/materials/report.pdf'),
        );
    }

    public function test_it_converts_stored_b2_urls_to_authenticated_proxy_urls(): void
    {
        $this->assertSame(
            '/api/storage/object?file=avatars%2Fuser%2Favatar.png',
            B2StorageService::resolveStoredUrl('https://bucket.s3.us-east-005.backblazeb2.com/avatars/user/avatar.png'),
        );
    }
}
