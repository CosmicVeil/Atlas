import { useId } from 'react';
import { motion, useTransform } from 'motion/react';

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
  x: 12 + (index % 40) * 7.5, y: 32 + Math.floor(index / 40) * 8, shade: (index * 37) % 3,
}));
const SHORTLIST = [['AAPL', 'Low'], ['MSFT', 'Low'], ['NVDA', 'High'], ['AMZN', 'Medium'], ['GOOGL', 'Medium']];
const QUESTION = 'How does AAPL fit my portfolio?';
const FACTORS = ['Pro · Diverse revenue sources', 'Pro · Consistent cash flow', 'Con · Technology concentration', 'Con · Price volatility'];
const GAINERS = [['NVDA', 4.8], ['MSFT', 3.1], ['AAPL', 2.4]];
const LOSERS = [['XOM', 2.6], ['CVX', 1.8], ['PFE', 1.2]];
const EXPLANATION = 'NVDA rose 4.8% in this sample session, leading the group.';

function Art({ children }) {
  return <svg className="home-intro-art tabular-nums" viewBox="0 0 520 360" fill="none" aria-hidden="true">{children}</svg>;
}

function PortfolioRow({ row, index, t }) {
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
      <motion.path d={row.line} style={{ pathLength }} stroke="currentColor" strokeWidth="1.5" />
    </motion.g>
  );
}

function Portfolio({ t }) {
  const pathLength = useTransform(t, [0.1, 0.65], [0, 1]);
  const opacity = useTransform(t, [0.65, 0.82], [0, 1]);
  return <Art>
    <text x="12" y="22" className="home-intro-svg-muted" fontSize="12">Sample portfolios · USD</text>
    {PORTFOLIOS.map((row, index) => <PortfolioRow key={row.name} row={row} index={index} t={t} />)}
    <motion.path d="M12 240L90 238L160 232L230 235L300 220L370 226L440 210L500 202" style={{ pathLength }} stroke="currentColor" />
    <motion.text x="12" y="284" className="home-intro-svg-muted" fontSize="15" style={{ opacity }}>Largest holding: NVDA, 18%</motion.text>
  </Art>;
}

function Candle({ t, index, candle: [open, high, low, close] }) {
  const x = 26 + index * 42;
  const scaleY = useTransform(t, [index * 0.035, 0.2 + index * 0.035], [0, 1]);
  const priceY = price => 230 - (price - 178) * 4.5;
  return (
    <motion.g style={{ scaleY, originX: 0.5, originY: 1, transformOrigin: '50% 100%' }}>
      {/* An invisible extent makes the group's transform origin the shared axis. */}
      <rect x={x - 9} y="70" width="18" height="170" fill="transparent" />
      <path d={`M${x} ${priceY(high)}V${priceY(low)}`} stroke="currentColor" strokeOpacity="0.55" />
      <rect x={x - 9} y={priceY(Math.max(open, close))} width="18" height={Math.abs(open - close) * 4.5} fill={close >= open ? '#5FBF93' : '#E07A6A'} />
    </motion.g>
  );
}

function VolumeBar({ t, index, volume }) {
  const scaleY = useTransform(t, [index * 0.035, 0.25 + index * 0.035], [0, 1]);
  return <motion.rect x={17 + index * 42} y="240" width="18" height={volume} fill="currentColor" fillOpacity="0.16" style={{ scaleY, originX: 0.5, originY: 0, transformOrigin: '50% 0%' }} />;
}

function Timeframe({ label, index, t }) {
  const opacity = useTransform(t, p => Math.min(2, Math.floor(p * 3)) === index ? 1 : 0.35);
  return <motion.g style={{ opacity }}><rect x={335 + index * 57} y="12" width="47" height="27" rx="13" stroke="currentColor" strokeOpacity="0.2" /><text x={358 + index * 57} y="30" textAnchor="middle" fill="currentColor" fontSize="12">{label}</text></motion.g>;
}

