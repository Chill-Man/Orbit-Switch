import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { moveAccountOrder } from '../lib/account-order';
import type { Account } from '../types';

interface SortableAccountGridProps {
  accounts: readonly Account[];
  pinnedAccountIds: readonly string[];
  onReorder(accountIds: string[]): void;
  children(account: Account, pinned: boolean): ReactNode;
}

interface SortableAccountItemProps {
  account: Account;
  pinned: boolean;
  children: ReactNode;
}

type AccountSortGroup = 'pinned' | 'regular';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

class AccountCardPointerSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown' as const,
    handler: ({ nativeEvent: event }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, input, select, textarea, [data-no-account-drag]')) {
        return false;
      }
      if (!event.isPrimary || event.button !== 0) return false;
      onActivation?.({ event });
      return true;
    },
  }];
}

const accountGroupCollisionDetection: CollisionDetection = (args) => {
  const activeGroup = args.active.data.current?.accountSortGroup as AccountSortGroup | undefined;
  if (!activeGroup) return closestCenter(args);

  const droppableContainers = args.droppableContainers.filter(
    (container) => container.data.current?.accountSortGroup === activeGroup,
  );

  return closestCenter({ ...args, droppableContainers });
};

function SortableAccountItem({ account, pinned, children }: SortableAccountItemProps) {
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: account.id,
    data: { accountSortGroup: pinned ? 'pinned' : 'regular' satisfies AccountSortGroup },
    attributes: {
      role: 'listitem',
      roleDescription: 'перемещаемая карточка аккаунта',
      tabIndex: 0,
    },
    transition: {
      duration: 180,
      easing: 'cubic-bezier(.2, .8, .2, 1)',
    },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    zIndex: isDragging ? 40 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      className={`sortable-account-card ${isDragging ? 'is-dragging' : ''} ${isSorting ? 'is-sorting' : ''}`}
      style={style}
      data-account-sort-id={account.id}
      aria-label={`${account.label}${pinned ? ', закреплён' : ''}. Удерживайте левую кнопку мыши, чтобы переместить карточку внутри своей группы.`}
      {...attributes}
      {...listeners}
    >
      <div className="sortable-account-card__motion">
        {children}
      </div>
    </div>
  );
}

export function SortableAccountGrid({ accounts, pinnedAccountIds, onReorder, children }: SortableAccountGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const accountGridRef = useRef<HTMLDivElement | null>(null);
  const dragBoundsRef = useRef<DOMRect | null>(null);
  const sensors = useSensors(
    useSensor(AccountCardPointerSensor, {
      activationConstraint: {
        delay: 190,
        tolerance: 7,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const pinnedIds = new Set(pinnedAccountIds);
  const pinnedAccounts = accounts.filter((account) => pinnedIds.has(account.id));
  const regularAccounts = accounts.filter((account) => !pinnedIds.has(account.id));
  const pinnedOrder = pinnedAccounts.map((account) => account.id);
  const regularOrder = regularAccounts.map((account) => account.id);

  const restrictDragToGrid = useCallback<Modifier>(({ transform, draggingNodeRect }) => {
    const bounds = dragBoundsRef.current;
    if (!bounds || !draggingNodeRect) return transform;

    const minimumX = bounds.left - draggingNodeRect.left;
    const maximumX = bounds.right - draggingNodeRect.right;
    const minimumY = bounds.top - draggingNodeRect.top;
    const maximumY = bounds.bottom - draggingNodeRect.bottom;

    return {
      ...transform,
      x: clamp(transform.x, minimumX, maximumX),
      y: clamp(transform.y, minimumY, maximumY),
    };
  }, []);

  useEffect(() => {
    if (!activeId) return undefined;
    const grid = accountGridRef.current;
    if (!grid) return undefined;

    const refreshDragBounds = () => {
      dragBoundsRef.current = grid.getBoundingClientRect();
    };

    refreshDragBounds();
    const ownerDocument = grid.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    let refreshFrame: number | null = null;
    const scheduleDragBoundsRefresh = () => {
      if (!ownerWindow) {
        refreshDragBounds();
        return;
      }
      if (refreshFrame !== null) return;
      refreshFrame = ownerWindow.requestAnimationFrame(() => {
        refreshFrame = null;
        refreshDragBounds();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleDragBoundsRefresh);
    resizeObserver.observe(grid);
    ownerDocument.addEventListener('scroll', scheduleDragBoundsRefresh, { capture: true, passive: true });
    ownerWindow?.addEventListener('resize', scheduleDragBoundsRefresh, { passive: true });

    return () => {
      resizeObserver.disconnect();
      ownerDocument.removeEventListener('scroll', scheduleDragBoundsRefresh, true);
      ownerWindow?.removeEventListener('resize', scheduleDragBoundsRefresh);
      if (ownerWindow && refreshFrame !== null) ownerWindow.cancelAnimationFrame(refreshFrame);
    };
  }, [activeId, accounts.length]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    dragBoundsRef.current = accountGridRef.current?.getBoundingClientRect() || null;
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    dragBoundsRef.current = null;
    setActiveId(null);
    if (!over) return;
    const activeGroup = active.data.current?.accountSortGroup as AccountSortGroup | undefined;
    const overGroup = over.data.current?.accountSortGroup as AccountSortGroup | undefined;
    if (!activeGroup || activeGroup !== overGroup) return;

    if (activeGroup === 'pinned') {
      onReorder([...moveAccountOrder(pinnedOrder, String(active.id), String(over.id)), ...regularOrder]);
      return;
    }

    onReorder([...pinnedOrder, ...moveAccountOrder(regularOrder, String(active.id), String(over.id))]);
  };

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictDragToGrid]}
      collisionDetection={accountGroupCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
      onDragStart={handleDragStart}
      onDragCancel={() => {
        dragBoundsRef.current = null;
        setActiveId(null);
      }}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Нажмите пробел, используйте стрелки для выбора нового места, затем снова нажмите пробел.',
        },
      }}
    >
      <div ref={accountGridRef} className={`account-grid ${activeId ? 'account-grid--sorting' : ''}`} role="list" aria-label="Аккаунты, порядок можно изменить внутри закреплённой или обычной группы">
        <SortableContext items={pinnedOrder} strategy={rectSortingStrategy}>
          {pinnedAccounts.map((account) => (
            <SortableAccountItem key={account.id} account={account} pinned>
              {children(account, true)}
            </SortableAccountItem>
          ))}
        </SortableContext>
        <SortableContext items={regularOrder} strategy={rectSortingStrategy}>
          {regularAccounts.map((account) => (
            <SortableAccountItem key={account.id} account={account} pinned={false}>
              {children(account, false)}
            </SortableAccountItem>
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
