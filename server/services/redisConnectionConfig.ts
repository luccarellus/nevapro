export interface RedisConnectionConfig {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

/** Combines credentials from REDIS_URL with separate environment variables. */
export function resolveRedisConnectionConfig(env: NodeJS.ProcessEnv): RedisConnectionConfig | null {
  const url = env.REDIS_URL?.trim();
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('REDIS_URL inválida.');
    }
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error('REDIS_URL deve usar o protocolo redis:// ou rediss://.');
    }
    let urlUsername: string;
    let urlPassword: string;
    try {
      urlUsername = decodeURIComponent(parsed.username);
      urlPassword = decodeURIComponent(parsed.password);
    } catch {
      throw new Error('REDIS_URL contém credenciais inválidas.');
    }
    const password = urlPassword || env.REDIS_PASSWORD || undefined;

    return {
      url,
      username: urlUsername || (password ? env.REDIS_USERNAME || 'default' : undefined),
      password,
    };
  }

  const host = env.REDIS_HOST?.trim();
  if (!host) return null;
  const port = Number(env.REDIS_PORT || '6379');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_PORT deve ser um número entre 1 e 65535.');
  }
  const password = env.REDIS_PASSWORD || undefined;

  return {
    host,
    port,
    username: password ? env.REDIS_USERNAME || 'default' : undefined,
    password,
  };
}
