import { describe, expect, it } from 'vitest';
import { chatBody, setup } from './helpers';

// The Worker on a route under the site's domain (site.com/api/*): POLISH1 C4.
describe('served under /api', () => {
  it('routes /api/health, /api/chat and /api/share, and returns first-party /api/s/:id links', async () => {
    const { call, post } = setup();
    expect((await call('/api/health')).status).toBe(200);
    const chat = await post('/api/chat', chatBody('hi'));
    expect(await chat.json()).toMatchObject({ type: 'route' });
    const { id, url } = (await (await post('/api/share', { html: '<p>hi</p>' })).json()) as { id: string; url: string };
    expect(url).toBe(`https://agent.example/api/s/${id}`);
    const page = await call(`/api/s/${id}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('<p>hi</p>');
    // the bare paths keep working (workers.dev)
    expect((await call(`/s/${id}`)).status).toBe(200);
    expect((await call('/apix/health')).status).toBe(404);
  });
});
