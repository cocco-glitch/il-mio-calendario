// 07-calcolo.ts — v0.41: calcoli dopo «=» come le Note di iOS (Math Notes).
// Scouting: Math Notes calcola quando scrivi «=», con variabili definite più sopra («m=2») che aggiornano
// i calcoli successivi; risultato suggerito e confermato con Invio. Qui: valutatore proprio, SENZA eval
// (sicuro), offline. Trigonometria in GRADI (come nei problemi di fisica); «rad» per i radianti.

const Calcolo = (() => {
  type Tok = { t: 'n' | 'o' | 'p' | 'id'; v: string };
  const FUN: Record<string, (x: number) => number> = {
    sqrt: Math.sqrt, rad: x => x, abs: Math.abs, ln: Math.log, log: Math.log10,
    sin: x => Math.sin(x * Math.PI / 180), cos: x => Math.cos(x * Math.PI / 180), tan: x => Math.tan(x * Math.PI / 180),
    asin: x => Math.asin(x) * 180 / Math.PI, acos: x => Math.acos(x) * 180 / Math.PI, atan: x => Math.atan(x) * 180 / Math.PI,
    sen: x => Math.sin(x * Math.PI / 180), tg: x => Math.tan(x * Math.PI / 180),
  };
  const COST: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E, g: 9.81 };
  function tokens(s: string): Tok[] {
    s = s.replace(/[×·∙]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, ' sqrt ');
    const o: Tok[] = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const n = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
      if (n) { o.push({ t: 'n', v: n[0].replace(',', '.') }); i += n[0].length; continue; }
      const id = /^[A-Za-zÀ-ÿπ_][A-Za-zÀ-ÿ0-9_]*/.exec(s.slice(i));
      if (id) { o.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
      if ('+-*/^%'.includes(c)) { o.push({ t: 'o', v: c }); i++; continue; }
      if ('()[]'.includes(c)) { o.push({ t: 'p', v: c === '[' ? '(' : c === ']' ? ')' : c }); i++; continue; }
      throw new Error('simbolo non capito: ' + c);
    }
    return o;
  }
  /** Valuta un'espressione (numeri con virgola o punto, + - * / ^ %, parentesi, funzioni, variabili). */
  function valuta(espr: string, vars: Record<string, number> = {}): number {
    const tk = tokens(espr); let p = 0;
    const vede = (t: string, v?: string) => p < tk.length && tk[p].t === t && (v == null || tk[p].v === v);
    const somma = (): number => { let x = prodotto(); while (vede('o', '+') || vede('o', '-')) { const op = tk[p++].v, y = prodotto(); x = op === '+' ? x + y : x - y; } return x; };
    const inizioFattore = () => vede('n') || vede('id') || vede('p', '(');
    const prodotto = (): number => { let x = unario();
      for (;;) { if (vede('o', '*') || vede('o', '/')) { const op = tk[p++].v, y = unario(); x = op === '*' ? x * y : x / y; }
        else if (inizioFattore()) x *= unario();   // moltiplicazione implicita: 2(3+1), 3m, 2pi
        else return x; } };
    const unario = (): number => { if (vede('o', '-')) { p++; return -unario(); } if (vede('o', '+')) { p++; return unario(); } return potenza(); };
    const potenza = (): number => { let x = primario(); if (vede('o', '%')) { p++; x /= 100; } if (vede('o', '^')) { p++; x = Math.pow(x, unario()); } return x; };
    const primario = (): number => {
      if (vede('n')) return parseFloat(tk[p++].v);
      if (vede('p', '(')) { p++; const x = somma(); if (!vede('p', ')')) throw new Error('manca una parentesi'); p++; return x; }
      if (vede('id')) {
        const nome = tk[p++].v, k = nome.toLowerCase();
        if (FUN[k] && (vede('p', '(') || vede('n') || vede('id'))) return FUN[k](potenza());
        if (nome in vars) return vars[nome];
        if (k in COST) return COST[k];
        throw new Error('«' + nome + '» non è definito');
      }
      throw new Error('espressione incompleta');
    };
    const x = somma(); if (p < tk.length) throw new Error('espressione non capita');
    if (!isFinite(x)) throw new Error('risultato non finito');
    return x;
  }
  /** Variabili definite nelle righe precedenti: «nome = valore» (come Math Notes: valgono sotto la riga). */
  function variabili(righe: string[]): Record<string, number> {
    const v: Record<string, number> = {};
    for (const r of righe) { const m = /^\s*(?:[-*]\s*)?([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)\s*=\s*([^=]+?)\s*$/.exec(r); if (!m) continue; try { v[m[1]] = valuta(m[2], v); } catch (_) { /* non è una definizione */ } }
    return v;
  }
  /** Numero all'italiana: virgola decimale, al massimo 6 cifre significative, notazione ·10^n se serve. */
  function formatta(x: number): string {
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e7 || a < 1e-4) { const [m, e] = x.toExponential(3).split('e'); return m.replace(/\.?0+$/, '').replace('.', ',') + '·10^' + (+e); }
    return String(+x.toPrecision(6)).replace('.', ',');
  }
  /** Se la riga finisce con «=», restituisce il risultato (con le variabili delle righe sopra). */
  function suggerisci(testo: string, cursore: number): string | null {
    const ini = testo.lastIndexOf('\n', cursore - 1) + 1, riga = testo.slice(ini, cursore);
    const m = /^(?:\s*[-*]\s*)?(.*?)=\s*$/.exec(riga); if (!m) return null;
    let espr = m[1]; const def = /^\s*[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*\s*=(.*)$/.exec(espr); if (def) espr = def[1];   // «F = m*a =»
    if (!/\d|[A-Za-z]/.test(espr) || /^\s*[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_ ]*$/.test(espr) && !/^\s*(pi|π)\s*$/i.test(espr)) return null;   // solo un nome: è una definizione
    if (!/[-+*/^×·÷%()√²³]|\b(sqrt|sin|cos|tan|log|ln)\b/.test(espr) && !/[A-Za-z]/.test(espr)) return null;   // un numero solo
    try { return formatta(valuta(espr, variabili(testo.slice(0, ini).split('\n')))); } catch (_) { return null; }
  }
  return { valuta, variabili, formatta, suggerisci };
})();

