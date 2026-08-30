import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';

const colors = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];
const shapes = ['circle', 'rect', 'rect', 'strip', 'strip'] as const;
const keyframeCount = 40;
const popWindow = 0.08;

type ParticleShape = (typeof shapes)[number];

type Particle = {
  keyframes: { transform: string[]; opacity: number[] };
  duration: number;
  size: number;
  color: string;
  shape: ParticleShape;
};

type Burst = { id: number; particles: Particle[] };

interface MotionConfettiButtonProps {
  children: ReactNode;
  onClick(): void;
  ariaLabel?: string;
  particleCount?: number;
  duration?: number;
}

function buildKeyframes({
  angle,
  startVelocity,
  decay,
  gravity,
  drift,
  wobbleSpeed,
  wobbleOffset,
  size,
  ticks,
  tiltRotations,
  rotation,
}: {
  angle: number;
  startVelocity: number;
  decay: number;
  gravity: number;
  drift: number;
  wobbleSpeed: number;
  wobbleOffset: number;
  size: number;
  ticks: number;
  tiltRotations: number;
  rotation: number;
}) {
  const transforms: string[] = [];
  const opacities: number[] = [];
  let velocity = startVelocity;
  let x = 0;
  let y = 0;
  let wobble = wobbleOffset;
  let tick = 0;

  for (let index = 0; index <= keyframeCount; index++) {
    const progress = index / keyframeCount;
    if (index > 0) {
      const targetTick = Math.round((index * ticks) / keyframeCount);
      while (tick < targetTick) {
        x += Math.cos(angle) * velocity + drift;
        y += Math.sin(angle) * velocity + gravity * 3;
        velocity *= decay;
        wobble += wobbleSpeed;
        tick++;
      }
    }

    const translateX = index === 0 ? 0 : x + Math.cos(wobble) * 15 * size;
    const scale = progress < popWindow * 0.6
      ? (progress / (popWindow * 0.6)) * 1.15
      : progress < popWindow
        ? 1.15 - ((progress - popWindow * 0.6) / (popWindow * 0.4)) * 0.15
        : 1;
    const opacity = progress <= 0.5
      ? 1
      : progress <= 0.8
        ? 1 - ((progress - 0.5) / 0.3) * 0.5
        : 0.5 - ((progress - 0.8) / 0.2) * 0.5;

    transforms.push(`translate(${translateX}px, ${y}px) scale(${scale}) rotateY(${tiltRotations * 360 * progress}deg) rotate(${rotation}deg)`);
    opacities.push(opacity);
  }

  return { transform: transforms, opacity: opacities };
}

function ParticleDot({ particle }: { particle: Particle }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { keyframes, duration, size, color, shape } = particle;
  const width = shape === 'strip' ? size * 0.3 : shape === 'rect' ? size * 0.7 : size;
  const height = shape === 'strip' ? size * 2 : size;
  const borderRadius = shape === 'circle' ? '50%' : shape === 'strip' ? size * 0.12 : 2;

  useEffect(() => {
    if (!ref.current) return;
    const playback = animate(ref.current, keyframes, { duration, ease: 'linear' });
    return () => playback.cancel();
  }, [duration, keyframes]);

  return (
    <span
      ref={ref}
      className="confetti-particle"
      style={{ width, height, borderRadius, backgroundColor: color }}
    />
  );
}

function PartyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.8 11.3 2 22l10.7-3.79" />
      <path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01" />
      <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" />
      <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H17" />
      <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" />
      <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />
    </svg>
  );
}

export function MotionConfettiButton({
  children,
  onClick,
  ariaLabel,
  particleCount = 54,
  duration = 2.15,
}: MotionConfettiButtonProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);
  const cleanupTimers = useRef(new Set<number>());
  const reduceMotion = useReducedMotion();

  useEffect(() => () => {
    cleanupTimers.current.forEach((timer) => window.clearTimeout(timer));
    cleanupTimers.current.clear();
  }, []);

  const fire = () => {
    if (reduceMotion) return;
    const id = nextId.current++;
    const ticks = Math.round(duration * 60);
    const particles = Array.from({ length: particleCount }, () => {
      const spread = 105 * (Math.PI / 180);
      const angle = -Math.PI / 2 + (spread / 2 - Math.random() * spread);
      const velocity = 13 + Math.random() * 25;

      return {
        keyframes: buildKeyframes({
          angle,
          startVelocity: velocity,
          decay: 0.91,
          gravity: 1,
          drift: 0,
          wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
          wobbleOffset: Math.random() * 10,
          size: 0.82,
          ticks,
          tiltRotations: 2 + Math.random() * 4,
          rotation: Math.random() * 360,
        }),
        duration,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      } satisfies Particle;
    });

    setBursts((current) => [...current, { id, particles }]);
    const timer = window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
      cleanupTimers.current.delete(timer);
    }, (duration + 0.45) * 1000);
    cleanupTimers.current.add(timer);
  };

  return (
    <span className="confetti-root">
      <span className="confetti-bursts" aria-hidden="true">
        {bursts.map((burst) => (
          <span key={burst.id} className="confetti-burst">
            {burst.particles.map((particle, index) => <ParticleDot key={index} particle={particle} />)}
          </span>
        ))}
      </span>
      <motion.button
        type="button"
        className="confetti-trigger"
        aria-label={ariaLabel}
        whileHover={reduceMotion ? undefined : { scale: 1.035 }}
        whileTap={reduceMotion ? undefined : { scale: 0.965 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        onClick={() => {
          fire();
          onClick();
        }}
      >
        <PartyIcon />
        <span>{children}</span>
      </motion.button>
    </span>
  );
}
