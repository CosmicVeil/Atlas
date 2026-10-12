// Browser check for the home page scroll intro. Owned by the workflow controller.
//
// Contract with the implementation (see the design spec):
//   [data-home-intro]                 the tall scroll wrapper
//   [data-intro-title]                the ATLAS title shown before the scenes
//   [data-intro-scene="<key>"]        one scene per feature, keys in SCENES order
//   [data-intro-cta]                  inside each scene: the clickable call to action
//   [data-intro-layout="A|B|C"]       on each scene: which layout it uses (desktop)
//   [data-intro-heading]              inside each scene: its headline
//   [data-intro-copy] [data-intro-art] inside each scene: the text box and the illustration box
//   [data-intro-interactive]          inside each scene: elements a visitor can use ("slider" for sliders)
//
// Usage: node home_scroll_intro.mjs <checkout>
// Screenshots go to $AI_RUN_DIR/screenshots/$AI_CHECK_LABEL (or ./screenshots).

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOOLS = process.env.AI_WORKFLOW_PLAYWRIGHT || join(homedir(), '.cache/ai-workflow/playwright');
const require = createRequire(join(TOOLS, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error(`Playwright is not installed in ${TOOLS}. See .ai-workflow/SETUP.md (Browser checks).`);
  process.exit(2);
}

const SCENES = [
  { key: 'portfolio', title: 'Portfolio Management', paths: ['/portfolio', '/login'] },
  { key: 'stock-data', title: 'Stock Data Explorer', paths: ['/stock-data', '/login'] },
  { key: 'ai-analysis', title: 'AI Market Analysis', paths: ['/ai-analysis', '/login'] },
  { key: 'advisor', title: 'Personal AI Advisor', paths: ['/ai-analysis', '/login'] },
  { key: 'profile', title: 'User Profile', paths: ['/profile', '/login'] },
  { key: 'insights', title: 'Market Insights', paths: ['/market-news', '/login'] },
];
const STEPS = 120;
const MIN_WRAPPER_VIEWPORTS = 9;
const MIN_TRANSITION_STEPS = 4;
const checkout = process.argv[2] || process.cwd();
const shotDir = process.env.AI_RUN_DIR
  ? join(process.env.AI_RUN_DIR, 'screenshots', process.env.AI_CHECK_LABEL || 'manual')
  : join(process.cwd(), 'screenshots');
mkdirSync(shotDir, { recursive: true });

const failures = [];
const fail = (message) => { failures.push(message); console.error(`FAIL: ${message}`); };

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const server = spawn('npm', ['--prefix', join(checkout, 'frontend'), 'run', 'dev', '--',
    '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let output = '';
  server.stdout.on('data', (d) => { output += d; });
  server.stderr.on('data', (d) => { output += d; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return { server, url };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  process.kill(-server.pid, 'SIGTERM');
  throw new Error(`Dev server did not start on ${url}\n${output}`);
}

// Effective opacity of an element: its own and every ancestor's, plus whether it is on screen.
const visibility = (el) => {
  if (!el) return { opacity: 0, onScreen: false };
  let opacity = 1;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return { opacity: 0, onScreen: false };
    opacity *= Number(style.opacity);
  }
  const r = el.getBoundingClientRect();
  const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  return { opacity, onScreen };
};

async function settle(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(150);
}

async function wrapperBounds(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-home-intro]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height, vh: innerHeight };
  });
}

async function sample(page) {
  return page.evaluate(({ keys, visibilitySrc }) => {
    const visibility = new Function(`return (${visibilitySrc})`)();
    const title = visibility(document.querySelector('[data-intro-title]'));
    const scenes = {};
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
    };
    for (const key of keys) {
      const scene = document.querySelector(`[data-intro-scene="${key}"]`);
      const heading = scene?.querySelector('[data-intro-heading]');
      scenes[key] = {
        exists: Boolean(scene),
        ...visibility(scene),
        cta: visibility(scene?.querySelector('[data-intro-cta]')),
        layout: scene?.getAttribute('data-intro-layout') || null,
        heading: { ...visibility(heading), rect: rect(heading) },
        copy: rect(scene?.querySelector('[data-intro-copy]')),
        interactive: scene ? scene.querySelectorAll('[data-intro-interactive]').length : 0,
      };
    }
    return { title, scenes };
  }, { keys: SCENES.map((s) => s.key), visibilitySrc: visibility.toString() });
}

