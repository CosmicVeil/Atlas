import { Link } from 'react-router-dom';

const percent = (value, wide, axis) => `${value / (axis === 'x' ? (wide ? 880 : 520) : (wide ? 300 : 360)) * 100}%`;

// The labelled call to action. With a spec it sits at the end of the leader line
// that runs from the scene's pulsing beacon; its right edge meets the line.
export default function IntroCta({ phase, index, active = true, scrollToScene, variant, spec, wide = false }) {
  const style = spec ? { '--edge': percent(spec.pill.edge, wide, 'x'), '--py': percent(spec.pill.y, wide, 'y') } : undefined;
  return (
    <Link
      data-intro-cta
      to={phase.route}
      onFocus={() => { if (!active) scrollToScene(index); }}
      style={style}
      className={`home-intro-cta ${spec ? 'home-intro-cta--anchored' : ''} ${variant === 'static' ? 'home-intro-cta--static' : active ? 'is-active' : ''} ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      {phase.cta}
    </Link>
  );
}

// The pulsing data point itself is clickable too. It repeats the labelled link,
// so it stays out of the tab order and the accessibility tree.
export function IntroBeacon({ phase, spec, wide = false, active = true }) {
  return (
    <Link
      data-intro-beacon
      to={phase.route}
      tabIndex={-1}
      aria-hidden="true"
      style={{ '--ax': percent(spec.anchor.x, wide, 'x'), '--ay': percent(spec.anchor.y, wide, 'y') }}
      className={`home-intro-cta-beacon ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
    />
  );
}
