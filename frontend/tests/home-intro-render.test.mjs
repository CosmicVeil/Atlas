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
import { INITIAL_STATE } from '../src/components/home/introInteractions.js';

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
        import HomeScrollIntro, { Scene, TravelFrames } from './src/components/home/HomeScrollIntro.jsx';
        import IntroSceneList from './src/components/home/IntroSceneList.jsx';
        import IntroCta from './src/components/home/IntroCta.jsx';
        import useIntroProgress from './src/components/home/useIntroProgress.js';
        import IntroIllustration, { Controls } from './src/components/home/IntroIllustrations.jsx';
        import { getCtaSpec } from './src/components/home/ctaSpec.js';
        export const home = () => renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>);
        export const intro = () => renderToStaticMarkup(<MemoryRouter><HomeScrollIntro /></MemoryRouter>);
        export const list = () => renderToStaticMarkup(<MemoryRouter><IntroSceneList /></MemoryRouter>);
        export const cta = props => IntroCta(props);
        export const ctaSpec = (...args) => getCtaSpec(...args);
        export const progressHook = wrapper => {
          let result;
          function Probe() { result = useIntroProgress({ current: wrapper }); return null; }
          renderToStaticMarkup(<Probe />);
          return result;
        };
        export const artWith = (scene, progress, state, active = true) => renderToStaticMarkup(<IntroIllustration scene={scene} t={motionValue(progress)} state={state} active={active} onAction={() => {}} reduced />);
        export const responsiveArt = (scene, width, reduced = false) => {
          globalThis.window = { matchMedia: () => ({ matches: width >= 768 }), addEventListener() {}, removeEventListener() {} };
          try { return renderToStaticMarkup(<IntroIllustration scene={scene} t={motionValue(1)} reduced={reduced} />); }
          finally { delete globalThis.window; }
        };
        export const art = (scene, progress) => renderToStaticMarkup(<IntroIllustration scene={scene} t={motionValue(progress)} />);
        export const illustrationProps = props => {
          let result;
          function Probe() { result = IntroIllustration({ scene: 'portfolio', t: motionValue(1), ...props }); return null; }
          renderToStaticMarkup(<Probe />);
          return result.props;
        };
        export const controls = props => {
          let result;
          function Probe() { result = Controls({ t: motionValue(1), active: true, ...props }); return null; }
          renderToStaticMarkup(<Probe />);
          const flatten = nodes => React.Children.toArray(nodes).flatMap(node => node.type === React.Fragment ? flatten(node.props.children) : [node.props]);
          return flatten(result);
        };
        export const frames = (progress, slots) => renderToStaticMarkup(<TravelFrames progress={motionValue(progress)} geometry={motionValue(slots)} />);
        export const scene = (phase, index, progress, activeIndex, slots = []) => renderToStaticMarkup(
          <MemoryRouter><Scene phase={phase} index={index} progress={motionValue(progress)} activeIndex={activeIndex} geometry={motionValue(slots)} scrollToScene={() => {}} /></MemoryRouter>
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
          contents: `${await readFile(path, 'utf8')}\nexport { Scene, TravelFrames };`,
          loader: 'jsx',
        }));
        builder.onLoad({ filter: /IntroIllustrations\.jsx$/ }, async ({ path }) => ({
          contents: `${await readFile(path, 'utf8')}\nexport { Controls };`,
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
      // The only element outside the tab order is the beacon, which repeats the labelled link.
      for (const [tag] of block.matchAll(/<[^>]+tabindex="-1"[^>]*>/g)) {
        assert.match(tag, /data-intro-beacon/);
        assert.match(tag, /aria-hidden="true"/);
        assert.match(tag, new RegExp(`href="${phase.route}"`));
      }
      assert.equal([...block.matchAll(/data-intro-beacon/g)].length, 1);
      assert.equal([...block.matchAll(/data-intro-cta-mark/g)].length, 1);
      assert.match(block, /<svg[^>]+aria-hidden="true"/);
    }
    if (mode === 'list') {
      assert.equal([...html.matchAll(/home-intro-cta--static/g)].length, 6);
      assert.doesNotMatch(html, /is-active|position:fixed|position:sticky/);
    } else {
      assert.equal([...html.matchAll(/<button [^>]*>/g)].filter(([tag]) => !tag.includes('data-intro-interactive')).length, 6);
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
    for (const [start, end] of Object.values(phases.getTransitionBeats(index - 1))) {
      for (const fraction of [0.1, 0.49, 0.5, 0.51, 0.9]) samples.push(start + (end - start) * fraction);
    }
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
    const start = phases.getHoldRange(index)[0];
    const arriving = start - phases.BEAT;
    const html = render.scene(FEATURE_PHASES[index], index, arriving, index);
    const copyOpacity = Number(html.match(/class="home-intro-copy" style="[^"]*opacity:([\d.e-]+)/)?.[1]);
    assert.ok(Math.abs(copyOpacity) < 1e-12, `Incoming copy opacity: ${copyOpacity}`);
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

test('rendered copy and CTAs are settled and clickable throughout the hold', () => {
  for (const [index, phase] of FEATURE_PHASES.entries()) {
    const [start, end] = phases.getHoldRange(index);
    for (const p of [start, (start + end) / 2, end]) {
      const html = render.scene(phase, index, p, phases.getInteractivePhase(p));
      const copyStyle = html.match(/class="home-intro-copy" style="([^"]+)"/)?.[1];
      assert.equal(Number(copyStyle?.match(/opacity:([\d.e-]+)/)?.[1]), 1);
      assert.match(copyStyle, /transform:none/);
      assert.match(html, /<a[^>]+data-intro-cta[^>]+pointer-events-auto/);
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


for (const mode of ['intro', 'list']) {
  test(`${mode} exposes copy, heading, art and keyboard interaction contracts for every scene`, () => {
    const html = render[mode]();
    const scenes = [...html.matchAll(/data-intro-scene="([^"]+)"/g)];
    if (mode === 'intro') assert.deepEqual([...html.matchAll(/data-intro-layout="([^"]+)"/g)].map(m => m[1]), ['A', 'B', 'C', 'A', 'B', 'C']);
    for (const [i, scene] of scenes.entries()) {
      const block = html.slice(scene.index, scenes[i + 1]?.index);
      for (const attr of ['copy', 'heading', 'art']) assert.equal([...block.matchAll(new RegExp(`data-intro-${attr}="true"`, 'g'))].length, 1);
      assert.ok(block.indexOf('data-intro-copy') < block.indexOf('data-intro-cta'));
      const controls = [...block.matchAll(/<(?:button|div)[^>]*data-intro-interactive[^>]*>/g)];
      assert.ok(controls.length >= 2, scene[1]);
      for (const [control] of controls) {
        assert.doesNotMatch(control, /href=/);
        assert.match(control, /aria-label=/);
        if (control.includes('role="slider"')) {
          assert.match(control, /aria-valuenow="[\d.]+"/);
          assert.match(control, /tabindex="0"/);
        } else assert.match(control, /type="button"/);
      }
    }
  });
}

test('only the active scene enables illustration pointer events', () => {
  for (const [index, phase] of FEATURE_PHASES.entries()) {
    for (const active of [true, false]) {
      const html = render.scene(phase, index, phases.getSceneScrollProgress(index), active ? index : -1);
      const controls = [...html.matchAll(/<(?:button|div)[^>]*data-intro-interactive[^>]*>/g)];
      assert.ok(controls.length >= 2);
      for (const [control] of controls) assert.ok(control.includes(active ? 'pointer-events-auto' : 'pointer-events-none'));
    }
  }
});

test('each first interaction visibly changes the illustration, including at hold entry', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  const cases = [
    ['portfolio', { type: 'select', index: 0 }, /Retirement value · \$128,450/],
    ['stock-data', { type: 'timeframe', value: '1D' }, /aria-label="1D"[^>]*aria-pressed="true"/],
    ['ai-analysis', { type: 'pin', index: 0 }, /Pinned · AAPL/],
    ['advisor', { type: 'question', index: 0 }, /Technology represents 42%/],
    ['profile', { type: 'goal', index: 0, current: true }, /aria-label="Retirement"[^>]*aria-pressed="false"/],
    ['insights', { type: 'bar', index: 0 }, /XOM · −2.6%/],
  ];
  for (const [scene, action, expected] of cases) {
    const state = reduceInteraction(scene, INITIAL_STATE[scene], action);
    assert.notDeepEqual(state, INITIAL_STATE[scene]);
    for (const progress of [0.35, 1]) {
      const before = render.artWith(scene, progress, INITIAL_STATE[scene]);
      const after = unescape(render.artWith(scene, progress, state));
      assert.notEqual(after, before, scene);
      assert.match(after, expected);
    }
  }
  const profile = reduceInteraction('profile', INITIAL_STATE.profile, { type: 'currency', value: 'GBP' });
  assert.match(render.artWith('profile', 0.35, profile), /£100,191/);
});

test('interaction overrides redraw paths, show notes, highlight rows and reveal explanations', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  const art = (scene, action) => render.artWith(scene, 0.35, reduceInteraction(scene, INITIAL_STATE[scene], action));
  const totalLine = render.artWith('portfolio', 1, INITIAL_STATE.portfolio).match(/<path d="M12 240[^>]+/)?.[0];
  assert.ok(totalLine);
  assert.ok(!art('portfolio', { type: 'select', index: 1 }).includes(totalLine));
  assert.match(art('portfolio', { type: 'hover', index: 0 }), /\+5.2% since last month/);
  assert.match(art('stock-data', { type: 'crosshair', value: 1 }), /O 205   H 211   L 203   C 209/);
  assert.match(art('ai-analysis', { type: 'note', index: 0 }), /Lower sample price variability/);
  assert.match(art('profile', { type: 'risk', value: 100 }), /aria-valuenow="100"/);
  assert.match(art('insights', { type: 'bar', index: 1 }), /CVX · −1.8%/);
});

test('every selected timeframe keeps candle prices below the chips and above the baseline', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  for (const timeframe of ['1D', '1M', '1Y']) {
    const state = reduceInteraction('stock-data', INITIAL_STATE['stock-data'], { type: 'timeframe', value: timeframe });
    const html = render.artWith('stock-data', 1, state);
    const wicks = [...html.matchAll(/<path d="M[\d.]+ ([\d.-]+)V([\d.-]+)"[^>]*stroke-opacity="0.55"/g)];
    assert.equal(wicks.length, 12);
    for (const [, high, low] of wicks) {
      assert.ok(Number(high) >= 70, `${timeframe} high ${high} overlaps the chart header`);
      assert.ok(Number(low) <= 230, `${timeframe} low ${low} crosses the baseline`);
      assert.ok(Number(high) < Number(low));
    }
  }
});

test('actual buttons dispatch each scene interaction and render its result', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  const cases = [
    ['portfolio', 'Retirement', /Retirement value · \$128,450/],
    ['stock-data', '1D', /aria-label="1D"[^>]*aria-pressed="true"/],
    ['ai-analysis', 'Explore sample stock field; use arrow keys', /Pinned · AAPL/],
    ['advisor', 'How concentrated is this portfolio?', /Technology represents 42%/],
    ['profile', 'Retirement', /aria-label="Retirement"[^>]*aria-pressed="false"/],
    ['insights', 'XOM session explanation', /XOM · −2.6%/],
  ];
  for (const [scene, label, expected] of cases) {
    let state = INITIAL_STATE[scene];
    const controls = render.controls({ scene, state, onAction: action => { state = reduceInteraction(scene, state, action); } });
    const button = controls.find(control => control['aria-label'] === label);
    button.onClick({ detail: 0, clientX: 0, clientY: 0, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } });
    assert.match(unescape(render.artWith(scene, 1, state)), expected);
  }
});

test('risk slider handles keyboard, drag capture, cancellation and unrelated pointers', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  let state = { ...INITIAL_STATE.profile, risk: 50 };
  const slider = () => render.controls({ scene: 'profile', state, onAction: action => { state = reduceInteraction('profile', state, action); } }).find(control => control.role === 'slider');
  let prevented = 0;
  slider().onKeyDown({ key: 'ArrowRight', preventDefault: () => prevented++ });
  assert.equal(state.risk, 60);
  slider().onKeyDown({ key: 'Home', preventDefault: () => prevented++ });
  assert.equal(state.risk, 0);
  slider().onKeyDown({ key: 'End', preventDefault: () => prevented++ });
  assert.equal(state.risk, 100);
  slider().onKeyDown({ key: 'Tab', preventDefault: () => prevented++ });
  assert.equal(prevented, 3);

  const target = {
    getBoundingClientRect: () => ({ left: 100, top: 0, width: 200, height: 40 }),
    setPointerCapture: id => { assert.equal(id, 7); },
    releasePointerCapture: id => { assert.equal(id, 7); },
  };
  const control = slider();
  const event = (clientX, pointerId = 7) => ({ clientX, clientY: 20, pointerId, isPrimary: true, currentTarget: target });
  control.onPointerDown({ ...event(150), isPrimary: false });
  assert.equal(state.risk, 100);
  control.onPointerDown(event(150));
  assert.equal(state.risk, 25);
  control.onPointerMove(event(250, 8));
  assert.equal(state.risk, 25);
  control.onPointerMove(event(250));
  assert.equal(state.risk, 75);
  control.onPointerCancel();
  control.onPointerMove(event(300));
  assert.equal(state.risk, 75);
  control.onPointerDown(event(200));
  control.onPointerUp(event(200));
  control.onPointerMove(event(300));
  assert.equal(state.risk, 50);
  control.onPointerDown(event(150));
  control.onLostPointerCapture();
  control.onPointerMove(event(300));
  assert.equal(state.risk, 25);
});


test('desktop scroll samples expose only the current scene, with measured layout geometry', async () => {
  const { subscribeIntroProgress } = await import('../src/components/home/useIntroProgress.js');
  const slots = FEATURE_PHASES.map(({ layout }) => ({
    copy: { x: layout === 'B' ? 716 : 112, y: layout === 'C' ? 544 : 160, width: layout === 'C' ? 1120 : 460, height: 208 },
    art: { x: layout === 'A' ? 691 : 112, y: 160, width: layout === 'C' ? 880 : 500, height: 340 },
    baseline: { x: 112, y: layout === 'C' ? 464 : 400, width: 1120, height: 1 },
  }));
  let top = 0;
  let progress = 0;
  let pending;
  const listeners = new Map();
  const win = {
    innerHeight: 800,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    requestAnimationFrame: callback => { pending = callback; return 1; },
    cancelAnimationFrame: () => { pending = undefined; },
  };
  const cleanup = subscribeIntroProgress({ getBoundingClientRect: () => ({ top, height: 8560 }) }, { set: p => { progress = p; } }, win);
  const holds = FEATURE_PHASES.map((_, i) => phases.getSceneScrollProgress(i));
  for (const p of [0, ...holds, 1, ...holds.toReversed(), 0]) {
    top = -p * (8560 - 800);
    listeners.get('scroll')();
    pending();
    const owner = phases.getInteractivePhase(progress);
    FEATURE_PHASES.forEach((phase, index) => {
      const html = render.scene(phase, index, progress, owner, slots);
      const shell = html.match(/<[^>]+data-intro-scene=[^>]+>/)?.[0];
      assert.ok(shell);
      assert.match(shell, new RegExp(`opacity:${index === owner ? 1 : 0}(?:;|")`), `${phase.key} at ${p}`);
      if (index === owner) {
        assert.match(html, /class="home-intro-copy" style="[^"]*opacity:1/);
        assert.match(html, /<a[^>]+data-intro-cta[^>]+pointer-events-auto/);
        assert.match(html, /data-intro-interactive[^>]+pointer-events-auto/);
      }
    });
  }
  cleanup();
  assert.equal(listeners.size, 0);
});