async function desktopSequence(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await settle(page);

  const bounds = await wrapperBounds(page);
  if (!bounds) { fail('No [data-home-intro] wrapper on the home page'); await context.close(); return; }
  if (bounds.height < bounds.vh * MIN_WRAPPER_VIEWPORTS) fail(`Intro wrapper is ${(bounds.height / bounds.vh).toFixed(1)} viewports tall; expected at least ${MIN_WRAPPER_VIEWPORTS} so transitions have room`);

  const first = await sample(page);
  if (first.title.opacity < 0.9 || !first.title.onScreen) fail('ATLAS title ([data-intro-title]) is not fully visible at the top of the page');
  await page.screenshot({ path: join(shotDir, '00-top.png') });

  const firstSeen = {};
  const lastFull = {};
  const atFirst = {};
  let overlapReported = false;
  const scrollable = bounds.height - bounds.vh;
  let titleGoneBeforeScene = true;
  for (let step = 0; step <= STEPS; step += 1) {
    const y = bounds.top + (scrollable * step) / STEPS;
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await settle(page);
    const s = await sample(page);
    const shownHeadings = SCENES.filter((sc) => s.scenes[sc.key].heading.opacity > 0.2 && s.scenes[sc.key].heading.onScreen && s.scenes[sc.key].heading.rect);
    for (let a = 0; a < shownHeadings.length && !overlapReported; a += 1) {
      for (let b = a + 1; b < shownHeadings.length; b += 1) {
        const ra = s.scenes[shownHeadings[a].key].heading.rect;
        const rb = s.scenes[shownHeadings[b].key].heading.rect;
        if (ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom) {
          overlapReported = true;
          fail(`Headlines of "${shownHeadings[a].title}" and "${shownHeadings[b].title}" are visible on top of each other at step ${step}`);
          await page.screenshot({ path: join(shotDir, `overlap-step-${step}.png`) });
          break;
        }
      }
    }
    for (const [index, scene] of SCENES.entries()) {
      const state = s.scenes[scene.key];
      if (!state.exists) continue;
      if (state.opacity >= 0.8 && state.onScreen) lastFull[scene.key] = step;
      if (state.opacity >= 0.8 && state.onScreen && firstSeen[scene.key] === undefined) {
        firstSeen[scene.key] = step;
        atFirst[scene.key] = state;
        if (s.title.opacity > 0.1 && s.title.onScreen) titleGoneBeforeScene = false;
        if (state.cta.opacity < 0.8 || !state.cta.onScreen) fail(`The call to action in the "${scene.title}" scene is not visible while the scene is`);
        await page.screenshot({ path: join(shotDir, `${String(index + 1).padStart(2, '0')}-${scene.key}.png`) });
      }
    }
  }

  for (const scene of SCENES) {
    const exists = (await sample(page)).scenes[scene.key].exists;
    if (!exists) fail(`Missing scene [data-intro-scene="${scene.key}"] (${scene.title})`);
    else if (firstSeen[scene.key] === undefined) fail(`Scene "${scene.title}" never became visible while scrolling (frozen or hidden stage?)`);
  }
  const order = SCENES.filter((s) => firstSeen[s.key] !== undefined).map((s) => firstSeen[s.key]);
  if (order.some((step, i) => i > 0 && step <= order[i - 1])) fail(`Scenes did not appear one after another in grid order (first visible at steps ${JSON.stringify(firstSeen)})`);
  if (!titleGoneBeforeScene) fail('The ATLAS title was still visible when a feature scene appeared');

  // Transitions get their own stretch of scroll.
  for (let i = 1; i < SCENES.length; i += 1) {
    const prev = SCENES[i - 1]; const next = SCENES[i];
    if (lastFull[prev.key] === undefined || firstSeen[next.key] === undefined) continue;
    const gap = firstSeen[next.key] - lastFull[prev.key];
    if (gap < MIN_TRANSITION_STEPS) fail(`Transition from "${prev.title}" to "${next.title}" lasts ${gap} scroll step(s) of ${STEPS}; expected at least ${MIN_TRANSITION_STEPS}`);
  }

  // Layouts rotate and the text box moves between scenes.
  const layouts = new Set(SCENES.map((sc) => atFirst[sc.key]?.layout).filter(Boolean));
  if (layouts.size < 3) fail(`Scenes use ${layouts.size} distinct data-intro-layout value(s); expected at least 3 (found ${[...layouts].join(', ') || 'none'})`);
  for (let i = 1; i < SCENES.length; i += 1) {
    const a = atFirst[SCENES[i - 1].key]?.copy; const b = atFirst[SCENES[i].key]?.copy;
    if (!a || !b) { fail(`Scene "${SCENES[i].title}" or the one before it has no [data-intro-copy] text box`); continue; }
    const moved = Math.abs(a.cx - b.cx) > 1280 * 0.15 || Math.abs(a.cy - b.cy) > 800 * 0.15;
    if (!moved) fail(`The text box of "${SCENES[i].title}" sits in the same place as the previous scene's`);
  }

  // Each scene has working interactions that change it without navigating.
  for (const scene of SCENES) {
    if (firstSeen[scene.key] === undefined) continue;
    const middle = Math.round((firstSeen[scene.key] + (lastFull[scene.key] ?? firstSeen[scene.key])) / 2);
    await page.evaluate((top) => window.scrollTo(0, top), bounds.top + (scrollable * middle) / STEPS);
    await settle(page);
    const sceneSel = `[data-intro-scene="${scene.key}"]`;
    const count = await page.locator(`${sceneSel} [data-intro-interactive]`).count();
    if (count < 2) { fail(`Scene "${scene.title}" has ${count} [data-intro-interactive] element(s); expected at least 2`); continue; }
    const snapshot = () => page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const attrs = [...root.querySelectorAll('*')].map((el) => [...el.attributes].filter((a) => a.name !== 'style').map((a) => `${a.name}=${a.value}`).join(' '));
      return `${root.innerText}\n${attrs.join('\n')}`;
    }, sceneSel);
    const before = await snapshot();
    const urlBefore = page.url();
    const target = page.locator(`${sceneSel} [data-intro-interactive]`).first();
    try {
      if ((await target.getAttribute('data-intro-interactive')) === 'slider') {
        await target.focus();
        for (let k = 0; k < 3; k += 1) await page.keyboard.press('ArrowRight');
      } else {
        await target.click({ timeout: 3000 });
      }
      await settle(page);
      await page.waitForTimeout(400);
      if ((await snapshot()) === before) fail(`Using the first interactive element in "${scene.title}" changed nothing in the scene`);
      if (page.url() !== urlBefore) fail(`Using the first interactive element in "${scene.title}" navigated away to ${new URL(page.url()).pathname}`);
      await page.screenshot({ path: join(shotDir, `interact-${scene.key}.png`) });
    } catch (error) {
      fail(`Could not use the first interactive element in "${scene.title}": ${String(error.message || error).split('\n')[0]}`);
    }
    if (page.url() !== urlBefore) await page.goto(url, { waitUntil: 'networkidle' });
  }

  // Past the intro: the feature grid is reachable and readable.
  await page.evaluate((top) => window.scrollTo(0, top), bounds.top + bounds.height);
  await settle(page);
  await page.screenshot({ path: join(shotDir, '07-after-intro.png') });
  for (const scene of SCENES) {
    const card = page.locator('h3', { hasText: scene.title }).last();
    if (!(await card.count())) fail(`Feature card "${scene.title}" is missing after the intro`);
  }

  // Each call to action navigates to its feature (protected pages may redirect to /login).
  for (const scene of SCENES) {
    if (firstSeen[scene.key] === undefined) continue;
    await page.goto(url, { waitUntil: 'networkidle' });
    await settle(page);
    const b = await wrapperBounds(page);
    await page.evaluate((top) => window.scrollTo(0, top), b.top + ((b.height - b.vh) * firstSeen[scene.key]) / STEPS);
    await settle(page);
    const cta = page.locator(`[data-intro-scene="${scene.key}"] [data-intro-cta]`).first();
    try {
      await cta.click({ timeout: 3000 });
      await page.waitForURL((u) => scene.paths.includes(new URL(u).pathname), { timeout: 5000 });
    } catch {
      fail(`Clicking the "${scene.title}" call to action did not navigate to ${scene.paths[0]} (now at ${new URL(page.url()).pathname})`);
    }
  }

  if (errors.length) fail(`Console errors on the home page: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  await context.close();
}

async function reducedMotion(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await settle(page);
  const result = await page.evaluate(() => {
    const el = document.querySelector('[data-home-intro]');
    return { pinnedHeight: el ? el.getBoundingClientRect().height : 0, vh: innerHeight };
  });
  if (result.pinnedHeight > result.vh * 1.5) fail('With reduced motion, the scroll-pinned sequence is still active');
  await page.screenshot({ path: join(shotDir, '08-reduced-motion.png'), fullPage: true });
  for (const scene of SCENES) {
    if (!(await page.locator('h3', { hasText: scene.title }).count())) fail(`Reduced motion: feature "${scene.title}" is missing`);
  }
  await context.close();
}

async function mobile(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const fraction of [0, 0.15, 0.3, 0.45, 0.6]) {
    await page.evaluate((y) => window.scrollTo(0, y), height * fraction);
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) { fail(`Mobile (390px): page scrolls sideways by ${overflow}px at ${fraction * 100}% down`); break; }
  }
  await page.evaluate((y) => window.scrollTo(0, y), height * 0.3);
  await settle(page);
  await page.screenshot({ path: join(shotDir, '09-mobile.png') });
  await context.close();
}

const { server, url } = await startServer();
let browser;
try {
  browser = await chromium.launch();
  await desktopSequence(browser, url);
  await reducedMotion(browser, url);
  await mobile(browser, url);
} catch (error) {
  fail(`Browser check crashed: ${error.stack || error}`);
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already stopped */ }
}

console.log(`Screenshots: ${shotDir}`);
if (failures.length) {
  console.error(`\n${failures.length} problem(s) found.`);
  process.exit(1);
}
console.log('Home scroll intro browser check passed.');
