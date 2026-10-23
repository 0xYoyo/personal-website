/** Timers on the swarm's simulation clock (pauses with the tab, steps deterministically in manual mode). */
export class Scheduler {
  now = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  after(sec: number, fn: () => void): number {
    const id = ++this.seq;
    this.timers.set(id, { at: this.now + sec, fn });
    return id;
  }
  cancel(id: number | null): void { if (id !== null) this.timers.delete(id); }
  advance(dt: number): void {
    this.now += dt;
    for (const [id, t] of [...this.timers]) {
      if (t.at <= this.now) { this.timers.delete(id); t.fn(); }
    }
  }
}