function StockData({ t }) {
  const x = useTransform(t, [0, 1], [26, 488]);
  const readout = useTransform(t, p => {
    const [open, high, low, close] = CANDLES[Math.min(CANDLES.length - 1, Math.floor(p * CANDLES.length))];
    return `O ${open}   H ${high}   L ${low}   C ${close}`;
  });
  return <Art>
    <text x="12" y="30" fill="currentColor" fontSize="17">AAPL <tspan className="home-intro-svg-muted" fontSize="12">· Sample USD</tspan></text>
    {['1D', '1M', '1Y'].map((label, index) => <Timeframe key={label} label={label} index={index} t={t} />)}
    {[85, 135, 185].map(y => <path key={y} d={`M12 ${y}H508`} stroke="rgba(255,255,255,0.05)" />)}
    {CANDLES.map((candle, index) => <Candle key={index} t={t} index={index} candle={candle} />)}
    {CANDLES.map((candle, index) => <VolumeBar key={index} t={t} index={index} volume={candle[4]} />)}
    <motion.path d="M0 60V310" style={{ x }} stroke="currentColor" strokeOpacity="0.45" strokeDasharray="3 5" />
    <motion.text x="12" y="344" className="home-intro-svg-muted" fontSize="15">{readout}</motion.text>
  </Art>;
}

