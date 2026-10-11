import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { animate, motion, useMotionValue, useSpring, useTransform } from 'motion/react';

import useIntroStep from './useIntroStep';

import { INITIAL_STATE, TIMEFRAMES, QUESTIONS, RISK_NOTES, BAR_DETAILS, dotAt, formatCurrency, getTilt, sliderKey } from './introInteractions';

const PORTFOLIOS = [
  { name: 'Retirement', value: 128450, line: 'M325 12L345 8L365 16L385 3L405 6L425 -5L445 -2L475 -16' },
  { name: 'Growth', value: 46280, line: 'M325 12L345 15L365 1L385 9L405 -2L425 4L445 -12L475 -18' },
  { name: 'Dividends', value: 24760, line: 'M325 12L345 9L365 11L385 5L405 7L425 0L445 -3L475 -8' },
];
const CANDLES = [
  [182, 187, 180, 185, 28], [185, 189, 183, 184, 36], [184, 191, 182, 189, 43],
  [189, 194, 187, 192, 32], [192, 195, 186, 188, 49], [188, 196, 187, 194, 38],
  [194, 199, 191, 197, 55], [197, 201, 193, 195, 42], [195, 204, 194, 202, 62],
  [202, 206, 198, 200, 46], [200, 208, 199, 205, 59], [205, 211, 203, 209, 68],
];
const DOTS = Array.from({ length: 40 * 25 }, (_, index) => ({
  x: 12 + (index % 40) * 13, y: 32 + Math.floor(index / 40) * 8, shade: (index * 37) % 3,
}));
const SHORTLIST = [['AAPL', 'Low'], ['MSFT', 'Low'], ['NVDA', 'High'], ['AMZN', 'Medium'], ['GOOGL', 'Medium']];
const QUESTION = 'How does AAPL fit my portfolio?';
const FACTORS = ['Pro · Diverse revenue sources', 'Pro · Consistent cash flow', 'Con · Technology concentration', 'Con · Price volatility'];
const GAINERS = [['NVDA', 4.8], ['MSFT', 3.1], ['AAPL', 2.4]];
const LOSERS = [['XOM', 2.6], ['CVX', 1.8], ['PFE', 1.2]];
const EXPLANATION = 'NVDA rose 4.8% in this sample session, leading the group.';

