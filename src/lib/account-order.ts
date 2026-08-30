export function normalizeAccountOrder<T extends { id: string }>(
  accounts: readonly T[],
  preferredOrder: readonly string[],
): T[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const id of preferredOrder) {
    const account = accountsById.get(id);
    if (!account || seen.has(id)) continue;
    seen.add(id);
    ordered.push(account);
  }

  for (const account of accounts) {
    if (seen.has(account.id)) continue;
    seen.add(account.id);
    ordered.push(account);
  }

  return ordered;
}

export function groupAccountsByPinnedState<T extends { id: string }>(
  accounts: readonly T[],
  pinnedAccountIds: readonly string[],
): T[] {
  const pinnedIds = new Set(pinnedAccountIds);
  const pinned: T[] = [];
  const regular: T[] = [];

  for (const account of accounts) {
    (pinnedIds.has(account.id) ? pinned : regular).push(account);
  }

  return [...pinned, ...regular];
}

export function moveAccountOrder(
  accountIds: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  const fromIndex = accountIds.indexOf(activeId);
  const toIndex = accountIds.indexOf(overId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [...accountIds];

  const next = [...accountIds];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
