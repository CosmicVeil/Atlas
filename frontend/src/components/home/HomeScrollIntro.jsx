import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { Wallet, Search, Brain, LineChart, User, BarChart3 } from 'lucide-react';
import { FEATURE_PHASES, INTRO_END, OUTRO_START, TITLE_FOLD_END, getInteractivePhase, getFadeStops, getCopyFadeStops, getIllustrationStops, getLayoutTravel, getFrameVisible, getFrameOpacity, getFrameRect } from './introPhases';
import useIntroProgress from './useIntroProgress';
import IntroIllustration from './IntroIllustrations';
import { INITIAL_STATE, reduceInteraction } from './introInteractions';
import './homeIntro.css';

const PHASE_ICONS = {
  portfolio: Wallet,
  'stock-data': Search,
  'ai-analysis': Brain,
  advisor: LineChart,
  profile: User,
  insights: BarChart3,
};

function TitleLetter({ letter, index, progress }) {
  const range = [index * 0.005, TITLE_FOLD_END - (4 - index) * 0.005];
  const rotateX = useTransform(progress, range, [0, 90]);
  const scaleY = useTransform(progress, range, [1, 0]);
  const opacity = useTransform(progress, range, [1, 0]);
  return <motion.span className="inline-block origin-bottom" style={{ rotateX, scaleY, opacity }}>{letter}</motion.span>;
}

function IntroTitle({ progress }) {
  const opacity = useTransform(progress, [0, TITLE_FOLD_END], [1, 0]);
  return (
    <motion.div className="home-intro-title absolute inset-0 px-6 text-center" style={{ opacity }}>
      <motion.h1 data-intro-title aria-label="ATLAS" className="text-6xl sm:text-8xl md:text-9xl font-light tracking-tight" style={{ opacity }}>
        <span aria-hidden="true">{'ATLAS'.split('').map((letter, index) => <TitleLetter key={index} letter={letter} index={index} progress={progress} />)}</span>
      </motion.h1>
      <div className="home-intro-subtitle">
        <p className="text-sm tracking-[0.15em] mb-4">AI Trading, Learning &amp; Stock Analysis</p>
        <p className="text-base max-w-2xl mx-auto leading-relaxed">
          Advanced algorithmic trading platform powered by machine learning.
          Real-time market analysis, portfolio optimization, and intelligent stock recommendations.
        </p>
      </div>
    </motion.div>
  );
}

function Baseline({ progress, geometry }) {
  const scaleX = useTransform(progress, [0, TITLE_FOLD_END], [0, 1]);
  const opacity = useTransform(progress, [OUTRO_START, 1], [1, 0]);
  const transform = useTransform(() => {
    const { from, to, amount } = getLayoutTravel(progress.get());
    const slots = geometry.get();
    if (!slots.length) return 'none';
    const a = slots[from].baseline;
    const b = slots[to].baseline;
    const base = slots[0].baseline;
    return `translate(${a.x + (b.x - a.x) * amount - base.x}px, ${a.y + (b.y - a.y) * amount - base.y}px) scaleX(${(a.width + (b.width - a.width) * amount) / base.width})`;
  });
  return <motion.div aria-hidden="true" className="home-intro-baseline-travel" style={{ transform }}>
    <motion.div className="home-intro-baseline" style={{ scaleX, opacity }} />
  </motion.div>;
}

// Each outline is four 1px lines. Lines scale only along their length, so the
// hairline keeps its 1px thickness however far the box stretches while travelling.
const EDGES = {
  top: r => `translate(${r.x}px, ${r.y}px) scaleX(${r.width})`,
  bottom: r => `translate(${r.x}px, ${r.y + r.height - 1}px) scaleX(${r.width})`,
  left: r => `translate(${r.x}px, ${r.y}px) scaleY(${r.height})`,
  right: r => `translate(${r.x + r.width - 1}px, ${r.y}px) scaleY(${r.height})`,
};

function FrameEdge({ slot, edge, progress, geometry }) {
  const transform = useTransform(() => {
    const rect = getFrameRect(geometry.get(), slot, progress.get());
    return rect ? EDGES[edge](rect) : 'scale(0)';
  });
  return <motion.div className="home-intro-edge" style={{ transform }} />;
}

function TravelFrames({ progress, geometry }) {
  const opacity = useTransform(progress, getFrameOpacity);
  return (
    <motion.div aria-hidden="true" className="home-intro-frames" style={{ opacity }}>
      {['copy', 'art'].map(slot => (
        <div key={slot} data-intro-travel-frame={slot}>
          {Object.keys(EDGES).map(edge => <FrameEdge key={edge} slot={slot} edge={edge} progress={progress} geometry={geometry} />)}
        </div>
      ))}
    </motion.div>
  );
}