test('empty frames stay on screen and glide between measured slots while scene content is hidden', () => {
  const slots = FEATURE_PHASES.map((_, i) => ({
    copy: { x: 100 + i * 100, y: 200 + i * 50, width: 400, height: 200 },
    art: { x: 600 - i * 50, y: 200, width: 500 + i * 20, height: 300 },
    baseline: { x: 0, y: 400, width: 1000, height: 1 },
  }));
  for (let i = 1; i < 6; i++) {
    const { retract, travel, grow } = phases.getTransitionBeats(i - 1);
    const middle = (travel[0] + travel[1]) / 2;
    assert.match(render.scene(FEATURE_PHASES[i], i, middle, phases.getInteractivePhase(middle), slots), /data-intro-scene=[^>]+opacity:0/);
    // One persistent set of frames, fully visible through every beat of the hand-off.
    for (const p of [(retract[0] + retract[1]) / 2, middle, (grow[0] + grow[1]) / 2]) {
      const html = render.frames(p, slots);
      assert.match(html, /class="home-intro-frames" style="opacity:1"/);
      assert.equal([...html.matchAll(/data-intro-travel-frame="(copy|art)"/g)].length, 2);
      assert.equal([...html.matchAll(/class="home-intro-edge"/g)].length, 8);
    }
    // Mid-travel the copy box sits halfway between the two slots (plus the 10px padding).
    const top = render.frames(middle, slots).match(/data-intro-travel-frame="copy"><div class="home-intro-edge" style="transform:translate\(([\d.-]+)px, ([\d.-]+)px\) scaleX\(([\d.-]+)\)/);
    assert.ok(Math.abs(Number(top[1]) - (slots[i - 1].copy.x + 50 - 10)) < 1e-6);
    assert.ok(Math.abs(Number(top[2]) - (slots[i - 1].copy.y + 25 - 10)) < 1e-6);
    assert.ok(Math.abs(Number(top[3]) - 420) < 1e-6);
  }
});

test('frame edges are hairlines that only lengthen, never a stretched outlined box', () => {
  const slots = FEATURE_PHASES.map((_, i) => ({
    copy: { x: 100, y: 100, width: 300 + i * 200, height: 150 },
    art: { x: 500, y: 100, width: 400, height: 200 + i * 50 },
    baseline: { x: 0, y: 400, width: 1000, height: 1 },
  }));
  const { travel } = phases.getTransitionBeats(1);
  const html = render.frames((travel[0] + travel[1]) / 2, slots);
  for (const [, transform] of html.matchAll(/class="home-intro-edge" style="transform:([^"]+)"/g)) {
    assert.match(transform, /^translate\([^)]+\) (scaleX|scaleY)\([\d.]+\)$/);
    assert.doesNotMatch(transform, /scale\([^)]*,/);
  }
});

