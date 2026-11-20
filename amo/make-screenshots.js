// Regenerates amo/screenshots/*.png (1280×800): the real popup, fed demo tabs through a stand-in
// `browser` object, next to a headline. Run: bun amo/make-screenshots.js
// Needs Firefox and the Space Grotesk and Inter fonts installed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchFirefox, ROOT, waitFor } from '../tests/firefox/harness.js';

const OUT = join(ROOT, 'amo', 'screenshots');

/** One entry per screenshot. `setup` runs inside the page; `doc` is the popup's document. */
const SCENES = [
  {
    file: '1-by-site',
    title: 'Copy every tab from one site.',
    text: 'By site groups your window by website. One click copies all 48 YouTube tabs, clean of tracking parameters.',
    settings: { lastFilter: 'bySite', autoCloseDuplicates: true },
    setup: '',
  },
  {
    file: '2-copy-site',
    title: 'One site. One click.',
    text: 'Open a site to see its tabs, then copy them as a plain list of links, one per line.',
    settings: { lastFilter: 'bySite' },
    setup: `doc.querySelector('.site[data-site="youtube.com"] .site-name').click();`,
  },
  {
    file: '3-paste-links',
    title: 'Paste a list. Open them all.',
    text: 'Links already open are skipped. New tabs open in the background and load only when you click them.',
    settings: {},
    setup: `
      const box = doc.querySelector('#links');
      const pasted = [
        ...Array.from({ length: 12 }, (_, i) => 'https://www.youtube.com/watch?v=new' + (i + 1)),
        'https://www.youtube.com/watch?v=demo000', 'https://labinator.com/', 'https://news.ycombinator.com/',
        'tomorrow',
      ].join('\\n');
      box.value = pasted;
      doc.querySelector('#open').click();
      await new Promise((r) => setTimeout(r, 300));
      box.value = pasted;
      hover(doc.querySelector('#open'), 'var(--ink-soft)');`,
  },
  {
    file: '4-recently-closed',
    title: 'Bring back what you closed.',
    text: "Firefox's recently closed tabs, one click away, restored with their history.",
    settings: { autoCloseDuplicates: true },
    setup: `doc.querySelector('#closed').click(); hover(doc.querySelector('#closed'), 'var(--paper-deep)');`,
  },
  {
    file: '5-sort',
    title: 'Sort A→Z. Groups stay put.',
    text: 'Sorts your tabs by address. Pinned tabs and tab groups keep their place; tabs inside a group are sorted among themselves.',
    settings: { lastFilter: 'notPinned' },
    sorted: true,
    setup: `hover(doc.querySelector('#sort'), 'var(--paper-deep)');`,
  },
  {
    file: '6-duplicates',
    title: 'Find duplicates. Close them.',
    text: 'See the copies you already have open, in this window or all windows, and close them in one click. YouTube videos match by video.',
    settings: {},
    setup: `doc.querySelector('#dups').click();`,
  },
];

