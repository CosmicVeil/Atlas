import { useMotionValue } from 'motion/react';
import { FEATURE_PHASES } from './introPhases';
import IntroCta from './IntroCta';
import IntroIllustration from './IntroIllustrations';
import './homeIntro.css';

export default function IntroSceneList() {
  const t = useMotionValue(1);
  return (
    <div className="home-intro-list relative">
      {FEATURE_PHASES.map((phase, index) => (
        <section data-intro-scene={phase.key} key={phase.key} className="home-intro-list-scene">
          <div className="home-intro-copy">
            <h2 className="font-light text-[28px] lg:text-[40px] tracking-tight">{phase.title}</h2>
            <p className="text-base leading-relaxed">{phase.description}</p>
            <IntroCta phase={phase} index={index} variant="static" />
          </div>
          <div className="home-intro-list-art">
            <div className="home-intro-list-baseline" aria-hidden="true" />
            <IntroIllustration scene={phase.key} t={t} />
          </div>
        </section>
      ))}
    </div>
  );
}
