import { useState } from 'react';
import { useMotionValue } from 'motion/react';
import { FEATURE_PHASES } from './introPhases';
import { INITIAL_STATE, reduceInteraction } from './introInteractions';
import IntroCta from './IntroCta';
import IntroIllustration from './IntroIllustrations';
import './homeIntro.css';

function ListScene({ phase, index }) {
  const t = useMotionValue(1);
  const [state, setState] = useState(INITIAL_STATE[phase.key]);
  return (
    <section data-intro-scene={phase.key} className={`home-intro-list-scene ${phase.layout === 'C' ? 'home-intro-wide' : ''}`}>
      <div data-intro-copy className="home-intro-copy">
        <h2 data-intro-heading className="font-light text-[28px] lg:text-[40px] tracking-tight">{phase.title}</h2>
        <p className="text-base leading-relaxed">{phase.description}</p>
        <IntroCta phase={phase} index={index} variant="static" />
      </div>
      <div data-intro-art className="home-intro-list-art">
        <div className="home-intro-list-baseline" aria-hidden="true" />
        <IntroIllustration scene={phase.key} t={t} state={state} onAction={action => setState(current => reduceInteraction(phase.key, current, action))} reduced />
      </div>
    </section>
  );
}

export default function IntroSceneList() {
  return <div className="home-intro-list relative">
    {FEATURE_PHASES.map((phase, index) => <ListScene key={phase.key} phase={phase} index={index} />)}
  </div>;
}
