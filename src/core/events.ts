/** 依存なしの最小限・型付きイベントエミッタ。Game → UI の通知に使う。 */
export class Emitter<M extends Record<string, unknown>> {
  private handlers = new Map<keyof M, Set<(p: never) => void>>();

  on<K extends keyof M>(type: K, fn: (payload: M[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (p: M[K]) => void)(payload);
      } catch (e) {
        console.error(`[events] handler for "${String(type)}" threw`, e);
      }
    }
  }
}
