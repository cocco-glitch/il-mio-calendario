// ============================================================
// 01-util.ts — Utilità di base: DOM, date, id, markdown.
// NOTA ARCHITETTURA: niente moduli/import. Tutti i file in src/ sono
// "script" globali, compilati da tsc e concatenati in ordine di nome
// (vedi build.mjs) in un unico app.js. Zero dipendenze esterne.
// ============================================================

type Figlio = Node | string | number | null | undefined | false | Figlio[];

/** Crea un elemento: h('div.card.big', {onclick: fn}, figli...) */
function h(tag: string, attrs?: Record<string, any> | null, ...figli: Figlio[]): HTMLElement {
  const parti = tag.split('.');
  const el = document.createElement(parti[0] || 'div');
  if (parti.length > 1) el.className = parti.slice(1).join(' ');
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const p in v) {
          if (p.startsWith('--')) el.style.setProperty(p, v[p]);
          else (el.style as any)[p] = v[p];
        }
      } else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k in el && k !== 'list' && k !== 'style') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  aggiungi(el, figli);
  return el;
}

function aggiungi(el: Node, figli: Figlio[]): void {
  for (const f of figli) {
    if (f == null || f === false) continue;
    if (Array.isArray(f)) aggiungi(el, f);
    else if (f instanceof Node) el.appendChild(f);
    else el.appendChild(document.createTextNode(String(f)));
  }
}

function svuota(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }

function uid(): string {
  try { return crypto.randomUUID(); } catch (_) { /* vecchi browser */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// ---------- Date ----------
// Le date sono salvate come stringhe "orario a muro" locali (Europe/Rome sul
// tuo iPhone/PC): 'YYYY-MM-DD' oppure 'YYYY-MM-DDTHH:mm'. Niente fusi/UTC:
// un impegno alle 15:00 resta alle 15:00.

const pad2 = (n: number) => String(n).padStart(2, '0');
function ymd(d: Date): string { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hm(d: Date): string { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function dtStr(d: Date): string { return ymd(d) + 'T' + hm(d); }
function daYmd(s: string): Date { const p = s.slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function daDt(s: string): Date {
  const d = daYmd(s);
  if (s.length > 10) { const t = s.slice(11).split(':').map(Number); d.setHours(t[0] || 0, t[1] || 0, 0, 0); }
  return d;
}
function piuGiorni(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }
function piuMinuti(d: Date, n: number): Date { return new Date(d.getTime() + n * 60000); }
function inizioGiorno(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
/** Lunedì della settimana di d (la settimana parte di lunedì). */
function lunedi(d: Date): Date { const g = (d.getDay() + 6) % 7; return piuGiorni(inizioGiorno(d), -g); }
function stessoGiorno(a: Date, b: Date): boolean { return ymd(a) === ymd(b); }
function oggi(): Date { return inizioGiorno(new Date()); }

// v0.17: i formattatori si creano una volta sola per combinazione di opzioni (crearli è costoso)
const FORMATI = new Map<string, Intl.DateTimeFormat>();
function fmt(d: Date, o: Intl.DateTimeFormatOptions): string {
  const k = JSON.stringify(o);
  let f = FORMATI.get(k);
  if (!f) { f = new Intl.DateTimeFormat('it-IT', o); FORMATI.set(k, f); }
  return f.format(d);
}
const GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
function maiuscola(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function dataLunga(d: Date): string { return maiuscola(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })); }
function dataBreve(d: Date): string { return fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
/** "Oggi", "Domani", "Ieri" oppure data breve. */
function dataRelativa(d: Date): string {
  const diff = Math.round((inizioGiorno(d).getTime() - oggi().getTime()) / 86400000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  if (diff === -1) return 'Ieri';
  return dataBreve(d);
}

// ---------- Markdown minimale (sicuro: prima escape, poi sostituzioni) ----------
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mdInline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function md(src: string): string {
  const out: string[] = [];
  let lista = false;
  for (const riga of src.split('\n')) {
    const li = /^\s*[-*]\s+(.*)$/.exec(riga);
    if (li) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + mdInline(li[1]) + '</li>'); continue; }
    if (lista) { out.push('</ul>'); lista = false; }
    const t = /^(#{1,3})\s+(.*)$/.exec(riga);
    if (t) out.push('<h' + (t[1].length + 2) + '>' + mdInline(t[2]) + '</h' + (t[1].length + 2) + '>');
    else if (riga.trim() === '') out.push('<div class="md-sp"></div>');
    else out.push('<p>' + mdInline(riga) + '</p>');
  }
  if (lista) out.push('</ul>');
  return out.join('');
}

/** v0.37: SVG «puliti» prima di metterli nella pagina: niente script, eventi on*, link javascript:, oggetti incorporati. */
const SVG_PULITI = new Map<string, string>();
function svgSicuro(svg: string): string {
  if (!svg) return '';
  const c = SVG_PULITI.get(svg); if (c !== undefined) return c;
  let out = '';
  try {
    // parser HTML (tollerante come innerHTML): lo stesso albero che il browser costruirebbe
    const doc = new DOMParser().parseFromString('<body>' + svg, 'text/html'), r = doc.body.firstElementChild as Element | null;
    if (r && r.nodeName.toLowerCase() === 'svg' && doc.body.children.length === 1) {
      r.querySelectorAll('script,foreignObject,iframe,object,embed,use[href^="http"],animate,set').forEach(n => n.remove());
      for (const el of [r, ...Array.from(r.querySelectorAll('*'))]) for (const a of Array.from(el.attributes)) {
        const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href' || n === 'src') && !(v.startsWith('#') || v.startsWith('data:image/')))) el.removeAttribute(a.name);
      }
      out = r.outerHTML;
    }
  } catch (_) { out = ''; }
  SVG_PULITI.set(svg, out); return out;
}

/** Mescola in modo uniforme (Fisher–Yates); sort con Math.random è sbilanciato. */
function mescolaU<T>(a: T[]): T[] { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Normalizza per la ricerca: minuscole e senza accenti. */
function norm(s: string): string { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
