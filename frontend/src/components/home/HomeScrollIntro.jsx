import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'motion/react';
import { Wallet, Search, Brain, LineChart, User, BarChart3 } from 'lucide-react';
import { FEATURE_PHASES, INTRO_END, OUTRO_START, TITLE_FOLD_END, getInteractivePhase, getFadeStops, getCopyFadeStops, getIllustrationStops } from './introPhases';
import useIntroProgress from './useIntroProgress';
import IntroCta from './IntroCta';
import IntroIllustration from './IntroIllustrations';
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

function Baseline({ progress }) {
  const scaleX = useTransform(progress, [0, TITLE_FOLD_END], [0, 1]);
  const opacity = useTransform(progress, [OUTRO_START, 1], [1, 0]);
  return <motion.div aria-hidden="true" className="home-intro-baseline" style={{ scaleX, opacity }} />;
}

function Scene({ phase, progress, index, activeIndex, scrollToScene }) {
  const fade = getFadeStops(index);
  const opacity = useTransform(progress, fade.input, fade.output);
  const copy = getCopyFadeStops(index);
  const copyOpacity = useTransform(progress, copy.input, copy.output);
  const y = useTransform(progress, copy.input, [24, 0, 0, 24]);
  const scaleY = useTransform(progress, fade.input, [0, 1, 1, 0]);
  const illustration = getIllustrationStops(index);
  const t = useTransform(progress, illustration.input, illustration.output);
  return (
    <motion.div data-intro-scene={phase.key} className="home-intro-scene" style={{ opacity }}>
      <motion.div className="home-intro-copy" style={{ y, opacity: copyOpacity }}>
        <h2 className="font-light text-[28px] lg:text-[40px] tracking-tight">{phase.title}</h2>
        <p className="text-base leading-relaxed">{phase.description}</p>
        <IntroCta phase={phase} index={index} active={activeIndex === index} scrollToScene={scrollToScene} />
      </motion.div>
      <motion.div className="home-intro-illustration" style={{ scaleY, opacity }}>
        <IntroIllustration scene={phase.key} t={t} />
      </motion.div>
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
    <section data-home-intro ref={wrapperRef} className="home-intro-wrapper relative h-[760vh]" aria-label="Explore Atlas">
      {/* App's overflow-hidden ancestor prevents native sticky positioning. */}
      <div className={`home-intro-stage w-full overflow-hidden pointer-events-none bg-black ${stage.pinned ? 'fixed inset-x-0 top-0 z-10' : 'absolute inset-x-0 bottom-0'}`}>
        <IntroTitle progress={scrollYProgress} />
        <Baseline progress={scrollYProgress} />
        {FEATURE_PHASES.map((phase, index) => <Scene key={phase.key} phase={phase} index={index} progress={scrollYProgress} activeIndex={stage.activeIndex} scrollToScene={scrollToScene} />)}
        <ProgressRail progress={scrollYProgress} activeIndex={stage.activeIndex} scrollToScene={scrollToScene} />
      </div>
    </section>
  );
}