test('compact AI analysis caption sits below the baseline at a readable size', () => {
  const html = render.responsiveArt('ai-analysis', 390);
  const [, y, size] = html.match(/<text data-intro-caption="true" x="12" y="(\d+)"[^>]*font-size="(\d+)"/);
  assert.ok(Number(y) - Number(size) > 240, 'caption top is below the 240 baseline');
  assert.ok(Number(size) * (350 / 520) >= 11, 'caption renders at 11px or larger on a 390px phone');
});

test('currency chips align their visible label and outline with each clickable target', async () => {
  const { INITIAL_STATE, reduceInteraction } = await import('../src/components/home/introInteractions.js');
  for (const [index, currency] of ['USD', 'EUR', 'GBP'].entries()) {
    let state = INITIAL_STATE.profile;
    const control = render.controls({ scene: 'profile', state, onAction: action => { state = reduceInteraction('profile', state, action); } }).find(control => control['aria-label'] === currency);
    control.onClick();
    const html = render.artWith('profile', 1, state);
    const x = 238 + index * 47;
    assert.match(html, new RegExp(`<rect x="${x}" y="305" width="47" height="36"`));
    assert.match(html, new RegExp(`<text x="${x + 23.5}" y="327" text-anchor="middle"[^>]*>${currency}</text>`));
    assert.equal(control.style['--x'], `${x / 520 * 100}%`);
    assert.equal(control.style['--w'], `${47 / 520 * 100}%`);
    assert.match(html, new RegExp(`aria-label="${currency}" aria-pressed="true"`));
  }
});


