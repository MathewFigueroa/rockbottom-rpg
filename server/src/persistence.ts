import { GameClock, MemoryStore, type WorldSnapshot } from './store.js';

export interface WorldRepository { healthy: boolean; save(snapshot: WorldSnapshot, reason: string): Promise<void> }
/** Serialize request mutations and ticks; restore rejected work and fail closed on storage errors. */
export class PersistenceCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private active = false;
  healthy = true;
  get busy() { return this.active; }
  constructor(readonly store: MemoryStore, readonly clock: GameClock, private readonly repository?: WorldRepository) {}
  async acquire() {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    this.active = true;
    let released = false;
    return () => { if (!released) { released = true; this.active = false; release(); } };
  }
  async commit(reason: string) {
    if (!this.healthy || this.repository?.healthy === false) throw new Error('persistence_unavailable');
    this.store.clockState = this.clock.read();
    try {
      if (this.repository) await this.repository.save(this.store.snapshot(), reason);
      else this.store.save();
    } catch (error) { this.healthy = false; throw error; }
  }
  restore(snapshot: WorldSnapshot) {
    this.store.restore(snapshot);
    if (snapshot.clockState) this.clock.update(snapshot.clockState);
  }
}