/** The stand-in `browser` object, loaded by the popup before its own script. */
const MOCK = `
import { compareUrls } from '/src/lib/rules.js';
const scene = parent.SCENE;
const listen = { addListener() {} };
const tabs = [];
let nextId = 1;
const add = (title, url, extra = {}) =>
  tabs.push({ id: nextId++, windowId: 1, title, url, pinned: false, groupId: -1, incognito: false,
    cookieStoreId: 'firefox-default', active: false, ...extra });

add('Hacker News', 'https://news.ycombinator.com/', { pinned: true, active: true });
add('Labinator', 'https://labinator.com/', { pinned: true });
const videos = ['Lo-fi beats for deep focus — 3 hour mix', 'Typography basics for developers',
  'Build a Firefox add-on from scratch', 'The history of the hyperlink', 'Classical guitar for focus',
  'CSS Grid in 20 minutes', 'Forest birdsong at dawn', 'How browsers render a page',
  'Ambient piano for reading', 'Keyboard shortcuts you should know', 'A tour of tab groups',
  'Rain on a tin roof — 2 hours'];
const name = (i) => videos[i % 12] + (i >= 12 ? ' (part ' + (Math.floor(i / 12) + 1) + ')' : '');
const loose = [];
for (let i = 0; i < 43; i++) {
  loose.push([name(i), 'https://www.youtube.com/watch?v=demo' + String(i).padStart(3, '0')]);
}
for (let i = 0; i < 14; i++) {
  loose.push(['labinator/project-' + (i + 1) + ': Labinator open-source project', 'https://github.com/labinator/project-' + (i + 1)]);
}
for (const [t, p] of [['Array.prototype.sort()', 'JavaScript/Reference/Global_Objects/Array/sort'],
  ['CSS grid-template', 'CSS/grid-template'], ['MutationObserver', 'API/MutationObserver'],
  ['sessions.restore()', 'Mozilla/Add-ons/WebExtensions/API/sessions/restore'],
  ['tabGroups', 'Mozilla/Add-ons/WebExtensions/API/tabGroups'],
  ['tabs.query()', 'Mozilla/Add-ons/WebExtensions/API/tabs/query'], ['URLSearchParams', 'API/URLSearchParams'],
  ['Clipboard API', 'API/Clipboard_API'], ['tabs.move()', 'Mozilla/Add-ons/WebExtensions/API/tabs/move']]) {
  loose.push([t + ' - MDN Web Docs', 'https://developer.mozilla.org/en-US/docs/Web/' + p]);
}
loose.push(['Hyperlink - Wikipedia', 'https://en.wikipedia.org/wiki/Hyperlink']);
loose.push(['Tab (interface) - Wikipedia', 'https://en.wikipedia.org/wiki/Tab_(interface)']);
loose.push(["Newest 'firefox-addon' Questions", 'https://stackoverflow.com/questions/tagged/firefox-addon']);
loose.push(['BBC News - Home', 'https://www.bbc.com/news']);
// A fixed shuffle, so the list looks like a real window and every run gives the same picture.
loose.map((row, i) => [(i * 37) % loose.length, row]).sort((a, b) => a[0] - b[0]).forEach(([, r]) => add(r[0], r[1]));
// Five videos opened a second time: same video, different link.
for (const [i, url] of [[0, 'https://www.youtube.com/watch?v=demo000&t=95s'], [2, 'https://www.youtube.com/watch?v=demo002&t=41s'],
  [5, 'https://www.youtube.com/watch?v=demo005&list=PLfocus'], [8, 'https://www.youtube.com/watch?v=demo008&t=12m4s'],
  [3, 'https://www.youtube.com/watch?v=demo003&t=30s']]) {
  tabs.splice(8 + i * 9, 0, { ...tabs.find((t) => t.url.endsWith('demo00' + i)), id: nextId++, url });
}
if (scene.sorted) {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned).sort((a, b) => compareUrls(a.url, b.url));
  tabs.splice(0, tabs.length, ...pinned, ...rest);
}
const reindex = () => tabs.forEach((t, i) => { t.index = i; });
reindex();

const closed = [['Clipboard API - MDN Web Docs', 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API'],
  ['Hyperlink - Wikipedia', 'https://en.wikipedia.org/wiki/Hyperlink'], ['BBC News - Home', 'https://www.bbc.com/news'],
  ['tabs.move() - MDN Web Docs', 'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/move'],
  ['Tab (interface) - Wikipedia', 'https://en.wikipedia.org/wiki/Tab_(interface)'],
  ["Newest 'firefox-addon' Questions", 'https://stackoverflow.com/questions/tagged/firefox-addon']];
const stored = { ...scene.settings };

window.browser = {
  tabs: {
    query: async (q) => tabs.filter((t) => (q.active === undefined || t.active === q.active)).map((t) => ({ ...t })),
    create: async (t) => { add(t.title, t.url); reindex(); },
    remove: async () => {}, move: async () => {}, ungroup: async () => {}, update: async (id) => ({ id, windowId: 1 }),
    onCreated: listen, onRemoved: listen, onMoved: listen, onAttached: listen, onDetached: listen, onUpdated: listen,
  },
  windows: { WINDOW_ID_CURRENT: -2, getCurrent: async () => ({ id: 1 }), update: async () => {} },
  sessions: {
    onChanged: listen,
    getRecentlyClosed: async () => closed.map(([title, url], i) => ({ tab: { sessionId: 's' + i, title, url } })),
    restore: async () => {},
  },
  storage: { local: { get: async (defaults) => ({ ...defaults, ...stored }), set: async (v) => { Object.assign(stored, v); } } },
};
`;

