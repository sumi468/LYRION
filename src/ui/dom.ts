type Child = Node | string | number | null | undefined | false;

/** 最小限の DOM ビルダー。innerHTML を使わないので文字列は常にテキストとして扱われる(XSS 安全)。 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' ? c : String(c));
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 値が変わったときだけテキストを書き換える(毎フレームの DOM 更新を最小化) */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function fmtDist(u: number): string {
  if (u >= 10000) return `${(u / 1000).toFixed(1)}k`;
  if (u >= 1000) return `${(u / 1000).toFixed(2)}k`;
  return `${Math.round(u)}`;
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
