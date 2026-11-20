// =====================================================================
// 07-mappapagine.ts — v0.61 «Contratto AI»: MAPPA PAGINE PDF ↔ pagina stampata. MODULO PURO (niente pdf.js né DOM).
// Una mappa è una lista di TRATTI: da pdfDa a pdfA la pagina stampata parte da stampDa e sale di 1 (numeri o romani).
//  - daEtichette(): dalle etichette di pagina del PDF (pdf.js getPageLabels) → esatta;
//  - daStampati(): dai numeri letti in testa/coda a ogni pagina, con un voto locale (finestra di 7 pagine) → stimata,
//    regge PDF a più tratti (premesse, tavole fuori testo) e il rumore (anni, numeri di figura);
//  - daMano(): ancore «stampata ↔ pdf» scritte dallo studente → esatta, vince sulle altre;
//  - aPdf()/aStampata(): conversioni nei due sensi; verifica(): la citazione [[…, p. X]] cade sulla pagina giusta?
//  - campioneProva(): k pagine a caso (seme fisso) da far confermare allo studente (UI in v0.63).
// =====================================================================
type PaginaStampata = number | string;
interface TrattoPagine { pdfDa: number; pdfA: number; stampDa: PaginaStampata; }
interface MappaPag { fonte: 'auto-etichette' | 'auto-stampati' | 'mano' | 'indice' | 'nessuna'; tratti: TrattoPagine[]; affidabilita: 'esatta' | 'stimata' | 'nessuna'; }
interface VerificaPagina { esito: '✅' | '↔' | '⚠' | '✗' | '❓'; pagina: PaginaStampata | null; }