function AIAnalysis({ t }) {
  const revealId = useId();
  const fieldId = useId();
  const y = useTransform(t, [0, 0.7], [0, -212]);
  const count = useTransform(t, p => `${Math.round(Math.min(1, p / 0.7) * 1000).toLocaleString('en-US')} stocks analysed`);
  const opacity = useTransform(t, [0.6, 0.82], [0, 1]);
  const x = useTransform(t, [0.6, 0.82], [24, 0]);
  return <Art>
    <defs>
      <clipPath id={revealId}><motion.rect x="0" y="240" width="320" height="212" style={{ y }} /></clipPath>
      <g id={fieldId}>
      {['rgba(245,245,242,0.85)', 'rgba(245,245,242,0.45)', 'rgba(245,245,242,0.2)'].map((shade, index) => (
        <g key={shade} fill={shade}>
          {DOTS.filter(dot => dot.shade === index).map(dot => <rect key={`${dot.x}-${dot.y}`} x={dot.x} y={dot.y} width="3" height="3" />)}
        </g>
      ))}
      </g>
    </defs>
    <use href={`#${fieldId}`} opacity="0.12" />
    <motion.g clipPath={`url(#${revealId})`}><use href={`#${fieldId}`} /></motion.g>
    <motion.path d="M10 240H312" stroke="currentColor" style={{ y }} />
    <motion.g style={{ x, opacity }}>
      <text x="340" y="42" className="home-intro-svg-muted" fontSize="12">Sample shortlist</text>
      {SHORTLIST.map(([ticker, risk], index) => <g key={ticker}>
        <path d={`M340 ${78 + index * 36}H508`} stroke="rgba(255,255,255,0.05)" />
        <text x="340" y={68 + index * 36} fill="currentColor" fontSize="14">{ticker}</text>
        <text x="508" y={68 + index * 36} textAnchor="end" className="home-intro-svg-muted" fontSize="12">{risk} risk</text>
      </g>)}
    </motion.g>
    <motion.text x="12" y="282" fill="currentColor" fontSize="21" fontWeight="300">{count}</motion.text>
    <text x="12" y="310" className="home-intro-svg-muted" fontSize="12">Daily coverage · Sample data</text>
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

function Advisor({ t }) {
  const opacity = useTransform(t, [0.35, 0.5], [0, 1]);
  return <Art>
    <motion.g style={{ opacity }}>
      <rect x="12" y="24" width="496" height="179" rx="6" fill="black" stroke="rgba(255,255,255,0.1)" />
      <text x="28" y="59" fill="currentColor" fontSize="15">AAPL adds technology exposure to this sample portfolio.</text>
      {FACTORS.map((label, index) => <Factor key={label} label={label} index={index} t={t} />)}
    </motion.g>
    <text x="12" y="232" fill="currentColor" fontSize="23" fontWeight="300">
      {QUESTION.split('').map((letter, index) => <TypedLetter key={index} letter={letter} index={index} t={t} />)}
    </text>
    <text x="12" y="282" className="home-intro-svg-muted" fontSize="13">Portfolio context · Sample analysis</text>
  </Art>;
}

function ProfileChip({ label, index, t }) {
  const opacity = useTransform(t, [0.15 + index * 0.17, 0.3 + index * 0.17], [0.25, 1]);
  return <motion.g style={{ opacity }}>
    <rect x={12 + index * 168} y="100" width="152" height="42" rx="21" stroke="currentColor" strokeOpacity="0.2" />
    <text x={88 + index * 168} y="126" textAnchor="middle" fill="currentColor" fontSize="14">{label}</text>
  </motion.g>;
}

function Profile({ t }) {
  const x = useTransform(t, [0, 0.8], [22, 498]);
  const usdOpacity = useTransform(t, [0.55, 0.7], [1, 0]);
  const eurOpacity = useTransform(t, [0.55, 0.7], [0, 1]);
  return <Art>
    <text x="12" y="63" className="home-intro-svg-muted" fontSize="14">Investment goals</text>
    {['Retirement', 'House', 'Education'].map((label, index) => <ProfileChip key={label} label={label} index={index} t={t} />)}
    <text x="12" y="205" className="home-intro-svg-muted" fontSize="14">Risk tolerance</text>
    <motion.circle cx="0" cy="240" r="8" fill="currentColor" stroke="black" strokeWidth="3" style={{ x }} />
    <text x="12" y="274" className="home-intro-svg-muted" fontSize="14">Conservative</text>
    <text x="508" y="274" textAnchor="end" className="home-intro-svg-muted" fontSize="14">Growth</text>
    <text x="12" y="327" className="home-intro-svg-muted" fontSize="14">Display currency</text>
    <motion.text x="508" y="327" textAnchor="end" fill="currentColor" fontSize="19" style={{ opacity: usdOpacity }}>USD</motion.text>
    <motion.text x="508" y="327" textAnchor="end" fill="currentColor" fontSize="19" style={{ opacity: eurOpacity }}>EUR</motion.text>
  </Art>;
}

function GainBar({ t, index, value }) {
  const scaleY = useTransform(t, [index * 0.07, 0.3 + index * 0.07], [0, 1]);
  return <motion.rect x={24 + index * 80} y={240 - value * 20} width="48" height={value * 20} fill="#5FBF93" style={{ scaleY, originX: 0.5, originY: 1, transformOrigin: '50% 100%' }} />;
}

function LossBar({ t, index, value }) {
  const scaleY = useTransform(t, [0.15 + index * 0.07, 0.45 + index * 0.07], [0, 1]);
  return <motion.rect x={276 + index * 80} y="240" width="48" height={value * 20} fill="#E07A6A" style={{ scaleY, originX: 0.5, originY: 0, transformOrigin: '50% 0%' }} />;
}

function Insights({ t }) {
  const scaleY = useTransform(t, [0.5, 0.65], [0, 1]);
  return <Art>
    <motion.g style={{ scaleY, originY: 1 }}>
      <rect x="12" y="16" width="496" height="85" rx="5" fill="black" stroke="rgba(255,255,255,0.1)" />
      <text x="26" y="46" fill="currentColor" fontSize="17">NVDA · +4.8%</text>
      <text x="26" y="77" className="home-intro-svg-muted" fontSize="12">
        {EXPLANATION.split('').map((letter, index) => <TypedLetter key={index} letter={letter} index={index} length={EXPLANATION.length} start={0.58} duration={0.24} t={t} />)}
      </text>
    </motion.g>
    {GAINERS.map(([ticker, value], index) => <g key={ticker}>
      <GainBar t={t} index={index} value={value} />
      <text x={48 + index * 80} y="225" textAnchor="middle" fill="black" fontSize="11">{ticker}</text>
      <text x={48 + index * 80} y={230 - value * 20} textAnchor="middle" fill="#5FBF93" fontSize="13">+{value}%</text>
    </g>)}
    {LOSERS.map(([ticker, value], index) => <g key={ticker}>
      <LossBar t={t} index={index} value={value} />
      <text x={300 + index * 80} y="227" textAnchor="middle" className="home-intro-svg-muted" fontSize="11">{ticker}</text>
      <text x={300 + index * 80} y={260 + value * 20} textAnchor="middle" fill="#E07A6A" fontSize="13">−{value}%</text>
    </g>)}
    <text x="12" y="346" className="home-intro-svg-muted" fontSize="12">Session change · Sample data</text>
  </Art>;
}

export default function IntroIllustration({ scene, t }) {
  switch (scene) {
    case 'portfolio': return <Portfolio t={t} />;
    case 'stock-data': return <StockData t={t} />;
    case 'ai-analysis': return <AIAnalysis t={t} />;
    case 'advisor': return <Advisor t={t} />;
    case 'profile': return <Profile t={t} />;
    case 'insights': return <Insights t={t} />;
    default: return null;
  }
}
