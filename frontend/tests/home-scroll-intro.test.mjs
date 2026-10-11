import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  INTRO_END, OUTRO_START, CROSSFADE, FEATURE_PHASES,
  getPhaseRange, getActivePhase, getLocalProgress, getFadeStops,
} from '../src/components/home/introPhases.js';
import { getReducedMotion, getServerReducedMotion, subscribeReducedMotion } from '../src/components/home/reducedMotion.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const home = await read('../src/pages/Home.jsx');
const intro = await read('../src/components/home/HomeScrollIntro.jsx');
const css = await read('../src/components/home/homeIntro.css');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≈ ${expected}`);

function fadeAt(index, progress) {
  const { input, output } = getFadeStops(index);
  if (progress <= input[0] || progress >= input[3]) return 0;
  const stop = input.findIndex((value) => value > progress);
  const ratio = (progress - input[stop - 1]) / (input[stop] - input[stop - 1]);
  return output[stop - 1] + ratio * (output[stop] - output[stop - 1]);
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
  assert.match(intro, /FEATURE_PHASES\.map\(\(phase, index\) => <PhaseMarker/);
  assert.match(intro, /getLocalProgress\(p, index\)/);
  assert.match(intro, /FEATURE_PHASES\[activeIndex\]\?\.title/);
});

test('phase ranges cover the middle 80% contiguously and reject invalid indices', () => {
  assert.equal(getPhaseRange(0)[0], INTRO_END);
  assert.equal(getPhaseRange(5)[1], OUTRO_START);
  for (let i = 0; i < 6; i++) {
    const [start, end] = getPhaseRange(i);
    close(end - start, (OUTRO_START - INTRO_END) / 6);
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
  for (const p of [0.9, 1, 2, Infinity]) assert.equal(getActivePhase(p), 6);
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

test('vignettes cross-fade without gaps and clear before the wrapper ends', () => {
  for (let i = 0; i < 6; i++) {
    const { input, output } = getFadeStops(i);
    assert.deepEqual(output, [0, 1, 1, 0]);
    assert.ok(input.every((p, j) => p >= 0 && p <= 1 && (!j || p > input[j - 1])));
    assert.equal(fadeAt(i, 0), 0);
    assert.equal(fadeAt(i, 1), 0);
    if (i < 5) {
      const boundary = getPhaseRange(i)[1];
      for (const p of [boundary - CROSSFADE, boundary, boundary + CROSSFADE]) {
        close(fadeAt(i, p) + fadeAt(i + 1, p), 1);
      }
    }
  }
  assert.ok(getFadeStops(0).input[0] < INTRO_END);
  assert.ok(getFadeStops(5).input[3] < 1);
});

test('wrapper progress scrubs ordered scenes and parks the stage at completion', () => {
  assert.match(intro, /useScroll\(\{ target: wrapperRef, offset: \['start start', 'end end'\] \}\)/);
  assert.match(intro, /h-\[300vh\]/);
  assert.match(intro, /pinned: progress < 1/);
  assert.match(intro, /stage\.pinned \? 'fixed inset-x-0 top-0 z-10' : 'absolute inset-x-0 bottom-0'/);
  const scenes = ['Portfolio', 'StockData', 'AIAnalysis', 'Advisor', 'Profile', 'Insights'];
  let last = -1;
  scenes.forEach((name, index) => {
    const position = intro.indexOf(`<${name}Vignette progress={scrollYProgress}`);
    assert.ok(position > last);
    last = position;
    assert.match(intro, new RegExp(`getPhaseRange\\(${index}\\)`));
  });
  assert.match(intro, /next\.activeIndex !== previous\.current\.activeIndex \|\| next\.pinned !== previous\.current\.pinned/);
  assert.match(intro, /pointer-events-none/);
});

test('each feature includes its scroll-driven visual behavior', () => {
  for (const visual of ['HoldingSlice', 'Candle', 'NetworkNode', 'NetworkEdge', 'TypedLetter', 'ProfileChip', 'HeatTile']) {
    assert.match(intro, new RegExp(`function ${visual}\\(`));
    assert.match(intro, new RegExp(`<${visual} `));
  }
  assert.match(intro, /strokeDasharray="77 351"/); // Donut slices
  assert.match(intro, /motion\.path[^\n]+style=\{\{ pathLength \}\}/);
  assert.match(intro, /motion\.g style=\{\{ scaleY/);
  assert.match(intro, /motion\.path d="M0 35V235" style=\{\{ x \}\}/); // Crosshair
  assert.match(intro, /layer \* 0\.23/); // Neural wave stagger
  assert.match(intro, /ADVICE\.split\(''\)/);
  assert.match(intro, /motion\.circle[^\n]+style=\{\{ pathLength \}\}/); // Profile ring
  assert.match(intro, /\[0, 180, 180, 360\]/); // Heatmap flips both ways
  assert.match(css, /backface-visibility: hidden/);
  assert.doesNotMatch(intro, /animate=|setInterval|setTimeout|Math\.random/);
});

for (const [component, origin] of [
  ['HoldingSlice', '50% 50%'],
  ['Candle', '50% 100%'],
  ['NetworkNode', '50% 50%'],
]) {
  test(`${component} transforms around its own ${origin === '50% 100%' ? 'base' : 'center'}`, () => {
    const body = intro.match(new RegExp(`function ${component}\\([\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(body, `${component} exists`);
    assert.ok(body.includes(`transformOrigin: '${origin}'`));
    assert.doesNotMatch(body, /transformBox:/); // Percentages use Motion's default fill-box.
  });
}

test('SVG motion elements never interpret pixel origins relative to the default fill-box', () => {
  const svgStyles = [...intro.matchAll(/<motion\.(?:circle|g|path|rect|svg)\b[^\n]*?style=\{\{([^\n]*?)\}\}/g)];
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
  assert.equal(origins, 3);
});

test('reduced motion renders a static, responsive hero outside the pinned sequence', () => {
  assert.match(home, /useSyncExternalStore\(subscribeReducedMotion, getReducedMotion, getServerReducedMotion\)/);
  const fallback = home.match(/reduceMotion !== false \? \(([\s\S]*?)\) : <HomeScrollIntro \/>/)?.[1];
  assert.ok(fallback);
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

test('Motion owns scroll subscription cleanup; no manual listeners or frame layout reads', () => {
  assert.match(intro, /useMotionValueEvent\(scrollYProgress, 'change'/);
  assert.doesNotMatch(intro, /addEventListener|requestAnimationFrame|getBoundingClientRect|offsetTop|offsetHeight|preventDefault/);
  assert.doesNotMatch(intro, /style=\{\{[^}]*\b(?:width|height|top|left):/);
});

test('mobile art fits its container and ticker overflow stays inside the stage', () => {
  assert.match(css, /width: min\(100%, 38rem\)/);
  assert.match(css, /height: 100svh/);
  assert.match(intro, /home-intro-stage w-full overflow-hidden/);
  assert.match(intro, /overflow-hidden border-y/);
  assert.doesNotMatch(intro + css, /100vw|w-screen|min-w-\[/);
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
