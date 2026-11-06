import { expect, test } from 'bun:test';
import { planSort, swapMoves } from '../../src/lib/rules.js';

// Spec §2.5 example: [u1, G1:(z,y), u2, u3, G2:(c,a), u4] with ungrouped u1=d, u2=b, u3=e, u4=a.
const layout = () => [
  { id: 10, index: 0, url: 'https://d.com/', groupId: -1 },
  { id: 11, index: 1, url: 'https://z.com/', groupId: 1 },
  { id: 12, index: 2, url: 'https://y.com/', groupId: 1 },
  { id: 13, index: 3, url: 'https://b.com/', groupId: -1 },
  { id: 14, index: 4, url: 'https://e.com/', groupId: -1 },
  { id: 15, index: 5, url: 'https://c.com/g', groupId: 2 },
  { id: 16, index: 6, url: 'https://a.com/g', groupId: 2 },
  { id: 17, index: 7, url: 'https://a.com/', groupId: -1 },
];

test('planSort sorts inside each group and refills ungrouped slots in order', () => {
  expect(planSort(layout())).toEqual([
    { id: 17, index: 0 },
    { id: 12, index: 1 },
    { id: 11, index: 2 },
    { id: 13, index: 3 },
    { id: 10, index: 4 },
    { id: 16, index: 5 },
    { id: 15, index: 6 },
    { id: 14, index: 7 },
  ]);
});

test('planSort leaves pinned tabs out and treats a missing groupId as ungrouped', () => {
  const tabs = [
    { id: 1, index: 0, url: 'https://z.com/', pinned: true },
    { id: 2, index: 1, url: 'https://b.com/' },
    { id: 3, index: 2, url: 'https://a.com/' },
  ];
  expect(planSort(tabs)).toEqual([
    { id: 3, index: 1 },
    { id: 2, index: 2 },
  ]);
});

test('planSort is stable for equal keys and a no-op on a sorted window', () => {
  const tabs = [
    { id: 1, index: 0, url: 'https://a.com/' },
    { id: 2, index: 1, url: 'https://www.a.com/' },
    { id: 3, index: 2, url: 'https://b.com/' },
  ];
  expect(planSort(tabs)).toEqual([
    { id: 1, index: 0 },
    { id: 2, index: 1 },
    { id: 3, index: 2 },
  ]);
  expect(swapMoves(tabs)).toEqual([]);
});

/**
 * Applies tabs.move the way Firefox 159 does (probes P1 and the sort e2e): the tab is removed, then
 * inserted at the final index, and takes the group of its anchor: the tab it now sits before when
 * it moved left, or the tab it now sits after when it moved right. `ungroup` then clears it.
 */
function simulate(tabs, moves, check) {
  const order = [...tabs].sort((a, b) => a.index - b.index).map(t => t.id);
  const group = new Map(tabs.map(t => [t.id, t.groupId ?? -1]));
  for (const m of moves) {
    const from = order.indexOf(m.id);
    order.splice(from, 1);
    order.splice(m.index, 0, m.id);
    const anchor = m.index < from ? order[m.index + 1] : order[m.index - 1];
    group.set(m.id, anchor === undefined ? -1 : group.get(anchor));
    if (m.ungroup) group.set(m.id, -1);
    check?.(order, m);
  }
  return { order, group };
}

test('swapMoves reaches the planned order and every tab ends in its own group', () => {
  const tabs = layout();
  const groupOfSlot = new Map(tabs.map(t => [t.index, t.groupId]));
  const groupOfTab = new Map(tabs.map(t => [t.id, t.groupId]));
  const { order, group } = simulate(tabs, swapMoves(tabs), (_, m) => {
    expect(groupOfSlot.get(m.index)).toBe(groupOfTab.get(m.id));
  });
  expect(order).toEqual(planSort(tabs).map(t => t.id));
  for (const t of tabs) expect(group.get(t.id)).toBe(t.groupId);
});

test('swapMoves flags an ungrouped tab moved right onto the slot just after a group', () => {
  // [u:z, G:(m), u:a]: the swap moves a left onto slot 0, then z right onto slot 2, where its
  // anchor (the tab it sits after) is the group's last tab, so Firefox would put z in the group.
  const tabs = [
    { id: 1, index: 0, url: 'https://z.com/', groupId: -1 },
    { id: 2, index: 1, url: 'https://m.com/', groupId: 7 },
    { id: 3, index: 2, url: 'https://a.com/', groupId: -1 },
  ];
  const moves = swapMoves(tabs);
  expect(moves).toEqual([
    { id: 3, index: 0 },
    { id: 1, index: 2, ungroup: true },
  ]);
  const { group } = simulate(tabs, moves);
  expect(group.get(1)).toBe(-1);
  expect(group.get(3)).toBe(-1);
});
