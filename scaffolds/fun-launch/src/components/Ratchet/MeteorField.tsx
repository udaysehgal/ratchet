import { useEffect, useRef } from 'react';

/**
 * Hero backdrop: meteor trails sweeping along wide elliptical orbits, drawn in the
 * theme's primary color. Renders one still frame when reduced motion is requested.
 */
export function MeteorField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const rgb = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim()
      .split(/\s+/)
      .join(',');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Deterministic orbits so the composition is stable between loads
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const orbits = Array.from({ length: 150 }, (_, i) => ({
      r: 0.3 + (i / 150) * 0.95 + rand() * 0.04,
      head: rand() * Math.PI * 2,
      speed: 0.0009 + rand() * 0.0022,
      length: 0.6 + rand() * 1.4,
      width: 0.5 + rand() * 2.2,
      alpha: 0.25 + rand() * 0.75,
    }));

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const SEGMENTS = 18;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const cx = w * 0.92;
      const cy = h * 0.15;
      const scale = Math.max(w, h) * 0.75;
      for (const o of orbits) {
        if (!still) o.head += o.speed;
        const rx = o.r * scale;
        const ry = rx * 0.32;
        for (let s = 0; s < SEGMENTS; s++) {
          const a0 = o.head - (o.length * s) / SEGMENTS;
          const a1 = o.head - (o.length * (s + 1)) / SEGMENTS;
          const fade = 1 - s / SEGMENTS;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, -0.38, a1, a0);
          // Soft halo, then the bright core
          ctx.strokeStyle = `rgba(${rgb},${o.alpha * fade * fade * 0.18})`;
          ctx.lineWidth = o.width * 6 * fade;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${rgb},${o.alpha * fade * fade})`;
          ctx.lineWidth = o.width * (0.4 + fade);
          ctx.stroke();
        }
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
