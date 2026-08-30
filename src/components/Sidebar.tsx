import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChartNoAxesColumnIncreasing, Layers3, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from 'motion/react';
import orbitLogo from '../assets/orbit-logo.png';
import { api } from '../api';
import { LiquidGitHubButton } from './ui/button-1';

export type ViewName = 'accounts' | 'usage' | 'settings';

interface SidebarProps {
  current: ViewName;
  accountCount: number;
  collapsed: boolean;
  onChange(view: ViewName): void;
  onToggle(): void;
}

const nav = [
  { id: 'accounts' as const, label: 'Аккаунты', icon: Layers3 },
  { id: 'usage' as const, label: 'Лимиты', icon: ChartNoAxesColumnIncreasing },
  { id: 'settings' as const, label: 'Настройки', icon: Settings2 },
];

const NAV_ITEM_PITCH = 49;
const TOGGLE_BASE_TOP = 75;
const TOGGLE_SIZE = 30;
const TOGGLE_EDGE_GAP = 8;
const TOGGLE_STORAGE_KEY = 'orbit-sidebar-toggle-offset';

type ToggleDrag = {
  pointerId: number;
  startClientY: number;
  startOffset: number;
  moved: boolean;
};

type ToggleStyle = CSSProperties & { '--sidebar-toggle-offset': string };