test('the entire active art box receives pointer events and tilts only for a mouse without reduced motion', () => {
  for (const active of [true, false]) {
    for (const reduced of [true, false]) {
      for (const pointerType of ['mouse', 'touch', 'pen']) {
        const props = render.illustrationProps({ active, reduced });
        assert.match(props.className, new RegExp(active ? 'pointer-events-auto' : 'pointer-events-none'));
        let measurements = 0;
        const event = { pointerType, clientX: 200, clientY: 0, currentTarget: {
          getBoundingClientRect: () => { measurements++; return { left: 0, top: 0, width: 200, height: 100 }; },
        } };
        const value = axis => typeof props.style[axis] === 'number' ? props.style[axis] : props.style[axis].get();
        props.onPointerMove(event);
        assert.equal(value('rotateX'), 0, 'ignore movement before entry');
        props.onPointerEnter(event);
        props.onPointerMove(event);
        const enabled = active && !reduced && pointerType === 'mouse';
        assert.equal(measurements, enabled ? 1 : 0);
        assert.equal(value('rotateX'), enabled ? 4 : 0);
        assert.equal(value('rotateY'), enabled ? 4 : 0);
        props.onPointerMove({ ...event, clientX: 0, clientY: 100 });
        assert.equal(measurements, enabled ? 1 : 0, 'reuse entry bounds during movement');
        assert.equal(value('rotateX'), enabled ? -4 : 0);
        assert.equal(value('rotateY'), enabled ? -4 : 0);
        props.onPointerLeave();
        assert.equal(value('rotateX'), 0);
        assert.equal(value('rotateY'), 0);
        props.onPointerMove(event);
        assert.equal(value('rotateX'), 0, 'ignore movement after leave');
      }
    }
  }
});


