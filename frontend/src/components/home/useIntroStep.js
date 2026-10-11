import { useEffect, useState } from 'react';
import { cancelFrame, frame } from 'motion/react';

const scheduler = {
  schedule: callback => frame.update(callback),
  cancel: cancelFrame,
};

export function subscribeIntroStep(t, onStep, { schedule, cancel } = scheduler) {
  const update = () => onStep(Math.round(t.get() * 100));
  // Derived Motion values can emit synchronously during a parent's render.
  // Publish React state on the next frame, coalescing to the latest value.
  const enqueue = () => schedule(update);
  const unsubscribe = t.on('change', enqueue);
  enqueue();
  return () => {
    unsubscribe();
    cancel(update);
  };
}

export default function useIntroStep(t) {
  const [step, setStep] = useState(() => Math.round(t.get() * 100));
  useEffect(() => subscribeIntroStep(t, setStep), [t]);
  return step;
}
