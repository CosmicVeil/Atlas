import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { Wallet, Search, Brain, LineChart, User, BarChart3 } from 'lucide-react';
import { FEATURE_PHASES, getActivePhase, getFadeStops, getLocalProgress, getPhaseRange } from './introPhases';
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
  const range = [0.01 + index * 0.006, 0.075 + index * 0.006];
  const y = useTransform(progress, range, [0, -90 - index * 12]);
  const rotateX = useTransform(progress, range, [0, -85]);
  const opacity = useTransform(progress, range, [1, 0]);
  return <motion.span className="inline-block" style={{ y, rotateX, opacity }}>{letter}</motion.span>;
}

function IntroTitle({ progress }) {
  const opacity = useTransform(progress, [0, 0.045, 0.1], [1, 1, 0]);
  const y = useTransform(progress, [0, 0.1], [0, -35]);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pt-20 text-center">
      <h1 aria-label="ATLAS" className="text-6xl sm:text-8xl md:text-9xl font-light tracking-tight text-white mb-6" style={{ perspective: 700 }}>
        <span aria-hidden="true">{'ATLAS'.split('').map((letter, index) => <TitleLetter key={index} letter={letter} index={index} progress={progress} />)}</span>
      </h1>
      <motion.div style={{ opacity, y }}>
        <p className="text-sm tracking-[0.3em] text-white/40 mb-4 uppercase">AI Trading, Learning &amp; Stock Analysis</p>
        <p className="text-base text-white/60 max-w-2xl mx-auto leading-relaxed">
          Advanced algorithmic trading platform powered by machine learning.
          Real-time market analysis, portfolio optimization, and intelligent stock recommendations.
        </p>
      </motion.div>
      <motion.div style={{ opacity }} className="absolute bottom-12 flex flex-col items-center gap-4">
        <span className="text-[9px] uppercase tracking-[0.3em] text-white/30">Scroll to explore</span>
        <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
      </motion.div>
    </div>
  );
}

function Scene({ progress, index, children }) {
  const fade = getFadeStops(index);
  const opacity = useTransform(progress, fade.input, fade.output);
  const y = useTransform(progress, fade.input, [35, 0, 0, -35]);
  const scale = useTransform(progress, fade.input, [0.94, 1, 1, 1.04]);
  return (
    <motion.div aria-hidden="true" className="home-intro-scene" style={{ opacity, y, scale }}>
      <p className="text-[10px] uppercase tracking-[0.35em] text-white/30 mb-5">0{index + 1} / ATLAS</p>
      {children}
      <p className="mt-6 text-lg sm:text-2xl font-light tracking-wide text-white/80 text-center">{FEATURE_PHASES[index].title}</p>
    </motion.div>
  );
}

function Art({ children }) {
  return <svg className="home-intro-art" viewBox="0 0 520 280" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">{children}</svg>;
}

function HoldingSlice({ t, index }) {
  const angle = index * 72;
  const radians = angle * Math.PI / 180;
  const range = [index * 0.07, 0.45 + index * 0.07];
  const x = useTransform(t, range, [Math.cos(radians) * 65, 0]);
  const y = useTransform(t, range, [Math.sin(radians) * 65, 0]);
  const opacity = useTransform(t, range, [0, 0.3 + index * 0.14]);
  const rotate = useTransform(t, range, [angle - 35, angle]);
  return <motion.circle cx="150" cy="135" r="68" strokeWidth="22" strokeDasharray="77 351" style={{ x, y, rotate, opacity, transformOrigin: '50% 50%' }} />;
}

function PortfolioVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(0), [0, 1]);
  const pathLength = useTransform(t, [0.25, 0.9], [0, 1]);
  return (
    <Scene progress={progress} index={0}>
      <Art>
        {[0, 1, 2, 3, 4].map((index) => <HoldingSlice key={index} index={index} t={t} />)}
        <text x="150" y="139" textAnchor="middle" stroke="none" fill="white" fontSize="17" fontWeight="300">HOLDINGS</text>
        <path d="M275 195H485 M275 75V195" strokeOpacity="0.1" />
        <motion.path d="M275 180L302 166L327 175L354 139L380 148L408 107L435 119L480 65" style={{ pathLength }} strokeOpacity="0.75" strokeWidth="2" />
        <text x="275" y="232" stroke="none" className="home-intro-copy">A clearer view of value</text>
      </Art>
    </Scene>
  );
}

function Candle({ t, index }) {
  const x = 50 + index * 38;
  const y = 165 - index * 8 + (index % 3) * 14;
  const scaleY = useTransform(t, [index * 0.045, 0.22 + index * 0.045], [0, 1]);
  return (
    <motion.g style={{ scaleY, transformOrigin: '50% 100%' }}>
      <path d={`M${x} ${y - 22}V${y + 54}`} strokeOpacity="0.45" />
      <rect x={x - 9} y={y} width="18" height="32" fill={index % 3 ? 'white' : 'black'} fillOpacity="0.5" strokeOpacity="0.6" />
    </motion.g>
  );
}

function StockDataVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(1), [0, 1]);
  const x = useTransform(t, [0, 1], [40, 478]);
  const y = useTransform(t, [0, 0.5, 1], [195, 100, 65]);
  return (
    <Scene progress={progress} index={1}>
      <Art>
        {[60, 115, 170, 225].map((y) => <path key={y} d={`M30 ${y}H490`} strokeOpacity="0.07" />)}
        {Array.from({ length: 12 }, (_, index) => <Candle key={index} t={t} index={index} />)}
        <motion.path d="M0 35V235" style={{ x }} strokeOpacity="0.4" strokeDasharray="3 5" />
        <motion.path d="M30 0H490" style={{ y }} strokeOpacity="0.3" strokeDasharray="3 5" />
        <text x="30" y="265" stroke="none" className="home-intro-copy">Every candle tells a story</text>
      </Art>
    </Scene>
  );
}

const NETWORK = [[85, 65, 0], [85, 140, 0], [85, 215, 0], [255, 35, 1], [255, 105, 1], [255, 175, 1], [255, 245, 1], [435, 95, 2], [435, 185, 2]];

function NetworkNode({ node: [cx, cy, layer], index, t }) {
  const start = layer * 0.23 + (index % 3) * 0.045;
  const opacity = useTransform(t, [start, start + 0.16, start + 0.32, 1], [0.15, 1, 0.4, 0.65]);
  const scale = useTransform(t, [start, start + 0.16, start + 0.32, 1], [0.8, 1.25, 1, 1]);
  return <motion.circle cx={cx} cy={cy} r="9" fill="black" style={{ opacity, scale, transformOrigin: '50% 50%' }} />;
}

