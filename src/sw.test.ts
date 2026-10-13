// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/** Loads public/sw.js with a fake service worker global and returns its event handlers. */
function loadServiceWorker(windows: { url: string; navigate: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[] = []) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: { body: string; data: { url: string } } }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: 'https://intercede.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    registration: { showNotification: async (title: string, options: never) => void shown.push({ title, options }) },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => void opened.push(url),
      claim: () => {},
    },
    skipWaiting: () => {},
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches: {}, fetch, URL, Promise });
  return { handlers, shown, opened };
}

async function fire(handler: (e: unknown) => void, event: Record<string, unknown>) {
  let work: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (work = p) });
  await work;
}

describe('service worker notifications', () => {
  it('shows a pushed notification with its link', async () => {
    const sw = loadServiceWorker();
    await fire(sw.handlers.push, { data: { json: () => ({ title: 'Bob prayed for you', body: 'Mum surgery', url: '/#/prayers/1' }) } });
    expect(sw.shown).toEqual([{ title: 'Bob prayed for you', options: expect.objectContaining({ body: 'Mum surgery', data: { url: '/#/prayers/1' } }) }]);
  });

  it('copes with a push that has no or broken data', async () => {
    const sw = loadServiceWorker();
    await fire(sw.handlers.push, { data: null });
    await fire(sw.handlers.push, { data: { json: () => JSON.parse('nope'), text: () => 'plain text' } });
    expect(sw.shown.map((n) => [n.title, n.options.body, n.options.data.url])).toEqual([
      ['New notification', '', '/'],
      ['New notification', 'plain text', '/'],
    ]);
  });

  it('opens the linked screen in an existing window, or a new one', async () => {
    const win = { url: 'https://intercede.example/#/', navigate: vi.fn(async () => win), focus: vi.fn() };
    const sw = loadServiceWorker([win]);
    const close = vi.fn();
    await fire(sw.handlers.notificationclick, { notification: { close, data: { url: '/#/groups/g1' } } });
    expect(close).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith('https://intercede.example/#/groups/g1');
    expect(win.focus).toHaveBeenCalled();

    const fresh = loadServiceWorker([]);
    await fire(fresh.handlers.notificationclick, { notification: { close, data: { url: '/#/session' } } });
    expect(fresh.opened).toEqual(['https://intercede.example/#/session']);
  });
});