test('AI and insights use readable compact art outside desktop layout C with aligned controls', () => {
  for (const scene of ['ai-analysis', 'insights']) {
    for (const [width, reduced, wide] of [[390, false, false], [767, false, false], [768, false, true], [1280, false, true], [1280, true, false]]) {
      const html = render.responsiveArt(scene, width, reduced);
      assert.match(html, new RegExp(`viewBox="0 0 ${wide ? '880 300' : '520 360'}"`));
      if (!wide) {
        assert.doesNotMatch(html, /font-size="(?:11|12)"/);
        if (scene === 'ai-analysis') {
          assert.match(html, /<text x="286" y="68"[^>]*>AAPL/);
          assert.match(html, new RegExp(`--x:${286 / 520 * 100}%[^>]*aria-label="AAPL risk note"`));
          assert.match(html, /1,000 stocks analysed/);
        } else {
          assert.match(html, /<text x="294" y="227"[^>]*>XOM/);
          assert.match(html, new RegExp(`--x:${260 / 520 * 100}%[^>]*aria-label="XOM session explanation"`));
          assert.match(html, /<text x="26" y="85"/);
        }
      }
    }
  }
  const list = render.list();
  assert.equal([...list.matchAll(/viewBox="0 0 520 360"/g)].length, 6);
});

