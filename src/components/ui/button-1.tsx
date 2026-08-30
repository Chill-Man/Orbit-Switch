import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Star } from 'lucide-react';
import './button-1.css';

type ColorKey =
  | 'color1'
  | 'color2'
  | 'color3'
  | 'color4'
  | 'color5'
  | 'color6'
  | 'color7'
  | 'color8'
  | 'color9'
  | 'color10'
  | 'color11'
  | 'color12'
  | 'color13'
  | 'color14'
  | 'color15'
  | 'color16'
  | 'color17';

export type Colors = Record<ColorKey, string>;

const COLORS: Colors = {
  color1: '#FFFFFF',
  color2: '#1E10C5',
  color3: '#9089E2',
  color4: '#FCFCFE',
  color5: '#F9F9FD',
  color6: '#B2B8E7',
  color7: '#0E2DCB',
  color8: '#0017E9',
  color9: '#4743EF',
  color10: '#7D7BF4',
  color11: '#0B06FC',
  color12: '#C5C1EA',
  color13: '#1403DE',
  color14: '#B6BAF6',
  color15: '#C1BEEB',
  color16: '#290ECB',
  color17: '#3F4CC0',
};

const svgOrder = ['svg1', 'svg2', 'svg3', 'svg4', 'svg3', 'svg2', 'svg1'] as const;
type SvgKey = (typeof svgOrder)[number];
type Stop = { offset: number; stopColor: string };
type SvgState = { gradientTransform: string; stops: Stop[] };
type SvgStates = Record<SvgKey, SvgState>;

function createStopsArray(svgStates: SvgStates, maxStops: number): Stop[][] {
  return Array.from({ length: maxStops }, (_, index) => svgOrder.map((svgKey) => {
    const svg = svgStates[svgKey];
    return svg.stops[index] || svg.stops[svg.stops.length - 1];
  }));
}

interface GradientSvgProps {
  className: string;
  isHovered: boolean;
  colors: Colors;
}