/** Aggancia i calcoli dopo «=» a una textarea: suggerimento sopra il campo, Invio o tocco per inserirlo. */
function calcoliInTesto(campo: HTMLTextAreaElement, dopo: () => void): HTMLElement {
  const bolla = h('button.calcolo-bolla', { hidden: true, type: 'button', 'aria-label': 'Inserisci il risultato' });
  let ris: string | null = null;
  const metti = () => { if (!ris) return; const c = campo.selectionStart; campo.setRangeText(' ' + ris, c, c, 'end'); ris = null; bolla.hidden = true; try { Tocco.clic(.6); } catch (_) { /* */ } dopo(); };
  const aggiorna = () => {
    ris = campo.selectionStart === campo.selectionEnd ? Calcolo.suggerisci(campo.value, campo.selectionStart) : null;
    bolla.hidden = !ris; if (ris) bolla.textContent = '= ' + ris + '   ↵';
  };
  campo.addEventListener('input', aggiorna);
  campo.addEventListener('click', aggiorna);
  campo.addEventListener('keydown', e => { if (e.key === 'Enter' && ris && !bolla.hidden) { e.preventDefault(); metti(); } else if (e.key === 'Escape') bolla.hidden = true; });
  campo.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== bolla) bolla.hidden = true; }, 150));
  bolla.addEventListener('pointerdown', e => e.preventDefault());   // non toglie il fuoco al testo
  bolla.addEventListener('click', metti);
  return bolla;
}