const getDesktopArt = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
function subscribeDesktopArt(onChange) {
  const media = window.matchMedia('(min-width: 768px)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function Art({ children, wide }) {
  return <svg className="home-intro-art tabular-nums" viewBox={wide ? "0 0 880 300" : "0 0 520 360"} fill="none" aria-hidden="true">{children}</svg>;
}

function PortfolioRow({ row, index, t, highlighted }) {
  const start = index * 0.12;
  const y = useTransform(t, [start, start + 0.3], [240, 70 + index * 57]);
  const opacity = useTransform(t, [start, start + 0.2], [0, 1]);
  const value = useTransform(t, p => `$${Math.round(row.value * Math.min(1, Math.max(0, (p - start) / 0.4))).toLocaleString('en-US')}`);
  const pathLength = useTransform(t, [start, start + 0.45], [0, 1]);
  return (
    <motion.g style={{ y, opacity }}>
      <path d="M12 30H500" stroke="rgba(255,255,255,0.05)" />
      <text x="12" y="0" className="home-intro-svg-muted" fontSize="15">{row.name}</text>
      <motion.text x="175" y="0" fill="currentColor" fontSize="20" fontWeight="300">{value}</motion.text>
      <motion.path d={row.line} style={{ pathLength }} stroke="currentColor" strokeWidth={highlighted ? 3 : 1.5} />
      {highlighted && <text x="325" y="28" fill="currentColor" fontSize="11">+{[5.2, 7.4, 2.1][index]}% since last month</text>}
    </motion.g>
  );
}

function Portfolio({ t, state }) {
  const pathLength = useTransform(t, [0.1, 0.65], [0, 1]);
  const opacity = useTransform(t, [0.65, 0.82], [0, 1]);
  return <Art>
    <text x="12" y="22" className="home-intro-svg-muted" fontSize="12">Sample portfolios · USD</text>
    <text x="12" y="322" fill="currentColor" fontSize="19">{state.selected === null ? "Total value · $199,490" : `${PORTFOLIOS[state.selected].name} value · $${PORTFOLIOS[state.selected].value.toLocaleString('en-US')}`}</text>
    {PORTFOLIOS.map((row, index) => <PortfolioRow key={row.name} row={row} index={index} t={t} highlighted={state.hovered === index} />)}
    <motion.path d={state.selected === null ? "M12 240L90 238L160 232L230 235L300 220L370 226L440 210L500 202" : ["M12 240L90 231L160 235L230 215L300 220L370 205L440 211L500 184", "M12 240L90 235L160 219L230 230L300 210L370 217L440 199L500 174", "M12 240L90 235L160 237L230 229L300 232L370 222L440 219L500 211"][state.selected]} style={{ pathLength }} stroke="currentColor" />
    <motion.text x="12" y="284" className="home-intro-svg-muted" fontSize="15" style={{ opacity }}>Largest holding: NVDA, 18%</motion.text>
  </Art>;
}

function Candle({ t, index, candle: [open, high, low, close], priceRange }) {
  const x = 26 + index * 42;
  const scaleY = useTransform(t, [index * 0.035, 0.2 + index * 0.035], [0, 1]);
  const priceY = price => priceRange
    ? 230 - (price - priceRange[0]) / (priceRange[1] - priceRange[0]) * 160
    : 230 - (price - 178) * 4.5;
  return (
    <motion.g style={{ scaleY, originX: 0.5, originY: 1, transformOrigin: '50% 100%' }}>
      {/* An invisible extent makes the group's transform origin the shared axis. */}
      <rect x={x - 9} y="70" width="18" height="170" fill="transparent" />
      <path d={`M${x} ${priceY(high)}V${priceY(low)}`} stroke="currentColor" strokeOpacity="0.55" />
      <rect x={x - 9} y={priceY(Math.max(open, close))} width="18" height={Math.abs(priceY(open) - priceY(close))} fill={close >= open ? '#5FBF93' : '#E07A6A'} />
    </motion.g>
  );
}

function VolumeBar({ t, index, volume }) {
  const scaleY = useTransform(t, [index * 0.035, 0.25 + index * 0.035], [0, 1]);
  return <motion.rect x={17 + index * 42} y="240" width="18" height={volume} fill="currentColor" fillOpacity="0.16" style={{ scaleY, originX: 0.5, originY: 0, transformOrigin: '50% 0%' }} />;
}

function Timeframe({ label, index, t, selected }) {
  const opacity = useTransform(t, p => (selected ? selected === label : Math.min(2, Math.floor(p * 3)) === index) ? 1 : 0.35);
  return <motion.g style={{ opacity }}><rect x={335 + index * 57} y="12" width="47" height="27" rx="13" stroke="currentColor" strokeOpacity="0.2" /><text x={358 + index * 57} y="30" textAnchor="middle" fill="currentColor" fontSize="12">{label}</text></motion.g>;
}

function StockData({ t, state }) {
  const candles = TIMEFRAMES[state.timeframe] ?? CANDLES;
  const priceRange = state.timeframe === null ? undefined
    : [Math.min(...candles.map(candle => candle[2])), Math.max(...candles.map(candle => candle[1]))];
  const x = useTransform(t, p => 26 + (state.crosshair ?? p) * 462);
  const readout = useTransform(t, p => {
    const [open, high, low, close] = candles[Math.min(candles.length - 1, Math.floor((state.crosshair ?? p) * candles.length))];
    return `O ${open}   H ${high}   L ${low}   C ${close}`;
  });
  return <Art>
    <text x="12" y="30" fill="currentColor" fontSize="17">AAPL <tspan className="home-intro-svg-muted" fontSize="12">· Sample USD</tspan></text>
    {['1D', '1M', '1Y'].map((label, index) => <Timeframe key={label} label={label} index={index} t={t} selected={state.timeframe} />)}
    {[85, 135, 185].map(y => <path key={y} d={`M12 ${y}H508`} stroke="rgba(255,255,255,0.05)" />)}
    {candles.map((candle, index) => <Candle key={index} t={t} index={index} candle={candle} priceRange={priceRange} />)}
    {candles.map((candle, index) => <VolumeBar key={index} t={t} index={index} volume={candle[4]} />)}
    <motion.path d="M0 60V310" style={{ x }} stroke="currentColor" strokeOpacity="0.45" strokeDasharray="3 5" />
    <motion.text x="12" y="344" className="home-intro-svg-muted" fontSize="15">{readout}</motion.text>
  </Art>;
}

function AIAnalysis({ t, state, wide }) {
  const revealId = useId();
  const fieldId = useId();
  const y = useTransform(t, [0, 0.7], [0, -212]);
  const count = useTransform(t, p => `${Math.round(Math.min(1, p / 0.7) * 1000).toLocaleString('en-US')} stocks analysed`);
  const opacity = useTransform(t, [0.6, 0.82], [0, 1]);
  const x = useTransform(t, [0.6, 0.82], [24, 0]);
  return <Art wide={wide}>
    <defs>
      <clipPath id={revealId}><motion.rect x="0" y="240" width="550" height="212" style={{ y }} /></clipPath>
      <g id={fieldId}>
      {['rgba(245,245,242,0.85)', 'rgba(245,245,242,0.45)', 'rgba(245,245,242,0.2)'].map((shade, index) => (
        <g key={shade} fill={shade}>
          {DOTS.filter(dot => dot.shade === index).map(dot => <rect key={`${dot.x}-${dot.y}`} x={dot.x} y={dot.y} width="3" height="3" />)}
        </g>
      ))}
      </g>
    </defs>
    <g transform={wide ? undefined : "scale(0.5 1)"}>
    <use href={`#${fieldId}`} opacity="0.12" />
    <motion.g clipPath={`url(#${revealId})`}><use href={`#${fieldId}`} /></motion.g>
    <motion.path d="M10 240H532" stroke="currentColor" style={{ y }} />
    </g>
    <motion.g style={{ x, opacity }}>
      <text x={wide ? 560 : 286} y="42" className="home-intro-svg-muted" fontSize={wide ? 12 : 14}>Sample shortlist</text>
      {SHORTLIST.map(([ticker, risk], index) => <g key={ticker}>
        <path d={`M${wide ? 560 : 286} ${78 + index * 36}H${wide ? 868 : 508}`} stroke="rgba(255,255,255,0.05)" />
        <text x={wide ? 560 : 286} y={68 + index * 36} fill="currentColor" fontSize="14">{ticker}</text>
        <text x={wide ? 868 : 508} y={68 + index * 36} textAnchor="end" className="home-intro-svg-muted" fontSize={wide ? 12 : 14}>{risk} risk</text>
      </g>)}
    </motion.g>
    {state.dot !== null && <text x={wide ? 560 : 12} y={wide ? 260 : 24} fill="currentColor" fontSize="17">{state.pinned ? 'Pinned · ' : 'Sample · '}{dotAt((state.dot % 40 + 0.5) / 40, (Math.floor(state.dot / 40) + 0.5) / 25).ticker}</text>}
    {state.note !== null && <text x={wide ? 560 : 12} y={wide ? 285 : 340} fill="currentColor" fontSize={wide ? 11 : 14}>{RISK_NOTES[state.note]}</text>}
    <motion.text x="12" y="282" fill="currentColor" fontSize="21" fontWeight="300">{count}</motion.text>
    <text x="12" y={wide ? 298 : 306} className="home-intro-svg-muted" fontSize={wide ? 12 : 14}>Daily coverage · Sample data</text>
  </Art>;
}

function TypedLetter({ letter, index, t, start = 0, duration = 0.4, length = QUESTION.length }) {
  const from = start + index / length * duration;
  const opacity = useTransform(t, [from, from + duration / length / 2], [0, 1]);
  return <motion.tspan style={{ opacity }}>{letter}</motion.tspan>;
}

function Factor({ label, index, t }) {
  const scaleX = useTransform(t, [0.4 + index * 0.08, 0.56 + index * 0.08], [0, 1]);
  return <g>
    <text x="28" y={100 + index * 29} className="home-intro-svg-muted" fontSize="13">{label}</text>
    <motion.path d={`M335 ${96 + index * 29}H${460 - index * 18}`} stroke="currentColor" strokeOpacity="0.4" strokeWidth="3" style={{ scaleX, originX: 0 }} />
  </g>;
}

function Advisor({ t, state }) {
  const answer = QUESTIONS[state.question];
  const question = answer?.question ?? QUESTION;
  const factors = answer?.factors ?? FACTORS;
  const opacity = useTransform(t, [0.35, 0.5], [0, 1]);
  return <Art>
    <motion.g style={{ opacity }}>
      <rect x="12" y="24" width="496" height="179" rx="6" fill="black" stroke="rgba(255,255,255,0.1)" />
      <text x="28" y="59" fill="currentColor" fontSize="15">{answer?.summary ?? 'AAPL adds technology exposure to this sample portfolio.'}</text>
      {factors.map((label, index) => <Factor key={label} label={label} index={index} t={t} />)}
    </motion.g>
    <text x="12" y="232" fill="currentColor" fontSize="23" fontWeight="300">
      {question.split('').map((letter, index) => <TypedLetter key={index} letter={letter} index={index} length={question.length} t={t} />)}
    </text>
    <text x="12" y="270" className="home-intro-svg-muted" fontSize="12">Try a sample question</text>
    {['Portfolio concentration', 'MSFT revenue', 'NVDA volatility'].map((label, index) => <g key={label}>
      <rect x={12 + index * 168} y="288" width="158" height="40" rx="20" stroke="currentColor" strokeOpacity="0.2" />
      <text x={91 + index * 168} y="312" textAnchor="middle" fill="currentColor" fontSize="11">{label}</text>
    </g>)}
  </Art>;
}

function ProfileChip({ label, index, t, selected }) {
  const opacity = useTransform(t, p => selected === undefined ? 0.25 + 0.75 * Math.min(1, Math.max(0, (p - 0.15 - index * 0.17) / 0.15)) : selected ? 1 : 0.25);
  return <motion.g style={{ opacity }}>
    <rect x={12 + index * 168} y="100" width="152" height="42" rx="21" stroke="currentColor" strokeOpacity="0.2" />
    <text x={88 + index * 168} y="126" textAnchor="middle" fill="currentColor" fontSize="14">{label}</text>
  </motion.g>;
}

function Profile({ t, state }) {
  const x = useTransform(t, p => 22 + 476 * (state.risk === null ? Math.min(1, p / 0.8) : state.risk / 100));
  const usdOpacity = useTransform(t, p => state.currency ? Number(state.currency === 'USD') : 1 - Math.min(1, Math.max(0, (p - 0.55) / 0.15)));
  const eurOpacity = useTransform(t, p => state.currency ? Number(state.currency === 'EUR') : Math.min(1, Math.max(0, (p - 0.55) / 0.15)));
  const value = useTransform(t, p => formatCurrency(state.currency ?? (p >= 0.7 ? 'EUR' : 'USD')));
  return <Art>
    <text x="12" y="63" className="home-intro-svg-muted" fontSize="14">Investment goals</text>
    {['Retirement', 'House', 'Education'].map((label, index) => <ProfileChip key={label} label={label} index={index} t={t} selected={state.goals[index]} />)}
    <text x="12" y="205" className="home-intro-svg-muted" fontSize="14">Risk tolerance</text>
    <motion.circle cx="0" cy="240" r="8" fill="currentColor" stroke="black" strokeWidth="3" style={{ x }} />
    <text x="12" y="274" className="home-intro-svg-muted" fontSize="14">Conservative</text>
    <text x="508" y="274" textAnchor="end" className="home-intro-svg-muted" fontSize="14">Growth</text>
    <motion.text x="12" y="327" fill="currentColor" fontSize="14">{value}</motion.text>
    {['USD', 'EUR', 'GBP'].map((currency, index) => <g key={currency}>
      <rect x={238 + index * 47} y="305" width="47" height="36" rx="6" stroke="currentColor" strokeOpacity="0.2" />
      <text x={261.5 + index * 47} y="327" textAnchor="middle" fill="currentColor" fontSize="12">{currency}</text>
    </g>)}
    {state.currency === 'GBP' && <text x="508" y="327" textAnchor="end" fill="currentColor" fontSize="19">GBP</text>}
    <motion.text x="508" y="327" textAnchor="end" fill="currentColor" fontSize="19" style={{ opacity: usdOpacity }}>USD</motion.text>
    <motion.text x="508" y="327" textAnchor="end" fill="currentColor" fontSize="19" style={{ opacity: eurOpacity }}>EUR</motion.text>
  </Art>;
}

function GainBar({ t, index, value, wide }) {
  const scaleY = useTransform(t, [index * 0.07, 0.3 + index * 0.07], [0, 1]);
  return <motion.rect x={24 + index * (wide ? 130 : 78)} y={240 - value * 14} width="48" height={value * 14} fill="#5FBF93" style={{ scaleY, originX: 0.5, originY: 1, transformOrigin: '50% 100%' }} />;
}

function LossBar({ t, index, value, wide }) {
  const scaleY = useTransform(t, [0.15 + index * 0.07, 0.45 + index * 0.07], [0, 1]);
  return <motion.rect x={(wide ? 450 : 270) + index * (wide ? 130 : 78)} y="240" width="48" height={value * 14} fill="#E07A6A" style={{ scaleY, originX: 0.5, originY: 0, transformOrigin: '50% 0%' }} />;
}

function Insights({ t, state, wide }) {
  const detail = state.bar === null ? ['NVDA', '+4.8%', EXPLANATION] : BAR_DETAILS[state.bar];
  const explanation = detail[2];
  const split = wide ? explanation.length : explanation.lastIndexOf(' ', 55);
  const lines = wide ? [explanation] : [explanation.slice(0, split + 1), explanation.slice(split + 1)];
  const scaleY = useTransform(t, [0.5, 0.65], [0, 1]);
  return <Art wide={wide}>
    <motion.g style={{ scaleY, originY: 1 }}>
      <rect x="12" y="16" width={wide ? 856 : 496} height="85" rx="5" fill="black" stroke="rgba(255,255,255,0.1)" />
      <text x="26" y="46" fill="currentColor" fontSize="17">{detail[0]} · {detail[1]}</text>
      {lines.map((line, row) => <text key={row} x="26" y={wide ? 77 : 65 + row * 20} className="home-intro-svg-muted" fontSize={wide ? 12 : 14}>
        {line.split('').map((letter, index) => <TypedLetter key={index} letter={letter} index={index + (row ? split + 1 : 0)} length={explanation.length} start={0.58} duration={0.24} t={t} />)}
      </text>)}
    </motion.g>
    {GAINERS.map(([ticker, value], index) => <g key={ticker}>
      <GainBar t={t} index={index} value={value} wide={wide} />
      <text x={48 + index * (wide ? 130 : 78)} y="225" textAnchor="middle" fill="black" fontSize={wide ? 11 : 14}>{ticker}</text>
      <text x={48 + index * (wide ? 130 : 78)} y={230 - value * 14} textAnchor="middle" fill="#5FBF93" fontSize="13">+{value}%</text>
    </g>)}
    {LOSERS.map(([ticker, value], index) => <g key={ticker}>
      <LossBar t={t} index={index} value={value} wide={wide} />
      <text x={(wide ? 474 : 294) + index * (wide ? 130 : 78)} y="227" textAnchor="middle" className="home-intro-svg-muted" fontSize={wide ? 11 : 14}>{ticker}</text>
      <text x={(wide ? 474 : 294) + index * (wide ? 130 : 78)} y={260 + value * 14} textAnchor="middle" fill="#E07A6A" fontSize="13">−{value}%</text>
    </g>)}
    <text x="12" y={wide ? 298 : 330} className="home-intro-svg-muted" fontSize={wide ? 12 : 14}>Session change · Sample data</text>
  </Art>;
}

function Controls({ scene, t, state, onAction, active, onFocus, wide = false }) {
  const step = useIntroStep(t);
  const drag = useRef(null);
  const position = (x, y, w, h) => ({ '--x': `${x / (wide ? 880 : 520) * 100}%`, '--y': `${y / (wide ? 300 : 360) * 100}%`, '--w': `${w / (wide ? 880 : 520) * 100}%`, '--h': `${h / (wide ? 300 : 360) * 100}%` });
  const common = {
    'data-intro-interactive': true,
    type: 'button',
    className: `home-intro-control ${active ? 'pointer-events-auto' : 'pointer-events-none'}`,
    onFocus,
  };
  const point = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };
  const risk = state.risk ?? Math.round(Math.min(100, step / 0.8));
  const setRisk = event => onAction({ type: 'risk', value: point(event).x * 100 });
  switch (scene) {
    case 'portfolio': return PORTFOLIOS.map((row, index) => <button {...common} key={row.name} style={position(12, 43 + index * 57, 488, 54)} aria-label={row.name} aria-pressed={state.selected === index}
      onClick={() => onAction({ type: 'select', index })}
      onPointerEnter={event => { if (event.pointerType === 'mouse') onAction({ type: 'hover', index }); }}
      onPointerLeave={() => onAction({ type: 'hover', index: null })}
      onFocus={() => { onFocus?.(); onAction({ type: 'hover', index }); }} onBlur={() => onAction({ type: 'hover', index: null })} />);
    case 'stock-data': return <>
      {['1D', '1M', '1Y'].map((label, index) => <button {...common} key={label} style={position(335 + index * 57, 12, 47, 27)} aria-label={label} aria-pressed={(state.timeframe ?? ['1D', '1M', '1Y'][Math.min(2, Math.floor(step / 100 * 3))]) === label} onClick={() => onAction({ type: 'timeframe', value: label })} />)}
      <button {...common} style={position(12, 60, 496, 250)} aria-label="Inspect sample candle; use arrow keys"
        onPointerMove={event => { if (event.pointerType === 'mouse') onAction({ type: 'crosshair', value: point(event).x }); }}
        onClick={event => onAction({ type: 'crosshair', value: event.detail ? point(event).x : ((state.crosshair ?? step / 100) + 1 / 12) % 1 })}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); onAction({ type: 'crosshair', value: sliderKey((state.crosshair ?? step / 100) * 100, event.key) / 100 }); } }} />
    </>;
    case 'ai-analysis': return <>
      <button {...common} style={position(wide ? 12 : 6, 32, wide ? 520 : 260, 200)} aria-label="Explore sample stock field; use arrow keys" aria-pressed={state.pinned}
        onPointerMove={event => { if (event.pointerType === 'mouse') { const p = point(event); onAction({ type: 'dot', index: dotAt(p.x, p.y).index }); } }}
        onPointerLeave={() => onAction({ type: 'dot', index: null })}
        onClick={event => { const p = point(event); onAction({ type: 'pin', index: event.detail ? dotAt(p.x, p.y).index : state.dot ?? 0 }); }}
        onKeyDown={event => {
          const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -40, ArrowDown: 40 }[event.key];
          if (delta !== undefined) { event.preventDefault(); onAction({ type: 'pin', index: Math.min(999, Math.max(0, (state.dot ?? 0) + delta)) }); }
        }} />
      {SHORTLIST.map(([ticker], index) => <button {...common} key={ticker} style={position(wide ? 560 : 286, 44 + index * 36, wide ? 308 : 222, 34)} aria-label={`${ticker} risk note`} aria-expanded={state.note === index} onClick={() => onAction({ type: 'note', index })} />)}
    </>;
    case 'advisor': return QUESTIONS.map((question, index) => <button {...common} key={question.question} style={position(12 + index * 168, 288, 158, 40)} aria-label={question.question} aria-pressed={state.question === index} onClick={() => onAction({ type: 'question', index })} />);
    case 'profile': return <>
      {['Retirement', 'House', 'Education'].map((label, index) => {
        const selected = state.goals[index] ?? step / 100 >= 0.3 + index * 0.17;
        return <button {...common} key={label} style={position(12 + index * 168, 100, 152, 42)} aria-label={label} aria-pressed={selected} onClick={() => onAction({ type: 'goal', index, current: selected })} />;
      })}
      <div data-intro-interactive="slider" role="slider" tabIndex={0} aria-label="Risk tolerance" aria-valuemin={0} aria-valuemax={100} aria-valuenow={risk} aria-valuetext={`${risk}% toward Growth`} className={common.className} style={position(12, 220, 496, 40)} onFocus={onFocus}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); onAction({ type: 'risk', value: sliderKey(risk, event.key) }); } }}
        onPointerDown={event => { if (drag.current !== null || !event.isPrimary) return; drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); setRisk(event); }}
        onPointerMove={event => { if (drag.current === event.pointerId) setRisk(event); }}
        onPointerUp={event => { if (drag.current === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
      {['USD', 'EUR', 'GBP'].map((currency, index) => <button {...common} key={currency} style={position(238 + index * 47, 305, 47, 36)} aria-label={currency} aria-pressed={(state.currency ?? (step >= 70 ? 'EUR' : 'USD')) === currency} onClick={() => onAction({ type: 'currency', value: currency })} />)}
    </>;
    case 'insights': return BAR_DETAILS.map(([ticker], index) => <button {...common} key={ticker} style={position(index < 3 ? (wide ? 440 : 260) + index * (wide ? 130 : 78) : 14 + (index - 3) * (wide ? 130 : 78), index < 3 ? 220 : 140, 68, index < 3 ? 64 : 100)} aria-label={`${ticker} session explanation`} aria-expanded={state.bar === index}
      onClick={() => onAction({ type: 'bar', index })} onPointerEnter={event => { if (event.pointerType === 'mouse') onAction({ type: 'bar', index }); }} />);
    default: return null;
  }
}

export default function IntroIllustration({ scene, t, state = INITIAL_STATE[scene], onAction = () => {}, active = true, reduced = false, onFocus }) {
  const desktop = useSyncExternalStore(subscribeDesktopArt, getDesktopArt, getDesktopArt);
  const wide = desktop && !reduced && (scene === 'ai-analysis' || scene === 'insights');
  const typing = useMotionValue(0);
  const question = state?.question;
  useEffect(() => {
    if (scene !== 'advisor' || question == null || reduced) return;
    typing.set(0);
    const animation = animate(typing, 1, { duration: 0.8, ease: 'linear' });
    return () => animation.stop();
  }, [scene, question, reduced, typing]);
  const reveal = useTransform(() => {
    const progress = t.get();
    if (scene === 'advisor' && question != null) return reduced ? 1 : typing.get();
    if (scene === 'portfolio' && (state.selected !== null || state.hovered !== null)
      || scene === 'stock-data' && state.timeframe !== null
      || scene === 'ai-analysis' && state.note !== null
      || scene === 'insights' && state.bar !== null) return 1;
    return progress;
  });
  const rotateX = useSpring(0, { stiffness: 120, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 120, damping: 24 });
  const tiltBounds = useRef(null);
  const components = { portfolio: Portfolio, 'stock-data': StockData, 'ai-analysis': AIAnalysis, advisor: Advisor, profile: Profile, insights: Insights };
  const Illustration = components[scene];
  if (!Illustration) return null;
  return <motion.div className={`home-intro-art-content ${active ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY }}
    onPointerEnter={event => { if (active && !reduced && event.pointerType === 'mouse') tiltBounds.current = event.currentTarget.getBoundingClientRect(); }}
    onPointerMove={event => {
      if (!active || reduced || event.pointerType !== 'mouse' || !tiltBounds.current) return;
      const rect = tiltBounds.current;
      const tilt = getTilt((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      rotateX.set(tilt.rotateX); rotateY.set(tilt.rotateY);
    }} onPointerLeave={() => { rotateX.set(0); rotateY.set(0); tiltBounds.current = null; }}>
    <Illustration t={reveal} state={state} wide={wide} />
    <Controls scene={scene} t={t} state={state} onAction={onAction} active={active} onFocus={onFocus} wide={wide} />
  </motion.div>;
}
