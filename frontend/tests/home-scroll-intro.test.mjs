import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  INTRO_END, OUTRO_START, FEATURE_PHASES,
  getPhaseRange, getActivePhase, getLocalProgress, getFadeStops,
} from '../src/components/home/introPhases.js';
import { getReducedMotion, getServerReducedMotion, subscribeReducedMotion } from '../src/components/home/reducedMotion.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const home = await read('../src/pages/Home.jsx');
const intro = await read('../src/components/home/HomeScrollIntro.jsx');
const css = await read('../src/components/home/homeIntro.css');
const optionalRead = (name) => read(`../src/components/home/${name}`).catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const art = await optionalRead('IntroIllustrations.jsx');
const list = await optionalRead('IntroSceneList.jsx');
const cta = await optionalRead('IntroCta.jsx');
const hook = await optionalRead('useIntroProgress.js');
const phases = await import('../src/components/home/introPhases.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≈ ${expected}`);

function fadeAt(index, progress) {
  const { input, output } = getFadeStops(index);
  if (progress <= input[0] || progress >= input[3]) return 0;
  const stop = input.findIndex((value) => value > progress);
  const ratio = (progress - input[stop - 1]) / (input[stop] - input[stop - 1]);
  return output[stop - 1] + ratio * (output[stop] - output[stop - 1]);
}

function copyAt(index, progress) {
  const { input } = phases.getCopyFadeStops(index);
  return Math.max(0, Math.min(1,
    (progress - input[0]) / (input[1] - input[0]),
    (input[3] - progress) / (input[3] - input[2]),
  ));
}

test('six features and indicator icons match the unchanged grid order', () => {
  assert.deepEqual(FEATURE_PHASES.map(({ title }) => title), [
    'Portfolio Management', 'Stock Data Explorer', 'AI Market Analysis',
    'Personal AI Advisor', 'User Profile', 'Market Insights',
  ]);
  assert.deepEqual([...home.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]), FEATURE_PHASES.map(({ title }) => title));
  assert.equal(new Set(FEATURE_PHASES.map(({ key }) => key)).size, 6);
  const icons = ['Wallet', 'Search', 'Brain', 'LineChart', 'User', 'BarChart3'];
  FEATURE_PHASES.forEach(({ key }, index) => {
    assert.match(intro, new RegExp(`['"]?${key}['"]?: ${icons[index]}`));
  });
  assert.match(intro, /FEATURE_PHASES\.map/);
  assert.match(intro, /<button[\s\S]*?aria-label=\{phase.title\}/);
  assert.match(intro, /onClick=\{\(\) => scrollToScene\(index\)\}/);
});

test('phase ranges cover the scene timeline contiguously and reject invalid indices', () => {
  assert.equal(getPhaseRange(0)[0], INTRO_END);
  assert.equal(getPhaseRange(5)[1], OUTRO_START);
  for (let i = 0; i < 6; i++) {
    const [start, end] = getPhaseRange(i);
    close((end - start) * phases.TOTAL_VH, i === 0 || i === 5 ? 135 : 170);
    if (i < 5) assert.equal(end, getPhaseRange(i + 1)[0]);
  }
  for (const index of [-1, 6, 1.5, NaN, undefined]) {
    assert.throws(() => getPhaseRange(index), RangeError);
    assert.throws(() => getLocalProgress(0.5, index), RangeError);
    assert.throws(() => getFadeStops(index), RangeError);
  }
});

test('active feature handles exact boundaries, restored scroll positions and clamping', () => {
  for (const p of [-Infinity, -1, 0, 0.05, NaN]) assert.equal(getActivePhase(p), -1);
  for (const p of [OUTRO_START, 1, 2, Infinity]) assert.equal(getActivePhase(p), 6);
  for (let i = 0; i < 6; i++) {
    const [start, end] = getPhaseRange(i);
    assert.equal(getActivePhase(start), i);
    assert.equal(getActivePhase((start + end) / 2), i);
    assert.equal(getActivePhase(end - 1e-9), i);
    assert.equal(getActivePhase(end), i + 1);
  }
});

