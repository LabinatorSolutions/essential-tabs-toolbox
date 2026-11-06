/**
 * Real-Firefox test harness.
 *
 * Launches the installed Firefox (159+) headless with a throwaway profile, connects to its native
 * WebDriver BiDi endpoint, and installs add-ons as temporary extensions. No geckodriver, no
 * Playwright: Firefox speaks BiDi itself, and Playwright's patched Firefox is not the browser the
 * add-on ships to.
 *
 * Override the binary with FIREFOX_PATH=/path/to/firefox.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Fixed internal UUID for the add-on under test, so tests can open its pages. */
export const TEST_UUID = '6f3b2b52-1d7e-4f1a-9c2e-0e5e8d3c7a11';
export const ADDON_ID = 'essential-tabs-toolbox@labinator.com';
export const ROOT = join(import.meta.dir, '..', '..');

/**
 * Polls `fn` until it returns a truthy value, then returns that value.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @param {{ timeout?: number, interval?: number, label?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function waitFor(fn, { timeout = 10000, interval = 100, label = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await Bun.sleep(interval);
  }
  throw new Error(`waitFor timed out after ${timeout} ms: ${label} (last: ${String(last)})`);
}

/**
 * Local HTTP fixture server. Every path answers with <title>PATH</title>; `/go?to=/x` redirects.
 * Reachable as both 127.0.0.1 and localhost, which gives tests two distinct sites.
 */
export function startServer() {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/go') {
        return new Response(null, {
          status: 302,
          headers: { Location: url.searchParams.get('to') || '/' },
        });
      }
      const label = url.pathname + url.search;
      return new Response(`<!doctype html><title>${label}</title><p>${label}</p>`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  });
  return {
    origin: `http://127.0.0.1:${server.port}`,
    altOrigin: `http://localhost:${server.port}`,
    stop: () => server.stop(true),
  };
}

/**
 * @param {{ extensions?: string[], uuids?: Record<string, string>, prefs?: Record<string, unknown> }} [opts]
 */
export async function launchFirefox({ extensions = [], uuids = {}, prefs = {} } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'ett-firefox-'));
  const allPrefs = {
    'extensions.webextensions.uuids': JSON.stringify(uuids),
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'datareporting.policy.dataSubmissionEnabled': false,
    'browser.tabs.groups.enabled': true,
    'browser.aboutwelcome.enabled': false,
    ...prefs,
  };
  writeFileSync(
    join(profile, 'user.js'),
    Object.entries(allPrefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n'),
  );

  const bin = process.env.FIREFOX_PATH || 'firefox';
  const proc = Bun.spawn(
    [bin, '--headless', '--no-remote', '--profile', profile, '--remote-debugging-port', '0'],
    {
      stdout: 'ignore',
      stderr: 'pipe',
      // Firefox 159 replaced --remote-allow-system-access with this variable. It lets BiDi script
      // moz-extension:// pages, and applies only to this throwaway headless test browser.
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' },
    },
  );

  // Firefox prints "WebDriver BiDi listening on ws://127.0.0.1:PORT" once the agent is ready.
  const wsBase = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Firefox did not start its BiDi agent in 30 s')),
      30000,
    );
    const decoder = new TextDecoder();
    let buffer = '';
    (async () => {
      for await (const chunk of proc.stderr) {
        buffer += decoder.decode(chunk);
        const m = buffer.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
          return;
        }
      }
      reject(new Error(`Firefox exited before BiDi was ready:\n${buffer}`));
    })();
  });

  const ws = new WebSocket(`${wsBase}/session`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  /** @type {Map<number, { resolve: Function, reject: Function, method: string }>} */
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id === undefined) return; // events are not used
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.type === 'error') p.reject(new Error(`${p.method}: ${msg.error}: ${msg.message}`));
    else p.resolve(msg.result);
  });

  /**
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<any>}
   */
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('session.new', { capabilities: {} });
  const installed = [];
  for (const path of extensions) {
    const r = await send('webExtension.install', { extensionData: { type: 'path', path } });
    installed.push(r.extension);
  }

  /** Top-level browsing contexts (tabs) with their URLs. */
  async function contexts() {
    const { contexts } = await send('browsingContext.getTree', { maxDepth: 0 });
    return contexts.map(c => ({ context: c.context, url: c.url }));
  }

  /** Opens a new tab and navigates it, waiting for load. Returns the context id. */
  async function openTab(url) {
    const { context } = await send('browsingContext.create', { type: 'tab', background: true });
    await send('browsingContext.navigate', { context, url, wait: 'complete' });
    return context;
  }

  /**
   * Evaluates `expression` in a tab and returns its JSON-decoded value. Wrap the expression so it
   * yields something JSON-serializable; promises are awaited.
   */
  async function evaluate(context, expression) {
    const r = await send('script.evaluate', {
      expression: `(async () => JSON.stringify(await (${expression})))()`,
      target: { context },
      awaitPromise: true,
      resultOwnership: 'none',
    });
    if (r.type === 'exception')
      throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails?.text)}`);
    const v = r.result?.value;
    return v === undefined ? undefined : JSON.parse(v);
  }

  /** Clicks the first element matching `selector` with real (trusted) pointer input. */
  async function click(context, selector) {
    const { nodes } = await send('browsingContext.locateNodes', {
      context,
      locator: { type: 'css', value: selector },
      maxNodeCount: 1,
    });
    if (!nodes.length) throw new Error(`click: no element matches ${selector}`);
    const origin = { type: 'element', element: { sharedId: nodes[0].sharedId } };
    await send('input.performActions', {
      context,
      actions: [
        {
          type: 'pointer',
          id: 'mouse',
          actions: [
            { type: 'pointerMove', x: 0, y: 0, origin },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  async function close() {
    try {
      await Promise.race([send('browser.close'), Bun.sleep(5000)]);
    } catch {
      // The connection drops as the browser exits.
    }
    ws.close();
    proc.kill();
    await proc.exited;
    rmSync(profile, { recursive: true, force: true });
  }

  return { send, contexts, openTab, evaluate, click, close, installed };
}
