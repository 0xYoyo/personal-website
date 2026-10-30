import { describe, expect, it } from 'vitest';
import { BUCKETS, DailyCounter, takeToken } from '../src/limits';
import { MemoryKV, chatBody, setup } from './helpers';

describe('token bucket', () => {
  it('allows 20 live replies per IP per UTC day, then 429 quota (scripted for the day); other IPs unaffected', async () => {
    const { post, advance } = setup();
    for (let i = 0; i < 20; i++) expect((await post('/chat', chatBody(`hi ${i}`))).status).toBe(200);
    const blocked = await post('/chat', chatBody('one more'));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ reason: 'quota' });
    expect((await post('/chat', chatBody('hi'), { ip: '198.51.100.1' })).status).toBe(200);
    advance(6 * 3600_000); // still the same UTC day (12:00 → 18:00)
    expect((await post('/chat', chatBody('again'))).status).toBe(429);
    advance(7 * 3600_000); // past midnight UTC
    expect((await post('/chat', chatBody('again'))).status).toBe(200);
  });

  it('CHAT_PER_IP_DAY overrides the per-IP allowance', async () => {
    const { post } = setup({ env: { CHAT_PER_IP_DAY: '2' } });
    expect((await post('/chat', chatBody('a'))).status).toBe(200);
    expect((await post('/chat', chatBody('b'))).status).toBe(200);
    expect((await post('/chat', chatBody('c'))).status).toBe(429);
  });

  it('the global default is 300 live replies a day', async () => {
    const { post, LIMITS } = setup();
    LIMITS.store.set('day:chat:2026-10-23', { value: '300', expires: null });
    const res = await post('/chat', chatBody('hi'));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ reason: 'quota' });
  });

  it('works without a LIMITS binding (local dev: in memory)', async () => {
    const { post } = setup({ env: { LIMITS: undefined, CHAT_PER_IP_DAY: '1' } });
    expect((await post('/chat', chatBody('a'), { ip: '192.0.2.50' })).status).toBe(200);
    expect((await post('/chat', chatBody('b'), { ip: '192.0.2.50' })).status).toBe(429);
  });

  it('allows 5 builds per hour per IP', async () => {
    const { post } = setup({ reply: ['<html></html>'] });
    for (let i = 0; i < 5; i++) expect((await post('/build', { instruction: 'a timer' })).status).toBe(200);
    const blocked = await post('/build', { instruction: 'a timer' });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ reason: 'rate' });
  });

  it('does not store raw IPs', async () => {
    const { post, LIMITS } = setup();
    await post('/chat', chatBody('hi'), { ip: '203.0.113.99' });
    expect([...LIMITS.store.keys()].some((k) => k.includes('203.0.113.99'))).toBe(false);
    expect([...LIMITS.store.keys()].some((k) => /^day:chat-ip:[0-9a-f]{16}:2026-10-23$/.test(k))).toBe(true);
  });

  it('fails open when KV throws', async () => {
    const kv = { get: async () => { throw new Error('kv down'); }, put: async () => undefined } as unknown as KVNamespace;
    expect((await takeToken(kv, 'k', BUCKETS.chat, 0)).ok).toBe(true);
  });

  it('uses a TTL longer than the window', async () => {
    let t = 0;
    const kv = new MemoryKV(() => t);
    const r = await takeToken(kv as unknown as KVNamespace, 'k', BUCKETS.build, t);
    await r.write;
    expect(kv.ttlOf('k')).toBe(3600 + 60);
    t += 1;
  });
});

describe('daily caps', () => {
  it('returns 429 quota when DAILY_CHAT_CAP is reached (across IPs)', async () => {
    const { post } = setup({ env: { DAILY_CHAT_CAP: '3' } });
    for (let i = 0; i < 3; i++) expect((await post('/chat', chatBody('hi'), { ip: `10.0.0.${i}` })).status).toBe(200);
    const res = await post('/chat', chatBody('hi'), { ip: '10.0.0.9' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ reason: 'quota' });
  });

  it('returns 429 quota when DAILY_BUILD_CAP is reached', async () => {
    const { post } = setup({ env: { DAILY_BUILD_CAP: '1' }, reply: ['<html></html>'] });
    expect((await post('/build', { instruction: 'x' }, { ip: '10.0.0.1' })).status).toBe(200);
    const res = await post('/build', { instruction: 'x' }, { ip: '10.0.0.2' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ reason: 'quota' });
  });

  it('resets at UTC midnight', async () => {
    const { post, advance } = setup({ env: { DAILY_CHAT_CAP: '1' } });
    expect((await post('/chat', chatBody('hi'), { ip: '10.0.0.1' })).status).toBe(200);
    expect((await post('/chat', chatBody('hi'), { ip: '10.0.0.2' })).status).toBe(429);
    advance(13 * 3600_000);
    expect((await post('/chat', chatBody('hi'), { ip: '10.0.0.3' })).status).toBe(200);
  });

  it('coalesces KV writes within the flush window', async () => {
    let t = 1_000_000;
    const kv = new MemoryKV(() => t);
    const c = new DailyCounter(kv as unknown as KVNamespace, { refreshMs: 60_000, flushMs: 2_000 });
    await c.count('chat', t);
    for (let i = 0; i < 10; i++) {
      await c.add('chat', t);
      t += 100;
    }
    expect(kv.puts).toBe(1);
    expect(await c.count('chat', t)).toBe(10);
    t += 2_000;
    await c.add('chat', t);
    expect(kv.puts).toBe(2);
    expect(await kv.get('day:chat:1970-01-01', 'text')).toBe('11');
  });
});
