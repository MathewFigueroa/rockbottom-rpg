import { expect, it, vi } from 'vitest';
import { GameClock, MemoryStore } from './store.js';
import { Simulation } from './simulation.js';

it('fast-forwards a 45-minute job in ten real seconds without changing its pay or duration', () => {
  vi.useFakeTimers();
  try {
    const clock = new GameClock();
    expect(clock.read().decisionSpacingSeconds).toBe(10);
    const store = new MemoryStore();
    const c = store.createCharacter({ name: 'Jamie', sex: 'female', childName: 'Riley', childAge: 8 });
    const before = clock.nowMs();
    expect(new Simulation(store, clock).act(c, 'collect_recycling', {}, false).ok).toBe(true);
    expect(c.cash).toBe(22);
    expect(Date.parse(c.nextDecisionAt) - before).toBe(45 * 60000);
    clock.update({ scale: 270 });
    vi.advanceTimersByTime(10000);
    expect(clock.nowMs()).toBe(Date.parse(c.nextDecisionAt));
    clock.update({ scale: 1 });
    vi.advanceTimersByTime(5000);
    expect(clock.nowMs()).toBe(Date.parse(c.nextDecisionAt) + 5000);
    expect(c.cash).toBe(22);
  } finally { vi.useRealTimers(); }
});
