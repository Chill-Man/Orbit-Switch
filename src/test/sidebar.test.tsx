import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Sidebar collapse handle', () => {
  it('drags vertically, persists its offset, and does not toggle after a drag', async () => {
    const onToggle = vi.fn();
    render(
      <Sidebar
        current="accounts"
        accountCount={2}
        collapsed={false}
        onChange={() => undefined}
        onToggle={onToggle}
      />,
    );

    const button = screen.getByRole('button', { name: 'Свернуть боковое меню' });
    const capturedPointers = new Set<number>();
    Object.defineProperties(button, {
      setPointerCapture: { value: (pointerId: number) => capturedPointers.add(pointerId) },
      hasPointerCapture: { value: (pointerId: number) => capturedPointers.has(pointerId) },
      releasePointerCapture: { value: (pointerId: number) => capturedPointers.delete(pointerId) },
    });

    fireEvent.pointerDown(button, { button: 0, pointerId: 7, clientY: 120 });
    fireEvent.pointerMove(button, { pointerId: 7, clientY: 190 });
    expect(button).toHaveClass('is-dragging');

    fireEvent.pointerUp(button, { button: 0, pointerId: 7, clientY: 190 });
    expect(button).not.toHaveClass('is-dragging');
    expect(button.style.getPropertyValue('--sidebar-toggle-offset')).toBe('70px');
    expect(window.localStorage.getItem('orbit-sidebar-toggle-offset')).toBe('70');

    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
