import { cacheGet, cacheInvalidate, cacheSet } from './cache';

export const userCacheKeys = {
  profile: (email: string) => `cache:user:${email.toLowerCase()}:profile`,
  stats: (email: string) => `cache:user:${email.toLowerCase()}:stats`,
  errors: (email: string) => `cache:user:${email.toLowerCase()}:errors`,
  notifications: (userId: string) => `cache:user:${userId}:notifications`,
  bootstrap: (email: string) => `cache:user:${email.toLowerCase()}:bootstrap`,
  auth: (tokenHash: string) => `cache:auth:${tokenHash}`,
};

export const getUserCache = cacheGet;
export const setUserCache = cacheSet;
/** Remove uma entrada pontual do cache (ex.: sessão revogada). */
export const deleteUserCache = cacheInvalidate;

export async function invalidateUserCache(email: string, userId?: string): Promise<void> {
  await cacheInvalidate(
    userCacheKeys.profile(email),
    userCacheKeys.stats(email),
    userCacheKeys.errors(email),
    userCacheKeys.bootstrap(email),
    ...(userId ? [userCacheKeys.notifications(userId)] : []),
  );
}