const MappaPagine = (() => {
  const APERTO = 99999;
  const ROMANI: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  function aRomano(n: number, maiuscolo = false): string {
    let out = '';
    for (const [v, r] of ROMANI) while (n >= v) { out += r; n -= v; }
    return maiuscolo ? out.toUpperCase() : out;
  }
  function daRomano(t: string): number | null {
    const s = t.toLowerCase();
    if (!/^[ivxlcdm]+$/.test(s)) return null;
    let n = 0, i = 0;
    for (const [v, r] of ROMANI) while (s.startsWith(r, i)) { n += v; i += r.length; }
    return i === s.length && n > 0 && aRomano(n) === s ? n : null;
  }
  /** Una pagina stampata in forma confrontabile: sistema (arabo/romano), valore, maiuscole. */
  function leggiNumero(x: unknown): { romano: boolean; n: number; maiuscolo: boolean } | null {
    if (typeof x === 'number') return Number.isInteger(x) && x > 0 ? { romano: false, n: x, maiuscolo: false } : null;
    const t = String(x == null ? '' : x).trim();
    if (/^\d{1,5}$/.test(t)) return Number(t) > 0 ? { romano: false, n: Number(t), maiuscolo: false } : null;
    const r = daRomano(t);
    return r ? { romano: true, n: r, maiuscolo: t === t.toUpperCase() } : null;
  }
  const scrivi = (romano: boolean, n: number, maiuscolo: boolean): PaginaStampata => romano ? aRomano(n, maiuscolo) : n;

  /** Etichette pdf.js (indice 0 = pagina PDF 1): tratti consecutivi dello stesso sistema che salgono di 1. */
  function daEtichette(etichette: Array<string | null>): MappaPag | null {
    const tratti: TrattoPagine[] = [];
    let prec: { romano: boolean; n: number } | null = null;
    etichette.forEach((e, i) => {
      const x = e == null ? null : leggiNumero(e), ultimo = tratti[tratti.length - 1];
      if (x && prec && ultimo && ultimo.pdfA === i && x.romano === prec.romano && x.n === prec.n + 1) ultimo.pdfA = i + 1;
      else if (x) tratti.push({ pdfDa: i + 1, pdfA: i + 1, stampDa: scrivi(x.romano, x.n, x.maiuscolo) });
      prec = x;
    });
    return tratti.length ? { fonte: 'auto-etichette', tratti, affidabilita: 'esatta' } : null;
  }

  /** numeriPerPagina[i] = numeri trovati ai bordi della pagina PDF i+1. Scostamento = pdf − stampata, votato pagina per pagina. */
  function daStampati(numeriPerPagina: number[][]): MappaPag | null {
    const cand = numeriPerPagina.map((ns, i) => new Set((ns || []).map(n => i + 1 - n).filter(d => d >= 0)));
    const scost = cand.map((c, i) => {
      let best: number | null = null, nb = 0;
      c.forEach(d => {
        let v = 0;
        for (let j = Math.max(0, i - 3); j <= Math.min(cand.length - 1, i + 3); j++) if (cand[j].has(d)) v++;
        if (v > nb || (v === nb && best !== null && d < best)) { best = d; nb = v; }
      });
      return nb >= 3 ? best : null;
    });
    const tratti: Array<TrattoPagine & { d: number; voti: number }> = [];
    scost.forEach((d, i) => {
      if (d === null) return;
      const ultimo = tratti[tratti.length - 1];
      if (ultimo && ultimo.d === d) { ultimo.pdfA = i + 1; ultimo.voti++; }   // le pagine senza voto in mezzo allo stesso tratto ci stanno
      else tratti.push({ pdfDa: i + 1, pdfA: i + 1, stampDa: i + 1 - d, d, voti: 1 });
    });
    const buoni = tratti.filter(t => t.voti >= 3).map(({ pdfDa, pdfA, stampDa }) => ({ pdfDa, pdfA, stampDa }));
    return buoni.length ? { fonte: 'auto-stampati', tratti: buoni, affidabilita: 'stimata' } : null;
  }

  /** Ancore scritte a mano: ogni ancora apre un tratto fino alla successiva; l'ultimo resta aperto. */
  function daMano(righe: Array<{ stampata: PaginaStampata; pdf: number }>): MappaPag {
    const ok = righe.map(r => ({ x: leggiNumero(r.stampata), pdf: Math.round(Number(r.pdf)) })).filter(r => r.x && r.pdf > 0).sort((a, b) => a.pdf - b.pdf);
    const tratti = ok.map((r, i) => ({ pdfDa: r.pdf, pdfA: i + 1 < ok.length ? ok[i + 1].pdf - 1 : APERTO, stampDa: scrivi(r.x!.romano, r.x!.n, r.x!.maiuscolo) }));
    return { fonte: 'mano', tratti, affidabilita: tratti.length ? 'esatta' : 'nessuna' };
  }

  function aPdf(m: MappaPag | null, stampata: PaginaStampata): number | null {
    const x = leggiNumero(stampata);
    if (!m || !x) return null;
    for (const t of m.tratti) {
      const s = leggiNumero(t.stampDa);
      if (!s || s.romano !== x.romano) continue;
      const k = x.n - s.n;
      if (k >= 0 && k <= t.pdfA - t.pdfDa) return t.pdfDa + k;
    }
    return null;
  }
  function aStampata(m: MappaPag | null, pdf: number): PaginaStampata | null {
    const t = m ? m.tratti.find(x => pdf >= x.pdfDa && pdf <= x.pdfA) : undefined, s = t ? leggiNumero(t.stampDa) : null;
    return t && s ? scrivi(s.romano, s.n + pdf - t.pdfDa, s.maiuscolo) : null;
  }

  const norm = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** La citazione cade sulla pagina giusta? Cerca le parole chiave sulla pagina citata e, se serve, su quelle accanto (±1). */
  function verifica(m: MappaPag | null, citazione: string, testoPagina: (pdf: number) => string, parole: string[]): VerificaPagina {
    const c = /\bpp?\.\s*(\d{1,5}|[ivxlcdm]+)\b/i.exec(String(citazione || '')), x = c ? leggiNumero(c[1]) : null;
    const pagina = x ? scrivi(x.romano, x.n, x.maiuscolo) : null, pdf = x ? aPdf(m, pagina!) : null, pv = parole.map(norm).filter(Boolean);
    if (pdf === null || !pv.length) return { esito: '❓', pagina };
    const quota = (p: number) => { const t = norm(testoPagina(p) || ''); return t ? pv.filter(w => t.includes(w)).length / pv.length : -1; };
    const qui = quota(pdf);
    if (qui >= 0.5) return { esito: '✅', pagina };
    const vicine = [pdf + 1, pdf - 1].map(p => ({ p, q: quota(p) })).filter(v => v.q >= 0.5).sort((a, b) => b.q - a.q);
    if (vicine.length) { const s = aStampata(m, vicine[0].p); if (s !== null) return { esito: '↔', pagina: s }; }
    if (qui > 0) return { esito: '⚠', pagina };
    return { esito: qui < 0 && quota(pdf - 1) < 0 && quota(pdf + 1) < 0 ? '❓' : '✗', pagina };
  }

  /** k pagine PDF distinte dei tratti, scelte con un seme fisso (stesso seme = stesso campione), in ordine. */
  function campioneProva(m: MappaPag | null, k = 3, seme = 1, totale?: number): Array<{ pdf: number; stampata: PaginaStampata }> {
    if (!m) return [];
    const pagine: number[] = [];
    for (const t of m.tratti) { const fine = Math.min(t.pdfA, totale || (t.pdfA === APERTO ? t.pdfDa + 49 : t.pdfA)); for (let p = t.pdfDa; p <= fine; p++) pagine.push(p); }
    let x = (seme >>> 0) || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    for (let i = pagine.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pagine[i], pagine[j]] = [pagine[j], pagine[i]]; }
    return pagine.slice(0, k).sort((a, b) => a - b).map(pdf => ({ pdf, stampata: aStampata(m, pdf)! }));
  }

  return { APERTO, aRomano, daRomano, daEtichette, daStampati, daMano, aPdf, aStampata, verifica, campioneProva };
})();
