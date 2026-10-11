import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
// This offline JSX harness relies on esbuild being hoisted from the installed
// Vite 6 toolchain; esbuild is not a direct project dependency. If that toolchain
// or its install layout changes, this harness must be updated with it.
import { build } from 'esbuild';
import { FEATURE_PHASES, getActivePhase, getFadeStops } from '../src/components/home/introPhases.js';
import * as phases from '../src/components/home/introPhases.js';

// Use the existing Vite toolchain to exercise real JSX without a browser,
// network, or an additional DOM/test dependency.
const directory = await mkdtemp(join(tmpdir(), 'atlas-intro-render-'));
let render;
try {
  const outfile = join(directory, 'render.cjs');
  await build({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { MemoryRouter } from 'react-router-dom';
        import { motionValue } from 'motion/react';
        import Home from './src/pages/Home.jsx';
        import HomeScrollIntro, { Scene } from './src/components/home/HomeScrollIntro.jsx';
        import IntroSceneList from './src/components/home/IntroSceneList.jsx';
        import IntroCta from './src/components/home/IntroCta.jsx';
        import useIntroProgress from './src/components/home/useIntroProgress.js';
        import IntroIllustration from './src/components/home/IntroIllustrations.jsx';
        export const home = () => renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>);
        export const intro = () => renderToStaticMarkup(<MemoryRouter><HomeScrollIntro /></MemoryRouter>);
        export const list = () => renderToStaticMarkup(<MemoryRouter><IntroSceneList /></MemoryRouter>);
        export const cta = props => IntroCta(props);
        export const progressHook = wrapper => {
          let result;
          function Probe() { result = useIntroProgress({ current: wrapper }); return null; }
          renderToStaticMarkup(<Probe />);
          return result;
        };
        export const art = (scene, progress) => renderToStaticMarkup(<IntroIllustration scene={scene} t={motionValue(progress)} />);
        export const scene = (phase, index, progress, activeIndex) => renderToStaticMarkup(
          <MemoryRouter><Scene phase={phase} index={index} progress={motionValue(progress)} activeIndex={activeIndex} scrollToScene={() => {}} /></MemoryRouter>
        );
      `,
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
      loader: 'jsx',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    logLevel: 'silent',
    plugins: [{
      name: 'expose-scene-for-render-tests',
      setup(builder) {
        builder.onLoad({ filter: /HomeScrollIntro\.jsx$/ }, async ({ path }) => ({
          contents: `${await readFile(path, 'utf8')}\nexport { Scene };`,
          loader: 'jsx',
        }));
      },
    }],
  });
  render = createRequire(import.meta.url)(outfile);
} finally {
  await rm(directory, { recursive: true, force: true });
}

const unescape = text => text.replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

for (const mode of ['intro', 'list']) {
  test(`${mode} renders six accessible scenes with exact real links and copy`, () => {
    const html = unescape(render[mode]());
    const scenes = [...html.matchAll(/data-intro-scene="([^"]+)"/g)];
    assert.deepEqual(scenes.map(match => match[1]), FEATURE_PHASES.map(phase => phase.key));
    assert.equal([...html.matchAll(/data-intro-cta="true"/g)].length, 6);
    for (const [index, phase] of FEATURE_PHASES.entries()) {
      const block = html.slice(scenes[index].index, scenes[index + 1]?.index);
      assert.ok(block.includes(phase.title));
      assert.ok(block.includes(phase.description));
      assert.match(block, new RegExp(`<a[^>]+href="${phase.route}"[^>]*>${phase.cta}</a>`));
      assert.doesNotMatch(block, /tabindex="-1"/);
      assert.match(block, /<svg[^>]+aria-hidden="true"/);
    }
    if (mode === 'list') {
      assert.equal([...html.matchAll(/home-intro-cta--static/g)].length, 6);
      assert.doesNotMatch(html, /is-active|position:fixed|position:sticky/);
    } else {
      assert.equal([...html.matchAll(/<button /g)].length, 6);
      assert.equal([...html.matchAll(/aria-label="(?:Portfolio Management|Stock Data Explorer|AI Market Analysis|Personal AI Advisor|User Profile|Market Insights)"/g)].length, 6);
    }
  });
}

test('server/reduced-motion home contains the title, final frames and unchanged grid after the list', () => {
  const html = render.home();
  assert.equal([...html.matchAll(/data-home-intro="true"/g)].length, 1);
  assert.equal([...html.matchAll(/data-intro-title="true"/g)].length, 1);
  assert.equal([...html.matchAll(/data-intro-scene=/g)].length, 6);
  assert.ok(html.indexOf('data-intro-scene="insights"') < html.indexOf('<h3'));
  assert.doesNotMatch(html, /home-intro-stage|760vh/);
});

test('portfolio values, paths and final insight are scroll-derived and reversible', () => {
  const start = render.art('portfolio', 0);
  const end = render.art('portfolio', 1);
  assert.match(start, />\$0</);
  for (const value of ['$128,450', '$46,280', '$24,760']) assert.ok(end.includes(value));
  assert.match(end, /Largest holding: NVDA, 18%/);
  assert.match(start, /pathLength="1"/);
  assert.match(start, /stroke-dasharray="0 1"/);
  assert.match(end, /stroke-dasharray="1 1"/);
  assert.equal(render.art('portfolio', 0), start);
});

test('candles and volume grow on opposite sides, and OHLC updates at sample boundaries', () => {
  const start = render.art('stock-data', 0);
  const end = render.art('stock-data', 1);
  assert.match(start, /O 182   H 187   L 180   C 185/);
  assert.match(end, /O 205   H 211   L 203   C 209/);
  assert.match(start, /scaleY\(0\)/);
  assert.match(end, /y="240"[^>]+fill-opacity="0.16"/);
  assert.match(start, /opacity="1"[^>]*><rect x="335"/);
  assert.match(end, /opacity="1"[^>]*><rect x="449"/);
  assert.equal(render.art('stock-data', 0), start);
});

test('AI field renders exactly 1000 deterministic dots in three layers and resolves the shortlist', () => {
  const html = render.art('ai-analysis', 1);
  assert.equal([...html.matchAll(/width="3" height="3"/g)].length, 1000);
  assert.equal([...html.matchAll(/<g fill="rgba\(245,245,242,/g)].length, 3);
  assert.match(html, /1,000 stocks analysed/);
  assert.equal([...html.matchAll(/<use /g)].length, 2);
  assert.match(html, /<use[^>]+opacity="0.12"/);
  assert.match(render.art('ai-analysis', 0), /0 stocks analysed/);
  for (const ticker of ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']) assert.ok(html.includes(ticker));
  for (const risk of ['Low risk', 'Medium risk', 'High risk']) assert.ok(html.includes(risk));
  assert.doesNotMatch(html, /#9FB7FF|#5FBF93|#E07A6A/);
});

test('advisor typing and evidence bars resolve, and profile finishes with selected goals and EUR', () => {
  const start = render.art('advisor', 0);
  const end = render.art('advisor', 1);
  assert.equal([...start.matchAll(/<tspan opacity="0"/g)].length, 'How does AAPL fit my portfolio?'.length);
  assert.equal([...end.matchAll(/<tspan opacity="1"/g)].length, 'How does AAPL fit my portfolio?'.length);
  assert.equal([...end.matchAll(/Pro ·/g)].length, 2);
  assert.equal([...end.matchAll(/Con ·/g)].length, 2);
  const profile = render.art('profile', 1);
  for (const label of ['Retirement', 'House', 'Education']) assert.ok(profile.includes(label));
  assert.match(profile, /opacity="0"[^>]*>USD/);
  assert.match(profile, /opacity="1"[^>]*>EUR/);
  assert.match(profile, /translateX\(498px\)/);
});

test('insights has three positive and three negative chart bars and a typed factual explanation', () => {
  const start = render.art('insights', 0);
  const end = render.art('insights', 1);
  assert.equal([...end.matchAll(/<rect[^>]+fill="#5FBF93"/g)].length, 3);
  assert.equal([...end.matchAll(/<rect[^>]+fill="#E07A6A"/g)].length, 3);
  assert.match(start, /scaleY\(0\)/);
  assert.doesNotMatch(end, /scaleY\(0\)/);
  const typed = [...end.matchAll(/<tspan opacity="1">([^<]*)<\/tspan>/g)].map(match => match[1]).join('');
  assert.equal(typed, 'NVDA rose 4.8% in this sample session, leading the group.');
  assert.equal(render.art('insights', 0), start);
  assert.equal(render.art('unknown', 1), '');
});


test('rendered SVG bars grow from the shared baseline, including Motion-generated origins', () => {
  const stock = render.art('stock-data', 0.2);
  assert.equal([...stock.matchAll(/transform-origin:50% 100%/g)].length, 12);
  assert.equal([...stock.matchAll(/transform-origin:50% 0%/g)].length, 12);
  const insights = render.art('insights', 0.2);
  assert.equal([...insights.matchAll(/<rect[^>]+fill="#5FBF93"[^>]+transform-origin:50% 100%/g)].length, 3);
  assert.equal([...insights.matchAll(/<rect[^>]+fill="#E07A6A"[^>]+transform-origin:50% 0%/g)].length, 3);
});


test('focusing an inactive CTA scrolls to its own scene, while active and static CTAs keep position', () => {
  const calls = [];
  FEATURE_PHASES.forEach((phase, index) => {
    const inactive = render.cta({ phase, index, active: false, scrollToScene: value => calls.push(value) });
    inactive.props.onFocus();
    assert.equal(inactive.props.to, phase.route);
    assert.match(inactive.props.className, /pointer-events-none/);
    assert.doesNotMatch(inactive.props.className, /is-active/);
    const active = render.cta({ phase, index, active: true, scrollToScene: () => assert.fail('Already active') });
    active.props.onFocus();
    assert.match(active.props.className, /is-active/);
    assert.match(active.props.className, /pointer-events-auto/);
    const stationary = render.cta({ phase, index, variant: 'static' });
    stationary.props.onFocus();
    assert.match(stationary.props.className, /home-intro-cta--static/);
    assert.doesNotMatch(stationary.props.className, /is-active/);
  });
  assert.deepEqual(calls, [0, 1, 2, 3, 4, 5]);
});

test('only the dominant scene renders a clickable, pulsing CTA, including partial fades', () => {
  assert.equal(typeof phases.getInteractivePhase, 'function');
  const samples = Array.from({ length: 61 }, (_, step) => step / 60);
  for (let index = 1; index < 6; index++) {
    const start = phases.getPhaseRange(index)[0];
    for (const fraction of [0.9, 0.51, 0.5, 0.49, 0.1]) samples.push(start - phases.CROSSFADE * fraction);
  }
  for (const p of samples) {
    const activeIndex = phases.getInteractivePhase(p);
    const clickable = [];
    FEATURE_PHASES.forEach((phase, index) => {
      const html = render.scene(phase, index, p, activeIndex);
      const link = html.match(/<a[^>]+data-intro-cta[^>]+>/)?.[0];
      assert.ok(link);
      if (index === activeIndex) {
        assert.match(link, /pointer-events-auto/);
        assert.match(link, /is-active/);
        clickable.push(index);
      } else {
        assert.match(link, /pointer-events-none/);
        assert.doesNotMatch(link, /is-active/);
      }
    });
    assert.deepEqual(clickable, activeIndex >= 0 && activeIndex < 6 ? [activeIndex] : []);
  }
});

test('rendered handoffs separate the copy and advance the artwork before the full-opacity hold', () => {
  for (let index = 0; index < 6; index++) {
    const start = phases.getPhaseRange(index)[0];
    const arriving = start - phases.CROSSFADE * 0.25;
    const html = render.scene(FEATURE_PHASES[index], index, arriving, index);
    const copyOpacity = Number(html.match(/class="home-intro-copy" style="[^"]*opacity:([\d.e-]+)/)?.[1]);
    assert.ok(Math.abs(copyOpacity - 1) < 1e-12, `Incoming copy opacity: ${copyOpacity}`);
    if (index > 0) {
      const outgoing = render.scene(FEATURE_PHASES[index - 1], index - 1, arriving, index);
      assert.match(outgoing, /class="home-intro-copy" style="[^"]*opacity:0(?:;|")/);
    }
    const full = render.scene(FEATURE_PHASES[index], index, start, index);
    if (index === 0) assert.match(full, />\$112,394</);
    if (index === 1) assert.match(full, /O 192   H 195   L 186   C 188/);
    if (index === 2) assert.match(full, />500 stocks analysed</);
    if (index === 3) assert.ok([...full.matchAll(/<tspan opacity="1"/g)].length >= 25);
    if (index === 4) {
      const handleX = Number(full.match(/<circle[^>]+translateX\(([\d.]+)px\)/)?.[1]);
      assert.ok(Math.abs(handleX - 230.25) < 1e-12, `Slider position: ${handleX}`);
    }
    if (index === 5) assert.match(full, /<rect[^>]+fill="#5FBF93"[^>]+transform:none/);
  }
});

test('rendered CTAs inherit no extra fading or displacement while their scene is nearly opaque', () => {
  for (const [index, phase] of FEATURE_PHASES.entries()) {
    const [start, end] = phases.getPhaseRange(index);
    for (const opacity of [0.9, 0.95, 1]) {
      for (const p of [start - (1 - opacity) * phases.CROSSFADE, end - opacity * phases.CROSSFADE]) {
        const html = render.scene(phase, index, p, phases.getInteractivePhase(p));
        const sceneOpacity = Number(html.match(/data-intro-scene="[^"]+"[^>]+style="opacity:([\d.e-]+)/)?.[1]);
        const copyStyle = html.match(/class="home-intro-copy" style="([^"]+)"/)?.[1];
        const copyOpacity = Number(copyStyle?.match(/opacity:([\d.e-]+)/)?.[1]);
        assert.ok(Math.abs(sceneOpacity - opacity) < 1e-12);
        assert.equal(copyOpacity, 1, `${phase.key} CTA must not lag its scene`);
        assert.ok(sceneOpacity * copyOpacity >= sceneOpacity);
        assert.match(copyStyle, /transform:none/);
        assert.match(html, /<a[^>]+data-intro-cta[^>]+pointer-events-auto/);
      }
    }
  }
});

test('scrollToScene uses the wrapper document position and viewport, with a safe unmounted ref', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    innerHeight: 1000, scrollY: 400,
    scrollTo: value => calls.push(value),
  } });
  try {
    const wrapper = { getBoundingClientRect: () => ({ top: -275, height: 7600 }) };
    const { progress, scrollToScene } = render.progressHook(wrapper);
    assert.equal(progress.get(), 0);
    FEATURE_PHASES.forEach((_, index) => scrollToScene(index));
    assert.equal(calls.length, 6);
    calls.forEach(({ top, behavior }, index) => {
      const p = (top - 125) / 6600;
      assert.equal(getActivePhase(p), index);
      const { input } = getFadeStops(index);
      assert.ok(p >= input[1] && p <= input[2]);
      assert.equal(behavior, 'instant');
    });
    assert.throws(() => scrollToScene(6), RangeError);
    render.progressHook(null).scrollToScene(0);
    assert.equal(calls.length, 6);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
});
