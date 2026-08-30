import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

interface LiquidGlassCardProps {
  children: ReactNode;
  enabled: boolean;
  className?: string;
  cornerRadius?: number;
}

type LiquidGlassStyle = CSSProperties & {
  '--liquid-glass-radius'?: string;
  '--orbit-glass-pointer-x'?: string;
  '--orbit-glass-pointer-y'?: string;
  '--orbit-glass-glare-opacity'?: string;
};

type PointerHighlight = { x: number; y: number; opacity: number };

// The layer structure follows 21st.dev's "Glass Button" by Easemize. Its
// button semantics are intentionally replaced by a neutral container because
// an account card already contains several independent controls.
export function LiquidGlassCard({
  children,
  enabled,
  className = '',
  cornerRadius = 32,
}: LiquidGlassCardProps) {
  const pointerRectRef = useRef<DOMRect | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerTargetRef = useRef<HTMLDivElement | null>(null);
  const pointerPositionRef = useRef<PointerHighlight>({ x: 0, y: 0, opacity: 0 });

  const style: LiquidGlassStyle = {
    '--liquid-glass-radius': `${cornerRadius}px`,
    '--orbit-glass-pointer-x': '50%',
    '--orbit-glass-pointer-y': '0px',
    '--orbit-glass-glare-opacity': '0',
  };

  const schedulePointerHighlight = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const rect = pointerRectRef.current || target.getBoundingClientRect();
    const localX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const localY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const deltaX = localX - halfWidth;
    const deltaY = localY - halfHeight;
    const edgeRatio = Math.max(
      halfWidth ? Math.abs(deltaX) / halfWidth : 0,
      halfHeight ? Math.abs(deltaY) / halfHeight : 0,
    );

    // Project the cursor direction onto the card perimeter so the highlight is
    // always visible on the nearest edge instead of disappearing in the middle.
    const edgeX = edgeRatio > 0.001 ? halfWidth + deltaX / edgeRatio : halfWidth;
    const edgeY = edgeRatio > 0.001 ? halfHeight + deltaY / edgeRatio : 0;
    const distanceToEdge = Math.max(0, Math.min(localX, rect.width - localX, localY, rect.height - localY));
    const fadeDistance = Math.max(48, Math.min(128, Math.min(rect.width, rect.height) * 0.42));
    const proximity = 1 - Math.min(distanceToEdge / fadeDistance, 1);
    const glareOpacity = proximity * proximity * (3 - 2 * proximity);

    pointerTargetRef.current = target;
    pointerPositionRef.current = { x: edgeX, y: edgeY, opacity: glareOpacity };

    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      const node = pointerTargetRef.current;
      const position = pointerPositionRef.current;
      if (node?.isConnected) {
        node.style.setProperty('--orbit-glass-pointer-x', `${position.x.toFixed(2)}px`);
        node.style.setProperty('--orbit-glass-pointer-y', `${position.y.toFixed(2)}px`);
        node.style.setProperty('--orbit-glass-glare-opacity', position.opacity.toFixed(3));
      }
      pointerFrameRef.current = null;
    });
  }, []);

  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerRectRef.current = event.currentTarget.getBoundingClientRect();
    schedulePointerHighlight(event);
  }, [schedulePointerHighlight]);

  const handlePointerLeave = useCallback(() => {
    pointerTargetRef.current?.style.setProperty('--orbit-glass-glare-opacity', '0');
    pointerRectRef.current = null;
    pointerTargetRef.current = null;
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  if (!enabled) {
    return <div className={`liquid-glass-host ${className}`} style={style}>{children}</div>;
  }

  return (
    <div
      className={`glass-button-wrap liquid-glass-card-wrap ${className}`}
      style={style}
      onPointerEnter={handlePointerEnter}
      onPointerMove={schedulePointerHighlight}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      <div className="glass-button liquid-glass-card">
        <div className="glass-button-text liquid-glass-card__content">{children}</div>
        <div className="liquid-glass-card__cursor-glare" aria-hidden="true" />
      </div>
      <div className="glass-button-shadow liquid-glass-card__shadow" aria-hidden="true" />
    </div>
  );
}