test('local progress clamps and reverses through every feature without accumulated state', () => {
  for (let i = 0; i < 6; i++) {
    const [start, end] = getPhaseRange(i);
    assert.equal(getLocalProgress(start, i), 0);
    close(getLocalProgress((start + end) / 2, i), 0.5);
    assert.equal(getLocalProgress(end, i), 1);
    assert.equal(getLocalProgress(-1, i), 0);
    assert.equal(getLocalProgress(2, i), 1);
    assert.equal(getLocalProgress(NaN, i), 0);
    const samples = [start, (start + end) / 2, end];
    const forward = samples.map((p) => getLocalProgress(p, i));
    assert.deepEqual(samples.reverse().map((p) => getLocalProgress(p, i)), forward.reverse());
  }
});

test('handoffs retract completely before travel and grow without overlapping content', () => {
  for (let i = 0; i < 6; i++) {
    const { input, output } = getFadeStops(i);
    assert.deepEqual(output, [0, 1, 1, 0]);
    assert.ok(input.every((p, j) => p >= 0 && p <= 1 && (!j || p > input[j - 1])));
    assert.equal(fadeAt(i, 0), 0);
    assert.equal(fadeAt(i, 1), 0);
    if (i < 5) {
      const { travel } = phases.getTransitionBeats(i);
      for (const p of [travel[0], (travel[0] + travel[1]) / 2, travel[1]]) {
        close(fadeAt(i, p), 0);
        close(fadeAt(i + 1, p), 0);
      }
    }
  }
  for (let step = 0; step <= 10000; step++) {
    assert.ok(FEATURE_PHASES.filter((_, i) => fadeAt(i, step / 10000) > 1e-12).length <= 1);
  }
  assert.ok(getFadeStops(0).input[0] < INTRO_END);
  assert.ok(getFadeStops(5).input[3] < 1);
});

