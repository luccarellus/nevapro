import { describe, expect, it } from 'vitest';
import { resolveRedisConnectionConfig } from './redisConnectionConfig';

describe('resolveRedisConnectionConfig', () => {
  it('uses credentials from environment when REDIS_URL omits them', () => {
    expect(resolveRedisConnectionConfig({
      REDIS_URL: 'rediss://cache.example.test:6380/2',
      REDIS_USERNAME: 'cache-user',
      REDIS_PASSWORD: 'secret',
    })).toEqual({
      url: 'rediss://cache.example.test:6380/2',
      username: 'cache-user',
      password: 'secret',
    });
  });

  it('preserves credentials already embedded in REDIS_URL', () => {
    expect(resolveRedisConnectionConfig({
      REDIS_URL: 'redis://url-user:url%3Asecret@cache.example.test:6379',
      REDIS_USERNAME: 'env-user',
      REDIS_PASSWORD: 'env-secret',
    })).toEqual({
      url: 'redis://url-user:url%3Asecret@cache.example.test:6379',
      username: 'url-user',
      password: 'url:secret',
    });
  });

  it('uses the host-based configuration and does not enable auth without a password', () => {
    expect(resolveRedisConnectionConfig({
      REDIS_HOST: 'redis',
      REDIS_PORT: '6380',
      REDIS_USERNAME: 'unused-user',
    })).toEqual({
      host: 'redis',
      port: 6380,
      username: undefined,
      password: undefined,
    });
  });

  it('rejects unsupported URLs and invalid ports', () => {
    expect(() => resolveRedisConnectionConfig({ REDIS_URL: 'http://redis:6379' }))
      .toThrow(/redis:\/\/ ou rediss:\/\//);
    expect(() => resolveRedisConnectionConfig({ REDIS_HOST: 'redis', REDIS_PORT: '70000' }))
      .toThrow(/REDIS_PORT/);
    expect(() => resolveRedisConnectionConfig({ REDIS_HOST: 'redis', REDIS_PORT: '6379junk' }))
      .toThrow(/REDIS_PORT/);
  });

  it('ignores REDIS_PORT when Redis is not configured', () => {
    expect(resolveRedisConnectionConfig({ REDIS_PORT: 'not-a-port' })).toBeNull();
  });
});
