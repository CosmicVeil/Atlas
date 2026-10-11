import { useCallback, useEffect } from 'react';
import { useMotionValue } from 'motion/react';
import { getSceneScrollProgress, getWrapperProgress, progressToScrollY } from './introPhases.js';

// Measure the window, not the non-scrolling overflow-hidden ancestors. Keep a
// single layout read per frame and write directly to Motion, without rendering.
export function subscribeIntroProgress(wrapper, progress, win = window) {
  let pending = null;
  const measure = () => {
    pending = null;
    const rect = wrapper.getBoundingClientRect();
    progress.set(getWrapperProgress(rect.top, rect.height, win.innerHeight));
  };
  const schedule = () => {
    if (pending === null) pending = win.requestAnimationFrame(measure);
  };
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  schedule();
  return () => {
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    if (pending !== null) win.cancelAnimationFrame(pending);
  };
}

export default function useIntroProgress(wrapperRef) {
  const progress = useMotionValue(0);
  useEffect(() => {
    if (!wrapperRef.current) return;
    return subscribeIntroProgress(wrapperRef.current, progress);
  }, [wrapperRef, progress]);
  const scrollToScene = useCallback((index) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    window.scrollTo({
      top: progressToScrollY(getSceneScrollProgress(index), rect.top + window.scrollY, rect.height, window.innerHeight),
      behavior: 'instant',
    });
  }, [wrapperRef]);
  return { progress, scrollToScene };
}
