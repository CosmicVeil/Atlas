import { Link } from 'react-router-dom';

export default function IntroCta({ phase, index, active = true, scrollToScene, variant }) {
  return (
    <Link
      data-intro-cta
      to={phase.route}
      onFocus={() => { if (!active) scrollToScene(index); }}
      className={`home-intro-cta ${variant === 'static' ? 'home-intro-cta--static' : active ? 'is-active' : ''} ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      {phase.cta}
    </Link>
  );
}
