import { useEffect, useRef } from 'react';

/**
 * Calls `onFrame(dt)` once per display frame while `running`. The callback
 * can change every render without restarting the loop.
 */
export function useGameLoop(running: boolean, onFrame: (dt: number) => void) {
  const cb = useRef(onFrame);
  useEffect(() => {
    cb.current = onFrame;
  });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (dt > 0) cb.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}