function Scene({ phase, progress, index, activeIndex, scrollToScene }) {
  const active = activeIndex === index;
  const [wasActive, setWasActive] = useState(active);
  const [state, setState] = useState(INITIAL_STATE[phase.key]);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setState(INITIAL_STATE[phase.key]);
  }
  const onAction = action => setState(current => reduceInteraction(phase.key, current, action));
  const fade = getFadeStops(index);
  const opacity = useTransform(progress, fade.input, fade.output);
  const frameOpacity = useTransform(progress, p => getFrameVisible(index, p) ? 1 : 0);
  const copy = getCopyFadeStops(index);
  const copyOpacity = useTransform(progress, copy.input, copy.output);
  const x = useTransform(progress, copy.input, [48, 0, 0, -48]);
  const scaleY = useTransform(progress, fade.input, [0, 1, 1, 0]);
  const illustration = getIllustrationStops(index);
  const t = useTransform(progress, illustration.input, illustration.output);
  return (
    <motion.div data-intro-scene={phase.key} data-intro-layout={phase.layout} className={`home-intro-scene home-intro-layout-${phase.layout}`} style={{ opacity }}>
      <div className="home-intro-copy-slot" data-intro-slot="copy">
        <motion.div data-intro-copy className="home-intro-frame" style={{ opacity: frameOpacity }}>
          <motion.div className="home-intro-copy" style={{ x, opacity: copyOpacity }}>
            <h2 data-intro-heading className="font-light text-[28px] lg:text-[40px] tracking-tight">{phase.title}</h2>
            <p className="text-base leading-relaxed">{phase.description}</p>
          </motion.div>
        </motion.div>
      </div>
      <div className="home-intro-art-slot" data-intro-slot="art">
        <motion.div data-intro-art className="home-intro-frame" style={{ opacity: frameOpacity }}>
          <motion.div className="home-intro-illustration" style={{ opacity }}>
            <IntroIllustration scene={phase.key} t={t} grow={scaleY} cta={{ phase, index, scrollToScene }} state={state} onAction={onAction} active={active} onFocus={() => { if (!active) scrollToScene(index); }} />
          </motion.div>
        </motion.div>
      </div>
      <div className="home-intro-baseline-slot" data-intro-slot="baseline" />
    </motion.div>
  );
}

function ProgressRail({ progress, activeIndex, scrollToScene }) {
  const opacity = useTransform(progress, [TITLE_FOLD_END, INTRO_END, OUTRO_START, 1], [0, 1, 1, 0]);
  return (
    <motion.nav aria-label="Explore features" className="home-intro-rail hidden lg:flex" style={{ opacity }}>
      {FEATURE_PHASES.map((phase, index) => {
        const Icon = PHASE_ICONS[phase.key];
        return (
          <button key={phase.key} type="button" aria-label={phase.title} aria-current={activeIndex === index ? 'step' : undefined}
            className="pointer-events-auto" onClick={() => scrollToScene(index)}>
            <Icon size={18} strokeWidth={1} aria-hidden="true" />
          </button>
        );
      })}
    </motion.nav>
  );
}

export default function HomeScrollIntro() {
  const wrapperRef = useRef(null);
  const stageRef = useRef(null);
  const geometry = useMotionValue([]);
  useEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      const slots = [...stage.querySelectorAll('[data-intro-scene]')].map(scene => Object.fromEntries(
        ['copy', 'art', 'baseline'].map(name => {
          const rect = scene.querySelector(`[data-intro-slot="${name}"]`).getBoundingClientRect();
          return [name, { x: rect.left - stageRect.left, y: rect.top - stageRect.top, width: rect.width, height: rect.height }];
        }),
      ));
      geometry.set(slots);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [geometry]);
  const { progress: scrollYProgress, scrollToScene } = useIntroProgress(wrapperRef);
  const [stage, setStage] = useState({ activeIndex: -1, pinned: true });
  const previous = useRef({ activeIndex: -1, pinned: true });

  // Only phase and pinning boundaries render React; frame updates use Motion.
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const next = { activeIndex: getInteractivePhase(progress), pinned: progress < 1 };
    if (next.activeIndex !== previous.current.activeIndex || next.pinned !== previous.current.pinned) {
      previous.current = next;
      setStage(next);
    }
  });

  return (
    <section data-home-intro ref={wrapperRef} className="home-intro-wrapper relative h-[1070vh]" aria-label="Explore Atlas">
      {/* App's overflow-hidden ancestor prevents native sticky positioning. */}
      <div ref={stageRef} className={`home-intro-stage w-full overflow-hidden pointer-events-none bg-black ${stage.pinned ? 'fixed inset-x-0 top-0 z-10' : 'absolute inset-x-0 bottom-0'}`}>
        <IntroTitle progress={scrollYProgress} />
        <Baseline progress={scrollYProgress} geometry={geometry} />
        <TravelFrames progress={scrollYProgress} geometry={geometry} />
        {FEATURE_PHASES.map((phase, index) => <Scene key={phase.key} phase={phase} index={index} progress={scrollYProgress} activeIndex={stage.activeIndex} scrollToScene={scrollToScene} />)}
        <ProgressRail progress={scrollYProgress} activeIndex={stage.activeIndex} scrollToScene={scrollToScene} />
      </div>
    </section>
  );
}
