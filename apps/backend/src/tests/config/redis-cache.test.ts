import { RedisCache } from '../../config/redis';

/**
 * Pruebas del fallback en memoria de RedisCache.
 * En el entorno de tests, ioredis está mockeado y NO reporta status 'ready',
 * por lo que todas las operaciones deben funcionar contra el store en memoria.
 */
describe('RedisCache (fallback en memoria sin Redis)', () => {
  beforeEach(async () => {
    await RedisCache.clearPattern('*');
  });

  it('set/get/del funcionan sin Redis', async () => {
    await RedisCache.set('test-mem:basic', { hello: 'world' });
    const value = await RedisCache.get<{ hello: string }>('test-mem:basic');
    expect(value).toEqual({ hello: 'world' });

    await RedisCache.del('test-mem:basic');
    expect(await RedisCache.get('test-mem:basic')).toBeNull();
  });

  it('expira por TTL', async () => {
    await RedisCache.set('test-mem:ttl', 'expiring', 1);
    expect(await RedisCache.get('test-mem:ttl')).toBe('expiring');

    await new Promise((r) => setTimeout(r, 1100));
    expect(await RedisCache.get('test-mem:ttl')).toBeNull();
  });

  it('exists/expire/ttl', async () => {
    await RedisCache.set('test-mem:meta', 42);
    expect(await RedisCache.exists('test-mem:meta')).toBe(true);
    expect(await RedisCache.ttl('test-mem:meta')).toBe(-1);

    await RedisCache.expire('test-mem:meta', 10);
    const ttl = await RedisCache.ttl('test-mem:meta');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it('clearPattern limpia por patrón', async () => {
    await RedisCache.set('test-mem:auth:1', 'a');
    await RedisCache.set('test-mem:auth:2', 'b');
    await RedisCache.set('test-mem:dash:1', 'c');

    await RedisCache.clearPattern('test-mem:auth:*');

    expect(await RedisCache.get('test-mem:auth:1')).toBeNull();
    expect(await RedisCache.get('test-mem:auth:2')).toBeNull();
    expect(await RedisCache.get('test-mem:dash:1')).toBe('c');
  });

  it('increment/decrement', async () => {
    expect(await RedisCache.increment('test-mem:counter')).toBe(1);
    expect(await RedisCache.increment('test-mem:counter', 5)).toBe(6);
    expect(await RedisCache.decrement('test-mem:counter', 2)).toBe(4);
  });

  it('increment/decrement preservan la expiración (rate limit no se bloquea para siempre)', async () => {
    // Simula el flujo de userRateLimit: expire() en el primer intento
    await RedisCache.increment('test-mem:rl');
    await RedisCache.expire('test-mem:rl', 1);

    // Intentos siguientes NO deben resetear la ventana
    await RedisCache.increment('test-mem:rl');
    await RedisCache.increment('test-mem:rl', 3);
    expect(await RedisCache.ttl('test-mem:rl')).toBeGreaterThan(0);

    // Tras la ventana, el contador debe expirar (no quedar bloqueado)
    await new Promise((r) => setTimeout(r, 1100));
    expect(await RedisCache.get('test-mem:rl')).toBeNull();
    expect(await RedisCache.increment('test-mem:rl')).toBe(1);
  });

  it('cachea datos no serializables de forma transparente (objetos)', async () => {
    const obj = { id: 'x', nested: { list: [1, 2, 3] }, bool: true };
    await RedisCache.set('test-mem:obj', obj);
    expect(await RedisCache.get('test-mem:obj')).toEqual(obj);
  });
});