function readStoredToggleOffset() {
  try {
    const value = Number(window.localStorage.getItem(TOGGLE_STORAGE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function Sidebar({ current, accountCount, collapsed, onChange, onToggle }: SidebarProps) {
  const reduceMotion = useReducedMotion();
  const sidebarRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggleDragRef = useRef<ToggleDrag | null>(null);
  const suppressToggleClickRef = useRef(false);
  const [toggleOffset, setToggleOffset] = useState(readStoredToggleOffset);
  const toggleOffsetRef = useRef(toggleOffset);
  const initialIndex = Math.max(0, nav.findIndex(({ id }) => id === current));
  const highlightTargetY = useMotionValue(initialIndex * NAV_ITEM_PITCH);
  const highlightY = useSpring(highlightTargetY, {
    stiffness: 510,
    damping: 38,
    mass: 0.74,
    restDelta: 0.01,
    restSpeed: 0.01,
  });
  const highlightVelocity = useVelocity(highlightY);
  const highlightScaleY = useTransform(
    highlightVelocity,
    [-1200, -360, 0, 360, 1200],
    [1.2, 1.08, 1, 1.08, 1.2],
  );
  const highlightScaleX = useTransform(
    highlightVelocity,
    [-1200, -360, 0, 360, 1200],
    [0.94, 0.975, 1, 0.975, 0.94],
  );
  const highlightRadius = useTransform(
    highlightVelocity,
    [-1200, -360, 0, 360, 1200],
    [18, 16, 14, 16, 18],
  );

  const clampToggleOffset = useCallback((offset: number) => {
    const sidebarHeight = sidebarRef.current?.clientHeight || 0;
    const minimum = TOGGLE_EDGE_GAP - TOGGLE_BASE_TOP;
    const maximum = sidebarHeight
      ? Math.max(minimum, sidebarHeight - TOGGLE_BASE_TOP - TOGGLE_SIZE - TOGGLE_EDGE_GAP)
      : Math.max(minimum, offset);
    return Math.min(Math.max(offset, minimum), maximum);
  }, []);

  const renderToggleOffset = useCallback((offset: number) => {
    toggleOffsetRef.current = offset;
    toggleRef.current?.style.setProperty('--sidebar-toggle-offset', `${offset}px`);
  }, []);

  const commitToggleOffset = useCallback((offset: number) => {
    const clamped = clampToggleOffset(offset);
    renderToggleOffset(clamped);
    setToggleOffset(clamped);
    try {
      window.localStorage.setItem(TOGGLE_STORAGE_KEY, String(Math.round(clamped)));
    } catch {
      // The button remains draggable even when storage is unavailable.
    }
  }, [clampToggleOffset, renderToggleOffset]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const keepInsideSidebar = () => {
      const currentOffset = toggleOffsetRef.current;
      const clampedOffset = clampToggleOffset(currentOffset);
      if (Math.abs(clampedOffset - currentOffset) > 0.5) commitToggleOffset(clampedOffset);
    };
    keepInsideSidebar();
    if (typeof ResizeObserver === 'undefined') return;
    let previousHeight = sidebar.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextHeight = sidebar.clientHeight;
      if (Math.abs(nextHeight - previousHeight) < 0.5) return;
      previousHeight = nextHeight;
      keepInsideSidebar();
    });
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [clampToggleOffset, commitToggleOffset]);

  useLayoutEffect(() => {
    const target = navRef.current?.querySelector<HTMLElement>(`[data-sidebar-view="${current}"]`);
    if (!target) return;

    const targetY = target.offsetTop;
    if (reduceMotion) {
      highlightTargetY.jump(targetY);
      highlightY.set(targetY);
      return;
    }
    highlightTargetY.set(targetY);
  }, [current, highlightTargetY, highlightY, reduceMotion]);

  const handleTogglePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const startOffset = clampToggleOffset(toggleOffsetRef.current);
    renderToggleOffset(startOffset);
    toggleDragRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startOffset,
      moved: false,
    };
    suppressToggleClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleTogglePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = toggleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientY - drag.startClientY;
    if (!drag.moved && Math.abs(delta) < 4) return;
    drag.moved = true;
    event.currentTarget.classList.add('is-dragging');
    renderToggleOffset(clampToggleOffset(drag.startOffset + delta));
  };

  const completeToggleDrag = useCallback((button: HTMLButtonElement, pointerId: number) => {
    const drag = toggleDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    toggleDragRef.current = null;
    button.classList.remove('is-dragging');
    if (button.hasPointerCapture(pointerId)) {
      button.releasePointerCapture(pointerId);
    }

    if (drag.moved) {
      suppressToggleClickRef.current = true;
      commitToggleOffset(toggleOffsetRef.current);
      window.setTimeout(() => { suppressToggleClickRef.current = false; }, 0);
    }
  }, [commitToggleOffset]);

  useEffect(() => {
    const completeFromPointer = (event: PointerEvent) => {
      if (toggleRef.current) completeToggleDrag(toggleRef.current, event.pointerId);
    };
    const completeFromMouse = (event: MouseEvent) => {
      const drag = toggleDragRef.current;
      if (event.button === 0 && drag && toggleRef.current) {
        completeToggleDrag(toggleRef.current, drag.pointerId);
      }
    };
    const completeOnBlur = () => {
      const drag = toggleDragRef.current;
      if (drag && toggleRef.current) completeToggleDrag(toggleRef.current, drag.pointerId);
    };

    window.addEventListener('pointerup', completeFromPointer, true);
    window.addEventListener('pointercancel', completeFromPointer, true);
    window.addEventListener('mouseup', completeFromMouse, true);
    window.addEventListener('blur', completeOnBlur);
    return () => {
      window.removeEventListener('pointerup', completeFromPointer, true);
      window.removeEventListener('pointercancel', completeFromPointer, true);
      window.removeEventListener('mouseup', completeFromMouse, true);
      window.removeEventListener('blur', completeOnBlur);
    };
  }, [completeToggleDrag]);

  const finishToggleDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    completeToggleDrag(event.currentTarget, event.pointerId);
  };

  const handleToggleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressToggleClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onToggle();
  };

  return (
    <aside ref={sidebarRef} className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <button
        ref={toggleRef}
        type="button"
        className="sidebar-toggle"
        style={{ '--sidebar-toggle-offset': `${toggleOffset}px` } as ToggleStyle}
        onClick={handleToggleClick}
        onPointerDown={handleTogglePointerDown}
        onPointerMove={handleTogglePointerMove}
        onPointerUp={finishToggleDrag}
        onPointerCancel={finishToggleDrag}
        onLostPointerCapture={finishToggleDrag}
        aria-label={collapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню'}
        aria-describedby="sidebar-toggle-drag-hint"
        aria-expanded={!collapsed}
        aria-controls="orbit-sidebar-navigation"
        title={`${collapsed ? 'Развернуть' : 'Свернуть'} меню · удерживайте и перетаскивайте по вертикали`}
      >
        {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
      </button>
      <span id="sidebar-toggle-drag-hint" className="sr-only">Кнопку можно перетаскивать вверх и вниз удержанием.</span>
      <div className="brand" aria-label="Orbit Switch">
        <span className="brand-logo" aria-hidden="true"><img src={orbitLogo} alt="" /></span>
        <div><strong>Orbit</strong><span>Switch</span></div>
      </div>
        <nav ref={navRef} id="orbit-sidebar-navigation" className="sidebar-nav" aria-label="Основная навигация">
          <motion.span
            className="sidebar-nav__active-highlight"
            style={{
              y: highlightY,
              scaleX: highlightScaleX,
              scaleY: highlightScaleY,
              borderRadius: highlightRadius,
            }}
            aria-hidden="true"
          />
          {nav.map(({ id, label, icon: Icon }) => {
            const isCurrent = current === id;

            return (
              <button key={id} data-sidebar-view={id} className={isCurrent ? 'is-current' : ''} onClick={() => onChange(id)} aria-label={label} aria-current={isCurrent ? 'page' : undefined} title={label}>
                <Icon size={19} aria-hidden="true" />
                <span className="sidebar-nav__label">{label}</span>
                {id === 'accounts' && accountCount > 0 && <small>{accountCount}</small>}
              </button>
            );
          })}
        </nav>
      <div className="sidebar-github">
        <LiquidGitHubButton onClick={() => void api.openExternal('https://github.com/Chill-Man')} />
      </div>
    </aside>
  );
}