function NetworkEdge({ from, to, t }) {
  const pathLength = useTransform(t, [from[2] * 0.25, 0.4 + from[2] * 0.25], [0, 1]);
  const opacity = useTransform(t, [from[2] * 0.25, 0.3 + from[2] * 0.25, 0.8], [0.05, 0.65, 0.18]);
  return <motion.path d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`} style={{ pathLength, opacity }} />;
}

function AIAnalysisVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(2), [0, 1]);
  return (
    <Scene progress={progress} index={2}>
      <Art>
        {NETWORK.flatMap((from, i) => NETWORK.map((to, j) => to[2] === from[2] + 1 ? <NetworkEdge key={`${i}-${j}`} from={from} to={to} t={t} /> : null))}
        {NETWORK.map((node, index) => <NetworkNode key={index} node={node} index={index} t={t} />)}
      </Art>
    </Scene>
  );
}

const ADVICE = 'See the signal. Plan your next move.';

function TypedLetter({ letter, index, t }) {
  const start = 0.15 + index * 0.016;
  const opacity = useTransform(t, [start, start + 0.008], [0, 1]);
  return <motion.span style={{ opacity }}>{letter}</motion.span>;
}

function AdvisorVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(3), [0, 1]);
  const scale = useTransform(t, [0, 0.2, 0.4, 0.6, 0.8, 1], [0.9, 1.08, 1, 1.08, 1, 1.04]);
  const opacity = useTransform(t, [0, 0.25, 0.5, 0.75, 1], [0.3, 1, 0.4, 1, 0.5]);
  return (
    <Scene progress={progress} index={3}>
      <div className="w-full max-w-lg border border-white/5 bg-black p-6 sm:p-10">
        <motion.div style={{ scale }} className="w-12 h-12 border border-white/10 rounded-full flex items-center justify-center mb-8">
          <LineChart size={22} strokeWidth={1} />
        </motion.div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-white/30 mb-4">Your personal advisor</p>
        <p className="text-xl sm:text-2xl font-light leading-relaxed min-h-24">
          {ADVICE.split('').map((letter, index) => <TypedLetter key={index} letter={letter} index={index} t={t} />)}
          <motion.span style={{ opacity }} className="inline-block ml-1 h-5 w-px bg-white/60" />
        </p>
      </div>
    </Scene>
  );
}

function ProfileChip({ label, index, t }) {
  const range = [0.15 + index * 0.12, 0.5 + index * 0.12];
  const x = useTransform(t, range, [index % 2 ? 35 : -35, 0]);
  const opacity = useTransform(t, range, [0, 1]);
  return <motion.span style={{ x, opacity }} className="border border-white/5 px-4 py-3 text-xs text-white/60">{label}</motion.span>;
}

function ProfileVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(4), [0, 1]);
  const pathLength = useTransform(t, [0, 0.8], [0, 1]);
  return (
    <Scene progress={progress} index={4}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128" fill="none">
            <circle cx="64" cy="64" r="60" stroke="white" strokeOpacity="0.05" />
            <motion.circle cx="64" cy="64" r="60" stroke="white" strokeOpacity="0.65" style={{ pathLength }} />
          </svg>
          <User size={42} strokeWidth={1} className="text-white/60" />
        </div>
        <div className="grid grid-cols-2 gap-2 w-full text-center">
          {['Risk: Moderate', 'Investment goals', 'Currency', 'Alerts'].map((label, index) => <ProfileChip key={label} label={label} index={index} t={t} />)}
        </div>
      </div>
    </Scene>
  );
}

function HeatTile({ index, t }) {
  const start = 0.12 + index * 0.025;
  const rotateY = useTransform(t, [start, start + 0.2, start + 0.38, start + 0.58], [0, 180, 180, 360]);
  return (
    <motion.div className="home-intro-tile" style={{ rotateY }}>
      <span className="bg-white/10 text-white/70">+{(0.4 + index * 0.23).toFixed(2)}%</span>
      <span className="bg-white/[0.02] text-white/30">−{(0.2 + index * 0.13).toFixed(2)}%</span>
    </motion.div>
  );
}

function InsightsVignette({ progress }) {
  const t = useTransform(progress, getPhaseRange(5), [0, 1]);
  const x = useTransform(t, [0, 1], ['0%', '-35%']);
  return (
    <Scene progress={progress} index={5}>
      <div className="w-full max-w-lg">
        <div className="grid grid-cols-4 gap-2 text-[10px] sm:text-sm font-light" style={{ perspective: 800 }}>
          {Array.from({ length: 12 }, (_, index) => <HeatTile key={index} index={index} t={t} />)}
        </div>
        <div className="overflow-hidden border-y border-white/5 mt-4 py-3">
          <motion.p style={{ x }} className="whitespace-nowrap text-[10px] uppercase tracking-[0.2em] text-white/40">Market pulse · Technology +1.8% · Energy −0.6% · Healthcare +0.9% · Financials −0.3% · Market pulse</motion.p>
        </div>
      </div>
    </Scene>
  );
}

function PhaseMarker({ phase, index, progress, activeIndex }) {
  const Icon = PHASE_ICONS[phase.key];
  const scaleX = useTransform(progress, (p) => getLocalProgress(p, index));
  return (
    <div className={`flex flex-col gap-2 ${activeIndex === index ? 'text-white' : 'text-white/30'}`}>
      <div className="flex items-center gap-3">
        <Icon size={18} strokeWidth={1} aria-hidden="true" />
        <span className="hidden md:block text-[10px] tracking-wide">{phase.title}</span>
      </div>
      <div className="h-px w-6 md:w-full bg-white/5">
        <motion.div className="h-px bg-white/60 origin-left" style={{ scaleX }} />
      </div>
    </div>
  );
}

function PhaseIndicator({ progress, activeIndex }) {
  const opacity = useTransform(progress, [0.08, 0.13, 0.875, 0.925], [0, 1, 1, 0]);
  return (
    <motion.div aria-hidden="true" style={{ opacity }} className="absolute bottom-8 inset-x-6 md:inset-x-auto md:left-8 md:top-1/2 md:bottom-auto md:-translate-y-1/2">
      <div className="flex justify-center gap-5 md:flex-col md:gap-6">
        {FEATURE_PHASES.map((phase, index) => <PhaseMarker key={phase.key} phase={phase} index={index} progress={progress} activeIndex={activeIndex} />)}
      </div>
      <p className="md:hidden mt-4 h-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/60">{FEATURE_PHASES[activeIndex]?.title}</p>
    </motion.div>
  );
}

export default function HomeScrollIntro() {
  const wrapperRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: wrapperRef, offset: ['start start', 'end end'] });
  const [stage, setStage] = useState({ activeIndex: -1, pinned: true });
  const previous = useRef({ activeIndex: -1, pinned: true });

  // Motion owns the shared scroll subscription and its unmount cleanup. Only
  // phase/pinning boundaries render React; frame updates stay in motion values.
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const next = { activeIndex: getActivePhase(progress), pinned: progress < 1 };
    if (next.activeIndex !== previous.current.activeIndex || next.pinned !== previous.current.pinned) {
      previous.current = next;
      setStage(next);
    }
  });

  return (
    <section ref={wrapperRef} className="home-intro-wrapper relative h-[300vh]" aria-label="Explore Atlas">
      {/* App's overflow-hidden ancestor prevents native sticky positioning. */}
      <div className={`home-intro-stage w-full overflow-hidden pointer-events-none ${stage.pinned ? 'fixed inset-x-0 top-0 z-10' : 'absolute inset-x-0 bottom-0'}`}>
        <IntroTitle progress={scrollYProgress} />
        <PortfolioVignette progress={scrollYProgress} />
        <StockDataVignette progress={scrollYProgress} />
        <AIAnalysisVignette progress={scrollYProgress} />
        <AdvisorVignette progress={scrollYProgress} />
        <ProfileVignette progress={scrollYProgress} />
        <InsightsVignette progress={scrollYProgress} />
        <PhaseIndicator progress={scrollYProgress} activeIndex={stage.activeIndex} />
      </div>
    </section>
  );
}