const page = scene => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; background: #f7f5ef; position: relative; color: #141414; }
  .copy { position: absolute; left: 80px; top: 0; height: 800px; width: 520px; display: flex; flex-direction: column;
    justify-content: center; }
  .label { display: flex; align-items: center; gap: 12px; font: 500 13px Inter, sans-serif; letter-spacing: 0.14em;
    text-transform: uppercase; color: #262626; }
  .label::before { content: ""; width: 18px; height: 18px; background: #2400ff; }
  h1 { margin: 26px 0 0; font: 300 54px / 1.08 "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
  p { margin: 24px 0 0; max-width: 500px; font: 400 20px / 30px Inter, sans-serif; color: #404040; }
  .rule { margin-top: 34px; width: 64px; height: 2px; background: #2400ff; }
  .shot { position: absolute; left: 658px; top: 50%; transform: translateY(-50%); width: 540px; max-height: 720px;
    overflow: hidden; border: 1px solid #e3dfd6; }
  iframe { display: block; border: 0; width: 360px; transform: scale(1.5); transform-origin: 0 0; }
</style>
<div class="copy">
  <div class="label">Essential Tabs Toolbox</div>
  <h1>${scene.title}</h1>
  <p>${scene.text}</p>
  <div class="rule"></div>
</div>
<div class="shot"><iframe src="/src/popup/popup.html"></iframe></div>
<script>
  window.SCENE = ${JSON.stringify({ settings: scene.settings, sorted: Boolean(scene.sorted) })};
  const hover = (el, bg) => { el.style.background = bg; el.style.boxShadow = 'inset 0 -2px 0 var(--primary)'; };
  const frame = document.querySelector('iframe');
  frame.addEventListener('load', async () => {
    const doc = frame.contentDocument;
    while (!doc.body.dataset.renderedMs) await new Promise((r) => setTimeout(r, 50));
    ${scene.setup}
    await new Promise((r) => setTimeout(r, 400));
    doc.activeElement?.blur();
    const h = doc.body.getBoundingClientRect().height;
    frame.style.height = h + 'px';
    frame.parentElement.style.height = Math.min(720, Math.round(h * 1.5)) + 'px';
    document.body.dataset.ready = '1';
  });
</script>`;

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/shot') {
      return new Response(page(SCENES[Number(url.searchParams.get('n'))]), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (url.pathname === '/mock.js') {
      return new Response(MOCK, { headers: { 'content-type': 'text/javascript' } });
    }
    if (url.pathname === '/src/popup/popup.html') {
      const html = await Bun.file(join(ROOT, 'src/popup/popup.html')).text();
      return new Response(
        html.replace('<script', '<script type="module" src="/mock.js"></script>\n  <script'),
        {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      );
    }
    if (url.pathname.startsWith('/src/') && !url.pathname.includes('..')) {
      return new Response(Bun.file(join(ROOT, url.pathname)));
    }
    return new Response('not found', { status: 404 });
  },
});

const ff = await launchFirefox();
try {
  for (const [n, scene] of SCENES.entries()) {
    const tab = await ff.openTab(`http://127.0.0.1:${server.port}/shot?n=${n}`);
    await waitFor(() => ff.evaluate(tab, `document.body.dataset.ready ?? null`), {
      label: `${scene.file} ready`,
    });
    const shot = await ff.send('browsingContext.captureScreenshot', {
      context: tab,
      origin: 'document',
      clip: { type: 'box', x: 0, y: 0, width: 1280, height: 800 },
    });
    writeFileSync(join(OUT, `${scene.file}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`${scene.file}.png`);
  }
} finally {
  await ff.close();
  server.stop(true);
}
