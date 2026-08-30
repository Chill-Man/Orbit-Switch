import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountCard } from '../components/AccountCard';
import type { Account } from '../types';

const account: Account = {
  id: 'account-rename',
  label: 'Рабочий',
  email: 'work@example.com',
  color: '#7c6df2',
  profilePath: '',
  authState: 'ready',
  createdAt: new Date().toISOString(),
  lastOpenedAt: null,
  quotaFilePath: null,
  quotas: [],
};

function renderCard(onRename = vi.fn(async () => true), nextAccount: Account = account) {
  render(
    <AccountCard
      account={nextAccount}
      active={false}
      pinned={false}
      now={Date.now()}
      busy={false}
      glassEnabled={false}
      progressStyle="solid"
      onSwitch={() => undefined}
      onLogin={() => undefined}
      onRename={onRename}
      onDelete={() => undefined}
      onTogglePinned={() => undefined}
    />,
  );
  return onRename;
}

afterEach(cleanup);

describe('AccountCard inline rename', () => {
  it('renames after a double click and Enter', async () => {
    const onRename = renderCard();
    const renameButton = screen.getByRole('button', { name: 'Рабочий. Переименовать аккаунт' });
    expect(renameButton).not.toHaveAttribute('title');
    fireEvent.doubleClick(renameButton);

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Новое название для Рабочий' });
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.change(input, { target: { value: 'Командный' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Командный'));
  });

  it('opens the editor with one context-menu click and cancels with Escape', () => {
    const onRename = renderCard();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Рабочий. Переименовать аккаунт' }));

    const input = screen.getByRole('textbox', { name: 'Новое название для Рабочий' });
    fireEvent.change(input, { target: { value: 'Не сохранять' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Рабочий. Переименовать аккаунт' })).toBeInTheDocument();
  });

  it('keeps runtime actions available for an authenticated account', () => {
    renderCard();

    expect(screen.getByText('Готов', { selector: '.status-pill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить Рабочий' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Переключить' })).toBeEnabled();
  });
});