test('wrapper progress scrubs ordered scenes and parks the stage at completion', () => {
  assert.match(intro, /useIntroProgress\(wrapperRef\)/);
  assert.doesNotMatch(intro, /useScroll/);
  assert.match(intro, /h-\[1070vh\]/);
  assert.match(intro, /pinned: progress < 1/);
  assert.match(intro, /stage\.pinned \? 'fixed inset-x-0 top-0 z-10' : 'absolute inset-x-0 bottom-0'/);
  assert.match(intro, /FEATURE_PHASES\.map\(\(phase, index\)/);
  assert.match(intro, /getIllustrationStops\(index\)/);
  assert.match(intro, /<IntroIllustration/);
  assert.match(intro, /next\.activeIndex !== previous\.current\.activeIndex \|\| next\.pinned !== previous\.current\.pinned/);
  assert.match(intro, /pointer-events-none/);
});

test('each feature includes its scroll-driven visual behavior', () => {
  for (const visual of ['PortfolioRow', 'Candle', 'VolumeBar', 'TypedLetter', 'ProfileChip', 'GainBar', 'LossBar']) {
    assert.match(art, new RegExp(`function ${visual}\\(`));
    assert.match(art, new RegExp(`<${visual} `));
  }
  for (const text of ['Retirement', 'Growth', 'Dividends', 'Largest holding: NVDA, 18%', 'stocks analysed', 'How does AAPL fit my portfolio?', 'Conservative', 'Education', 'USD', 'EUR']) assert.ok(art.includes(text), text);
  assert.match(art, /40 \* 25/);
  assert.match(art, /index \* 37/);
  assert.match(art, /motion\.path[^\n]+style=\{\{ pathLength \}\}/);
  assert.match(art, /motion\.path[^\n]+style=\{\{ x \}\}/);
  assert.match(art, /motion\.g/);
  assert.match(art, /tabular-nums/);
  assert.doesNotMatch(intro + art, /animate=|setInterval|setTimeout|Math\.random/);
});

for (const [component, origin] of [
  ['Candle', '50% 100%'],
  ['VolumeBar', '50% 0%'],
  ['GainBar', '50% 100%'],
  ['LossBar', '50% 0%'],
]) {
  test(`${component} transforms around its own ${origin === '50% 100%' ? 'base' : 'top'}`, () => {
    const body = art.match(new RegExp(`function ${component}\\([\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(body, `${component} exists`);
    assert.ok(body.includes(`transformOrigin: '${origin}'`));
    assert.doesNotMatch(body, /transformBox:/); // Percentages use Motion's default fill-box.
  });
}

test('SVG motion elements never interpret pixel origins relative to the default fill-box', () => {
  const svgStyles = [...art.matchAll(/<motion\.(?:circle|g|path|rect|svg)\b[^\n]*?style=\{\{([^\n]*?)\}\}/g)];
  assert.ok(svgStyles.length > 0);
  let origins = 0;
  for (const [, style] of svgStyles) {
    if (!style.includes('transformOrigin:')) continue;
    origins++;
    assert.ok(
      /transformOrigin:\s*['"]\d+(?:\.\d+)?% \d+(?:\.\d+)?%['"]/.test(style)
        || /transformBox:\s*['"]view-box['"]/.test(style),
      `SVG origin needs percentages or an explicit view-box: ${style}`,
    );
  }
  assert.equal(origins, 5); // includes the in-SVG grow group, which uses an explicit view-box
});

test('reduced motion renders a static, responsive hero outside the pinned sequence', () => {
  assert.match(home, /useSyncExternalStore\(subscribeReducedMotion, getReducedMotion, getServerReducedMotion\)/);
  const fallback = home.match(/reduceMotion !== false \? \(([\s\S]*?)\) : <HomeScrollIntro \/>/)?.[1];
  assert.ok(fallback);
  assert.match(fallback, /data-home-intro/);
  assert.match(fallback, /data-intro-title/);
  assert.match(fallback, /<IntroSceneList/);
  assert.match(fallback, /ATLAS/);
  assert.match(fallback, /AI Trading, Learning & Stock Analysis/);
  assert.match(fallback, /text-6xl sm:text-8xl md:text-9xl/);
  assert.doesNotMatch(fallback, /motion\.|animate|fixed|sticky|300vh/);
});

test('reduced-motion preference changes notify React and unsubscribe on unmount', () => {
  assert.equal(getReducedMotion(), true);
  assert.equal(getServerReducedMotion(), true);
  const listeners = new Set();
  const media = {
    matches: false,
    addEventListener(event, listener) { assert.equal(event, 'change'); listeners.add(listener); },
    removeEventListener(event, listener) { assert.equal(event, 'change'); listeners.delete(listener); },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; },
  } });
  try {
    let notifications = 0;
    const cleanup = subscribeReducedMotion(() => notifications++);
    assert.equal(getReducedMotion(), false);
    media.matches = true;
    listeners.forEach((listener) => listener());
    assert.equal(getReducedMotion(), true);
    assert.equal(notifications, 1);
    media.matches = false;
    listeners.forEach((listener) => listener());
    assert.equal(getReducedMotion(), false);
    assert.equal(notifications, 2);
    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});

test('manual progress updates are passive, frame-throttled and cleaned up', () => {
  assert.match(intro, /useMotionValueEvent\(scrollYProgress, 'change'/);
  assert.match(hook, /passive: true/);
  assert.match(hook, /requestAnimationFrame/);
  assert.match(hook, /cancelAnimationFrame/);
  assert.match(hook, /removeEventListener\('scroll'/);
  assert.match(hook, /removeEventListener\('resize'/);
  assert.doesNotMatch(intro + art, /style=\{\{[^}]*\b(?:width|height|top|left):/);
});

test('mobile art fits its container and overflow stays inside the stage', () => {
  assert.match(css, /width: min\(100%, 38rem\)/);
  assert.match(css, /height: 100svh/);
  assert.match(intro, /home-intro-stage w-full overflow-hidden/);
  assert.doesNotMatch(intro + art + list + css, /100vw|w-screen|min-w-\[/);
});

test('feature cards retain navigation, hover effects and content', () => {
  assert.match(home, /navigate\('\/portfolio'\)/);
  assert.match(home, /navigate\('\/profile'\)/);
  assert.equal((home.match(/whileHover=\{\{ scale: 1\.02 \}\}/g) || []).length, 6);
  assert.equal((home.match(/group-hover:bg-white\/\[0\.02\]/g) || []).length, 6);
  for (const text of [
    'Track multiple portfolios with real-time performance metrics and AI-driven insights.',
    'Access comprehensive market data, historical charts, and real-time analytics.',
    'Daily analysis of top 1000 stocks with recommendations and risk assessment.',
    'Custom stock analysis and recommendations based on your portfolio and budget.',
    'Manage preferences, risk tolerance, and investment goals in one place.',
    'Best and worst performing stocks with detailed AI-generated explanations.',
  ]) assert.ok(home.includes(text));
});


test('scene contract has exact keys, card copy, routes and link labels in both modes', () => {
  assert.deepEqual(FEATURE_PHASES.map(({ key }) => key), ['portfolio', 'stock-data', 'ai-analysis', 'advisor', 'profile', 'insights']);
  assert.deepEqual(FEATURE_PHASES.map(({ cta, route }) => [cta, route]), [
    ['Open portfolios', '/portfolio'], ['Explore stock data', '/stock-data'],
    ["See today's analysis", '/ai-analysis'], ['Ask about a stock', '/ai-analysis'],
    ['Open your profile', '/profile'], ['View market insights', '/market-news'],
  ]);
  FEATURE_PHASES.forEach(({ description, cta }) => {
    assert.ok(home.includes(description));
    assert.doesNotMatch(cta, /[→➜↗]/);
    assert.notEqual(cta, cta.toUpperCase());
  });
  for (const source of [intro, list]) {
    assert.match(source, /data-intro-scene=\{/);
    assert.match(source, /<IntroCta/);
    assert.doesNotMatch(source, /<motion.div aria-hidden="true" className="home-intro-scene/);
  }
  assert.match(intro, /data-home-intro/);
  assert.match(intro, /data-intro-title/);
  assert.match(cta, /<Link/);
  assert.match(cta, /data-intro-cta/);
  assert.match(cta, /to=\{phase.route\}/);
  assert.match(cta, /onFocus=/);
  assert.match(cta, /scrollToScene\(index\)/);
  assert.match(cta, /pointer-events-auto/);
  assert.match(cta, /pointer-events-none/);
  assert.match(art, /aria-hidden="true"/);
});

test('v2 timing budgets readable holds and three equal transition beats with no title overlap', () => {
  assert.deepEqual([phases.TITLE_VH, phases.HOLD_VH, phases.TRANSITION_VH, phases.RELEASE_VH, phases.TOTAL_VH], [70, 100, 70, 50, 1070]);
  close(INTRO_END * 1070, 70);
  close((1 - OUTRO_START) * 1070, 50);
  assert.ok(phases.TITLE_FOLD_END <= getFadeStops(0).input[0]);
  assert.match(intro, /TITLE_FOLD_END/);
  for (let i = 0; i < 6; i++) {
    const [start, end] = phases.getHoldRange(i);
    close((end - start) * 1070, 100);
    if (i === 5) continue;
    const { retract, travel, grow } = phases.getTransitionBeats(i);
    assert.equal(retract[0], end);
    assert.equal(retract[1], travel[0]);
    assert.equal(travel[1], grow[0]);
    assert.equal(grow[1], phases.getHoldRange(i + 1)[0]);
    for (const [a, b] of [retract, travel, grow]) close((b - a) * 1070, 70 / 3);
  }
  for (const index of [-1, 6, NaN, 0.5]) assert.throws(() => phases.getHoldRange(index), RangeError);
  for (const index of [-1, 5, NaN, 0.5]) assert.throws(() => phases.getTransitionBeats(index), RangeError);
});

test('wrapper geometry clamps, rewinds and handles invalid or zero scroll distances', () => {
  const { getWrapperProgress } = phases;
  for (const [top, height, viewport, expected] of [
    [0, 7600, 1000, 0], [-6600, 7600, 1000, 1], [-3300, 7600, 1000, 0.5],
    [100, 7600, 1000, 0], [-9999, 7600, 1000, 1],
    [-10, 1000, 1000, 0], [-10, 500, 1000, 0], [NaN, 7600, 1000, 0], [0, NaN, 1000, 0],
  ]) assert.equal(getWrapperProgress(top, height, viewport), expected);
  const positions = [0, -200, -3300, -6600];
  const forward = positions.map(top => getWrapperProgress(top, 7600, 1000));
  assert.deepEqual(positions.reverse().map(top => getWrapperProgress(top, 7600, 1000)), forward.reverse());
});

test('rail and focus scroll targets reach the full-opacity hold and invert geometry', () => {
  for (let i = 0; i < 6; i++) {
    const p = phases.getSceneScrollProgress(i);
    assert.equal(getActivePhase(p), i);
    assert.equal(fadeAt(i, p), 1);
    const y = phases.progressToScrollY(p, 125, 7600, 1000);
    close(phases.getWrapperProgress(125 - y, 7600, 1000), p);
  }
  for (const index of [-1, 6, NaN, 0.5]) assert.throws(() => phases.getSceneScrollProgress(index), RangeError);
});

test('reduced motion lists the six final frames without pinning or pulse', () => {
  assert.match(list, /FEATURE_PHASES.map/);
  assert.match(list, /useMotionValue\(1\)/);
  assert.match(list, /variant="static"/);
  assert.doesNotMatch(list, /fixed|sticky|h-\[.*vh|useIntroProgress/);
  assert.doesNotMatch(home, /repeat: Infinity/);
});

test('sonar is the only loop, active-only, paused for interaction and disabled for reduced motion', () => {
  assert.match(css, /@keyframes home-intro-sonar/);
  assert.match(css, /\.home-intro-cta.is-active::after\s*\{[^}]*animation: home-intro-sonar 1.6s ease-out infinite/);
  assert.match(css, /:hover::after[\s\S]*?:focus-visible::after\s*\{[^}]*animation-play-state: paused/);
  assert.match(css, /\.home-intro-cta--static::after\s*\{[^}]*animation: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.match(css, /outline-offset:/);
  assert.match(css, /scale\(1.18, 1.6\)/);
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/#9FB7FF/i.test(block[2])) assert.match(block[1], /cta/);
    if (/cta/.test(block[1])) assert.doesNotMatch(block[2], /#5FBF93|#E07A6A/i);
  }
});

test('manual scroll subscription advances through overflow ancestors, restores, throttles and cleans up', async () => {
  const { subscribeIntroProgress } = await import('../src/components/home/useIntroProgress.js');
  const listeners = new Map();
  const frames = new Map();
  let id = 0;
  let reads = 0;
  let top = -3300;
  const values = [];
  const win = {
    innerHeight: 1000,
    addEventListener(type, cb, options) {
      if (type === 'scroll') assert.equal(options.passive, true);
      listeners.set(type, cb);
    },
    removeEventListener(type, cb) { assert.equal(listeners.get(type), cb); listeners.delete(type); },
    requestAnimationFrame(cb) { frames.set(++id, cb); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
  };
  const wrapper = { getBoundingClientRect() { reads++; return { top, height: 7600 }; } };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb()); };
  const cleanup = subscribeIntroProgress(wrapper, { set: value => values.push(value) }, win);
  flush();
  assert.deepEqual(values, [0.5]); // Restored position, even when ancestors never scroll.
  for (let i = 0; i < 20; i++) listeners.get('scroll')();
  assert.equal(frames.size, 1);
  top = -6600;
  flush();
  assert.equal(reads, 2);
  assert.equal(values.at(-1), 1);
  top = -1650;
  listeners.get('scroll')();
  flush();
  assert.equal(values.at(-1), 0.25);
  win.innerHeight = 1000 + 3300;
  listeners.get('resize')();
  flush();
  assert.equal(values.at(-1), 0.5);
  listeners.get('scroll')();
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(reads, 4);
});


test('120 whole-document steps show all holds and at least four steps per handoff', () => {
  for (const [viewport, contentHeight] of [[900, 1400], [1000, 2200], [844, 3400]]) {
    const wrapperHeight = phases.TOTAL_VH / 100 * viewport;
    const seen = [];
    const fullSteps = Array.from({ length: 6 }, () => []);
    for (let step = 0; step <= 120; step++) {
      const p = phases.getWrapperProgress(-step / 120 * (wrapperHeight + contentHeight - viewport), wrapperHeight, viewport);
      assert.ok(FEATURE_PHASES.filter((_, i) => copyAt(i, p) > 0).length <= 1);
      FEATURE_PHASES.forEach((_, index) => {
        const opacity = fadeAt(index, p);
        if (opacity > 0) {
          assert.ok(p > phases.TITLE_FOLD_END);
          assert.equal(phases.getInteractivePhase(p), index);
        }
        if (opacity === 1) {
          assert.equal(copyAt(index, p), 1);
          assert.equal(getActivePhase(p), index);
          fullSteps[index].push(step);
          if (!seen.includes(index)) seen.push(index);
        }
      });
    }
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < 6; i++) assert.ok(fullSteps[i][0] - fullSteps[i - 1].at(-1) >= 4);
  }
});

test('interaction follows the dominant scene through every handoff in either direction', () => {
  assert.equal(typeof phases.getInteractivePhase, 'function');
  for (let step = 0; step <= 10000; step++) {
    const p = step / 10000;
    const dominant = FEATURE_PHASES.findIndex((_, index) => fadeAt(index, p) > 0.5);
    if (dominant !== -1) assert.equal(phases.getInteractivePhase(p), dominant);
  }
  for (let index = 1; index < 6; index++) {
    const midpoint = getPhaseRange(index)[0];
    const samples = [midpoint - 1e-9, midpoint, midpoint + 1e-9];
    assert.deepEqual(samples.map(phases.getInteractivePhase), [index - 1, index, index]);
    assert.deepEqual(samples.reverse().map(phases.getInteractivePhase), [index, index, index - 1]);
  }
  for (const p of [-Infinity, -1, 0, NaN]) assert.equal(phases.getInteractivePhase(p), -1);
  assert.equal(phases.getInteractivePhase(OUTRO_START), 5);
  for (const p of [OUTRO_START + phases.BEAT, 1, Infinity]) assert.equal(phases.getInteractivePhase(p), 6);
  assert.match(intro, /activeIndex: getInteractivePhase\(progress\)/);
});

test('copy fades sequentially so overlapping illustrations never double-print text or buttons', () => {
  assert.equal(typeof phases.getCopyFadeStops, 'function');
  for (let index = 0; index < 6; index++) {
    const { input, output } = phases.getCopyFadeStops(index);
    assert.deepEqual(output, [0, 1, 1, 0]);
    assert.equal(copyAt(index, phases.getSceneScrollProgress(index)), 1);
    assert.ok(input.every((p, i) => !i || p > input[i - 1]));
    if (index < 5) close(phases.getCopyFadeStops(index + 1).input[0] - input[3], phases.BEAT);
  }
  for (let step = 0; step <= 10000; step++) {
    const p = step / 10000;
    const visible = FEATURE_PHASES.flatMap((_, index) => copyAt(index, p) > 0 ? [index] : []);
    assert.ok(visible.length <= 1, `Overlapping copy at ${p}`);
    if (visible.length) assert.equal(phases.getInteractivePhase(p), visible[0]);
  }
  for (const index of [-1, 6, NaN, 0.5]) assert.throws(() => phases.getCopyFadeStops(index), RangeError);
  assert.match(intro, /getCopyFadeStops\(index\)/);
  assert.match(intro, /className="home-intro-copy" style=\{\{ x, opacity: copyOpacity \}\}/);
});

test('copy and CTA ownership stay settled throughout holds and rewind symmetrically', () => {
  for (let index = 0; index < 6; index++) {
    const [start, end] = phases.getHoldRange(index);
    const samples = [start, (start + end) / 2, end];
    for (const p of [...samples, ...samples.reverse()]) {
      assert.equal(copyAt(index, p), 1);
      assert.equal(fadeAt(index, p), 1);
      assert.equal(phases.getInteractivePhase(p), index);
    }
    for (const p of [start - phases.BEAT / 2, end + phases.BEAT / 2]) {
      close(copyAt(index, p), 0.5);
      assert.equal(phases.getInteractivePhase(p), index);
    }
  }
});

test('illustrations grow during the incoming fade and reach a substantial frame at full opacity', () => {
  assert.equal(typeof phases.getIllustrationStops, 'function');
  for (let index = 0; index < 6; index++) {
    const { input, output } = phases.getIllustrationStops(index);
    const [start, end] = phases.getHoldRange(index);
    assert.deepEqual(input, [start - phases.BEAT, start, start + (end - start) * 0.8]);
    assert.deepEqual(output, [0, 0.35, 1]);
  }
  for (const index of [-1, 6, NaN, 0.5]) assert.throws(() => phases.getIllustrationStops(index), RangeError);
  assert.match(intro, /getIllustrationStops\(index\)/);
  assert.match(intro, /useTransform\(progress, illustration.input, illustration.output\)/);
});


test('layouts rotate and empty frames move only during the travel beat, reversibly', () => {
  assert.deepEqual(FEATURE_PHASES.map(p => p.layout), ['A', 'B', 'C', 'A', 'B', 'C']);
  for (let i = 0; i < 5; i++) {
    const { retract, travel, grow } = phases.getTransitionBeats(i);
    assert.equal(phases.getLayoutTravel((retract[0] + retract[1]) / 2).amount, 0);
    assert.equal(phases.getLayoutTravel((grow[0] + grow[1]) / 2).amount, 0);
    for (const fraction of [0, 0.25, 0.5, 0.75, 0.99, 0.75, 0.25, 0]) {
      const p = travel[0] + (travel[1] - travel[0]) * fraction;
      const value = phases.getLayoutTravel(p);
      assert.equal(value.from, i);
      assert.equal(value.to, i + 1);
      close(value.amount, fraction);
      assert.equal(phases.getFrameVisible(i, p), false);
      assert.equal(phases.getFrameVisible(i + 1, p), true);
    }
  }
  for (let step = 0; step <= 10000; step++) {
    const p = step / 10000;
    const count = FEATURE_PHASES.filter((_, i) => phases.getFrameVisible(i, p)).length;
    assert.equal(count, p >= phases.TITLE_FOLD_END && p < OUTRO_START + phases.BEAT ? 1 : 0);
  }
  assert.match(css, /@media \(min-width: 768px\)/);
  for (const layout of ['A', 'B', 'C']) assert.ok(css.includes(`home-intro-layout-${layout}`));
});


test('interaction press feedback eases transforms and stays instant with reduced motion', () => {
  assert.match(css, /\.home-intro-control\s*\{[^}]*transition: transform 120ms ease-out/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.home-intro-control\s*\{[^}]*transition: none/);
});

test('Controls delegates scroll state to the deferred subscription hook', async () => {
  assert.match(art, /const step = useIntroStep\(t\)/);
  assert.doesNotMatch(art, /useMotionValueEvent|setStep/);
  const step = await read('../src/components/home/useIntroStep.js');
  assert.match(step, /useEffect\(\(\) => subscribeIntroStep\(t, setStep\), \[t\]\)/);
});

test('headline utilities retain the mobile and desktop sizes without CSS overrides', () => {
  for (const source of [intro, list]) assert.match(source, /text-\[28px\] lg:text-\[40px\]/);
  for (const [, declarations] of css.matchAll(/[^{}]*\.home-intro-copy h2[^{}]*\{([^{}]*)\}/g)) {
    assert.doesNotMatch(declarations, /font-size\s*:/);
  }
  assert.doesNotMatch(css, /\.home-intro-travel/);
  assert.match(css, /\.home-intro-edge\s*\{[^}]*width: 1px;[^}]*height: 1px;/);
  assert.doesNotMatch(css.match(/\.home-intro-frame\s*\{[^}]*\}/)[0], /outline/);
});

test('compact art retains the stacked baseline origin outside desktop layout C', () => {
  assert.doesNotMatch(css, /home-intro-wide[^{}]*\{[^}]*top: 80%/);
  assert.doesNotMatch(css, /@media \(max-width: 767px\)[\s\S]*?aspect-ratio: 880 \/ 300/);
  const desktop = css.slice(css.indexOf('@media (min-width: 768px)'));
  assert.match(desktop, /\.home-intro-layout-C \.home-intro-illustration\s*\{ transform-origin: 50% 80%; \}/);
});

test('frame outlines move continuously through every hand-off beat', () => {
  const slots = FEATURE_PHASES.map((_, i) => ({
    copy: { x: i * 120, y: 300 - i * 20, width: 400 + i * 60, height: 160 },
    art: { x: 700 - i * 90, y: 120, width: 500, height: 300 + i * 10 },
  }));
  let previous = null;
  for (let step = 0; step <= 4000; step += 1) {
    const p = phases.INTRO_END + (phases.OUTRO_START - phases.INTRO_END) * step / 4000;
    assert.equal(phases.getFrameOpacity(p), 1);
    const rect = phases.getFrameRect(slots, 'copy', p);
    if (previous) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(rect[key] - previous[key]) < 2, `${key} jumps at p=${p}`);
    previous = rect;
  }
  assert.equal(phases.getFrameOpacity(0), 0);
  assert.equal(phases.getFrameOpacity(1), 0);
});


test('illustrations grow from the baseline inside the SVG, not by scaling an HTML wrapper', () => {
  // Chrome does not re-lay-out SVG text when an HTML ancestor's CSS scale changes,
  // which left labels painted at stale positions. The grow scale lives on an SVG group.
  const wrapper = intro.match(/className="home-intro-illustration" style=\{\{([^}]*)\}\}/)[1];
  assert.doesNotMatch(wrapper, /scale/);
  assert.match(intro, /<IntroIllustration[^>]*grow=\{scaleY\}/);
  assert.match(art, /<motion\.g data-intro-grow style=\{\{ transform, transformBox: 'view-box'/);
  assert.match(art, /translate\(0px, 240px\) scale\(1, \$\{scale\}\) translate\(0px, -240px\)/);
});