function GradientSvg({ className, isHovered, colors }: GradientSvgProps) {
  const reduceMotion = useReducedMotion();
  const gradientId = `liquid-${useId().replace(/:/g, '')}`;
  const svgStates: SvgStates = {
    svg1: {
      gradientTransform: 'translate(287.5 280) rotate(-29.0546) scale(689.807 1000)',
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.188423, stopColor: colors.color2 },
        { offset: 0.260417, stopColor: colors.color3 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.328992, stopColor: colors.color1 },
        { offset: 0.442708, stopColor: colors.color6 },
        { offset: 0.537556, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.725645, stopColor: colors.color8 },
        { offset: 0.817779, stopColor: colors.color9 },
        { offset: 0.84375, stopColor: colors.color10 },
        { offset: 0.90569, stopColor: colors.color1 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
    svg2: {
      gradientTransform: 'translate(126.5 418.5) rotate(-64.756) scale(533.444 773.324)',
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.104167, stopColor: colors.color12 },
        { offset: 0.182292, stopColor: colors.color13 },
        { offset: 0.28125, stopColor: colors.color1 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.453125, stopColor: colors.color6 },
        { offset: 0.515625, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.692708, stopColor: colors.color8 },
        { offset: 0.75, stopColor: colors.color14 },
        { offset: 0.817708, stopColor: colors.color9 },
        { offset: 0.869792, stopColor: colors.color10 },
        { offset: 1, stopColor: colors.color1 },
      ],
    },
    svg3: {
      gradientTransform: 'translate(264.5 339.5) rotate(-42.3022) scale(946.451 1372.05)',
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.188423, stopColor: colors.color2 },
        { offset: 0.307292, stopColor: colors.color1 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.442708, stopColor: colors.color15 },
        { offset: 0.537556, stopColor: colors.color16 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.725645, stopColor: colors.color17 },
        { offset: 0.817779, stopColor: colors.color9 },
        { offset: 0.84375, stopColor: colors.color10 },
        { offset: 0.90569, stopColor: colors.color1 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
    svg4: {
      gradientTransform: 'translate(860.5 420) rotate(-153.984) scale(957.528 1388.11)',
      stops: [
        { offset: 0.109375, stopColor: colors.color11 },
        { offset: 0.171875, stopColor: colors.color2 },
        { offset: 0.260417, stopColor: colors.color13 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.328992, stopColor: colors.color1 },
        { offset: 0.442708, stopColor: colors.color6 },
        { offset: 0.515625, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.692708, stopColor: colors.color8 },
        { offset: 0.817708, stopColor: colors.color9 },
        { offset: 0.869792, stopColor: colors.color10 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
  };

  const maxStops = Math.max(...Object.values(svgStates).map((svg) => svg.stops.length));
  const stopsAnimationArray = createStopsArray(svgStates, maxStops);
  const gradientTransform = svgOrder.map((svgKey) => svgStates[svgKey].gradientTransform);
  const animatedGradient = reduceMotion
    ? { gradientTransform: svgStates.svg1.gradientTransform }
    : {
        gradientTransform,
        transition: { duration: isHovered ? 50 : 10, repeat: Infinity, ease: 'linear' as const },
      };

  return (
    <svg className={className} width="1030" height="280" viewBox="0 0 1030 280" fill="none" aria-hidden="true">
      <rect width="1030" height="280" rx="140" fill={`url(#${gradientId})`} />
      <defs>
        <motion.radialGradient
          id={gradientId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          animate={animatedGradient}
        >
          {stopsAnimationArray.map((stopConfigs, index) => (
            <AnimatePresence key={index}>
              <motion.stop
                initial={{ offset: stopConfigs[0].offset, stopColor: stopConfigs[0].stopColor }}
                animate={reduceMotion ? {
                  offset: stopConfigs[0].offset,
                  stopColor: stopConfigs[0].stopColor,
                } : {
                  offset: stopConfigs.map((config) => config.offset),
                  stopColor: stopConfigs.map((config) => config.stopColor),
                }}
                transition={{ duration: 0, ease: 'linear', repeat: reduceMotion ? 0 : Infinity }}
              />
            </AnimatePresence>
          ))}
        </motion.radialGradient>
      </defs>
    </svg>
  );
}

interface LiquidProps {
  isHovered: boolean;
  colors?: Colors;
}

export function Liquid({ isHovered, colors = COLORS }: LiquidProps) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className={`liquid-button-layer liquid-button-layer--${index}`}>
          <GradientSvg className="liquid-button-layer__svg" isHovered={isHovered} colors={colors} />
        </div>
      ))}
    </>
  );
}

interface LiquidGitHubButtonProps {
  onClick(): void;
  label?: string;
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.91-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .08 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.96a9.3 9.3 0 0 1 2.5.35c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.51-.01 2.86 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function LiquidGitHubButton({ onClick, label = 'GitHub' }: LiquidGitHubButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      className="liquid-github-button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      aria-label="Открыть профиль Chill-Man на GitHub"
    >
      <span className="liquid-github-button__glow" aria-hidden="true">
        <span className="liquid-github-button__glow-base" />
        <span className="liquid-github-button__glow-liquid"><Liquid isHovered={isHovered} /></span>
      </span>
      <span className="liquid-github-button__underlay" aria-hidden="true" />
      <span className="liquid-github-button__surface" aria-hidden="true">
        <span className="liquid-github-button__base liquid-github-button__base--light" />
        <span className="liquid-github-button__base liquid-github-button__base--dark" />
        <Liquid isHovered={isHovered} />
        {[3, 3, 5, 4, 4].map((blur, index) => (
          <span
            key={`${blur}-${index}`}
            className="liquid-github-button__border-light"
            style={{ '--liquid-border-blur': `${blur}px` } as React.CSSProperties}
          />
        ))}
        <span className="liquid-github-button__blue-glow" />
      </span>
      <span className="liquid-github-button__content">
        <Star className="liquid-github-button__star" size={18} aria-hidden="true" />
        <GitHubIcon className="liquid-github-button__github" />
        <span>{label}</span>
      </span>
    </button>
  );
}