test('each beacon sits on its own data point and follows the visitor', () => {
  const spec = (scene, state, wide) => render.ctaSpec(scene, { ...INITIAL_STATE[scene], ...state }, wide);
  const anchors = FEATURE_PHASES.map(({ key }) => JSON.stringify(spec(key, {}).anchor));
  assert.equal(new Set(anchors).size, 6, 'every scene points at a different spot');
  assert.notDeepEqual(spec('portfolio', { selected: 1 }).anchor, spec('portfolio', {}).anchor);
  assert.notDeepEqual(spec('stock-data', { timeframe: '1Y' }).anchor, spec('stock-data', {}).anchor);
  assert.notDeepEqual(spec('ai-analysis', { dot: 5, pinned: true }).anchor, spec('ai-analysis', {}).anchor);
  assert.notDeepEqual(spec('advisor', { question: 0 }).anchor, spec('advisor', {}).anchor);
  assert.notDeepEqual(spec('insights', { bar: 0 }).anchor, spec('insights', {}).anchor);
  assert.ok(spec('insights', { bar: 0 }).anchor.y > 240, 'a loser bar is marked below the zero line');
  for (const wide of [false, true]) {
    for (const { key } of FEATURE_PHASES) {
      if (wide && !['ai-analysis', 'insights'].includes(key)) continue;
      const { anchor, pill } = spec(key, {}, wide);
      const [w, h] = wide ? [880, 300] : [520, 360];
      for (const [x, y] of [[anchor.x, anchor.y], [pill.edge, pill.y]]) assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, `${key} stays inside the illustration`);
    }
  }
});

test('the beacon pulses only in the active animated scene', () => {
  const ai = FEATURE_PHASES[2];
  const { travel } = phases.getTransitionBeats(1);
  const holding = (phases.getHoldRange(2)[0] + phases.getHoldRange(2)[1]) / 2;
  assert.match(render.scene(ai, 2, holding, 2), /data-intro-cta-mark="true" class="home-intro-cta-mark is-active"/);
  assert.match(render.scene(ai, 2, travel[0], 1), /data-intro-cta-mark="true" class="home-intro-cta-mark"/);
  assert.match(render.list(), /data-intro-cta-mark="true" class="home-intro-cta-mark"/);
  assert.doesNotMatch(render.list(), /home-intro-cta-mark is-active/);
});
