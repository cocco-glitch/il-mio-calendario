// 07-indicepagine.ts — Motore unificato, blocco 2 (N2): dove un concetto è trattato in un libro, pagina per pagina.
// Modulo PURO (niente DOM, Stato o rete): riceve il testo delle pagine (TestoPdf.tutte) in pagine logiche assolute
// del libro (i PDF a segmenti sono già uniti, quindi la continuità tra file è naturale) e restituisce riscontri spiegati.
//
// Pipeline (audit S2 §7): BM25 per pagina (k1 = 1,2, b = 0,75) sulle radici dei termini → sinonimi a peso 0,5 →
// classi per pagina → tratti contigui → stato del microstep con la regola dei DUE SEGNALI SU TRE
// (intervallo dell'indice, BM25 ≥ τ, pagina verificata da MappaPagine). Le correzioni manuali vincono sempre.
// τ tarato sul pilota (26/11/2026: 72 schede della banca, 261 pagine citate, Fasano e Bettelheim): τ = 0,55 × il punteggio
// massimo della query nel libro (non dipende da quante pagine ha il libro, a differenza del percentile) e ogni trattazione si
// estende fino a 2 pagine contigue che contengono i termini (un paragrafo continua sulla pagina accanto). Esito: richiamo
// 93% con ~12 pagine per microstep; il 95% lo danno i due segnali su tre, non il BM25 da solo. La query deve avere titolo
// E descrizione del microstep (solo titolo: richiamo ≤ 70%). Radice e sinonimi arrivano dall'esterno (Locale nell'app).

type ClassePagina = 'presenza' | 'trattazione' | 'approfondimento' | 'applicazione' | 'richiamo' | 'fuori_programma';
type StatoCoperturaPagine = 'coperto' | 'da_verificare' | 'lacuna';
interface PaginaTestoIdx { n: number; testo: string; }
interface LinguaIndice { radice(w: string): string; espandi(parole: string[]): string[]; }
interface PaginaIdx { n: number; tf: Map<string, number>; len: number; titoli: Set<string>; testo: string; dup?: number; esercizio: boolean; }
interface IndiceLibro { libro: string; N: number; avgdl: number; df: Map<string, number>; pagine: PaginaIdx[]; per: Map<number, PaginaIdx>; lingua: LinguaIndice; }
interface RiscontroPagina {
  n: number; classe: ClassePagina; punteggio: number; occorrenze: number; inTitolo: boolean;
  segnali: { intervallo: boolean; bm25: boolean; verificata: boolean }; estratto: string; motivo: string; duplicati?: number[];
}
interface TrattoIdx { da: number; a: number; classe: ClassePagina; }
interface CoperturaPagine { stato: StatoCoperturaPagine; tau: number; riscontri: RiscontroPagina[]; tratti: TrattoIdx[]; incertezze: string[]; }
interface OpzCoperturaPagine { intervallo?: [number, number]; tau?: number; verificate?: Iterable<number>; incluse?: Iterable<number>; escluse?: Iterable<number>; }

const IndicePagine = (() => {
  const K1 = 1.2, B = 0.75, PESO_SINONIMO = 0.5, ALFA = 0.55, VICINI = 2;
  const STOP = new Set('alla alle agli dalla dalle degli delle della dello nella nelle negli nello sulla sulle come anche sono essere viene vengono questo questa questi queste quello quella perche quando dove mentre oppure ogni tutti tutte loro ciascun'.split(' '));
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Fase 3 del brief (27/11): formule e sigle. Δ → «delta», apici e pedici → cifre e segni; poi, oltre alle parole ≥ 3 lettere,
  // token di simbolo marcati «§» (mai ridotti alla radice): sigle con minuscola+maiuscola (pH, ΔG → deltaG, pKa), sigle brevi con cifra
  // (O2), ioni (H+, Ca2+, Cl-), sigle di 2 maiuscole (UV, PV) e uguaglianze intere (F = m·a → §f=m*a). Regole sulla forma, valgono per ogni materia.
  const GRECO: Record<string, string> = { 'Δ': 'delta', '∆': 'delta', 'δ': 'delta', 'α': 'alfa', 'β': 'beta', 'γ': 'gamma', 'λ': 'lambda', 'μ': 'mu', 'µ': 'mu', 'π': 'pi',
    'ρ': 'rho', 'σ': 'sigma', 'ω': 'omega', 'Ω': 'omega', 'θ': 'theta', 'ε': 'epsilon', 'ν': 'nu', 'τ': 'tau', 'φ': 'phi', 'η': 'eta' };
  const APICI = '⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉⁺⁻₊₋', SEGNI = '01234567890123456789+-+-';
  const NO_SIGLA = new Set('IL LO LA LE UN DI DA IN SU MA SE NE SI CI VI AL AI ED AD HA HO NO OK'.split(' '));
  const apici = (s: string) => String(s || '').replace(/[⁰-⁹₀-₉¹²³⁺⁻₊₋]/g, c => SEGNI[APICI.indexOf(c)] || '').replace(/[−–]/g, '-');
  const forma = (s: string) => apici(s).replace(/[Δ∆δαβγλμµπρσωΩθενηφτ]/g, c => GRECO[c] || '');
  function simboli(t: string): string[] {
    const out: string[] = [];
    for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,8})\s*=\s*([A-Za-z0-9()]+(?:\s*[·×*/+^-]\s*[A-Za-z0-9()]+)*)/g))
      out.push(('§' + m[1] + '=' + m[2].replace(/\s+/g, '').replace(/[·×]/g, '*')).toLowerCase().slice(0, 25));
    for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Za-z0-9]+)(\+|-(?![A-Za-z0-9]))?/g)) {
      const w = m[1], car = m[2] || '';
      const ione = !!car && w.length <= 4 && /^[A-Z]/.test(w), misto = /[a-z][A-Z]/.test(w), cifra = w.length <= 2 && /[A-Za-z]/.test(w) && /\d/.test(w);
      const sigla = w.length === 2 && /^[A-Z]{2}$/.test(w) && !NO_SIGLA.has(w) && !/^[IVXLC]+$/.test(w);   // II, IV: numeri romani
      // una sigla di ≥ 3 caratteri senza carica (mRNA, pKa) è già una parola normale: contarla due volte sposterebbe i punteggi
      if ((ione || misto || cifra || sigla) && (ione || w.length < 3 || /^(delta|alfa|beta|gamma|lambda|mu|pi|rho|sigma|omega|theta|epsilon|nu|tau|phi|eta)[a-z0-9]/i.test(w) && /[A-Z0-9]/.test(w.slice(1))))
        out.push('§' + w.toLowerCase() + (ione ? car : ''));
    }
    return out;
  }
  // le parole normali vedono il testo SENZA lettere greche (come prima): «delta» comune a ΔG, ΔH, ΔS sarebbe solo rumore
  const parole = (s: string) => n2(apici(s).replace(/[Δ∆δαβγλμµπρσωΩθενηφτ]/g, ' ')).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).concat(simboli(forma(s)));
  /** Radice di un token: i simboli («§…») restano interi, altrimenti ΔG e ΔH finirebbero entrambi in «delta». */
  const rad = (l: LinguaIndice, w: string) => w.charAt(0) === '§' ? w : l.radice(w);
  const RE_ESERCIZIO = /\b(esempio|esercizio|esercizi|problema|problemi|esercitazione|soluzione)\b/i;
  const RE_FORMULA = /\d+(?:[.,]\d+)?\s*(?:[=×x·*/+−-]\s*\d|(?:m|s|kg|mol|j|n|pa|k|l|g|v|a|w)\b)/i;

  /** Titoli probabili di una pagina: righe brevi, senza punto finale, numerate o in maiuscolo iniziale. */
  function titoliDa(testo: string): string[] {
    return testo.split('\n').map(r => r.trim()).filter(r => r.length >= 4 && r.length <= 80 && !/[.;,:]$/.test(r)
      && (/^(\d+(\.\d+)*|capitolo|cap\.|paragrafo|unit[aà])\s/i.test(r) || (/^[A-ZÀ-Ù]/.test(r) && r.split(/\s+/).length <= 8)));
  }
  const firma = (t: string) => { const p = parole(t); return p.length < 20 ? '' : p.join(' '); };   // pagine quasi vuote non contano come duplicati

  function costruisci(libro: string, pagine: PaginaTestoIdx[], lingua: LinguaIndice): IndiceLibro {
    const df = new Map<string, number>(), out: PaginaIdx[] = [], per = new Map<number, PaginaIdx>(), visti = new Map<string, number>();
    let somma = 0;
    for (const p of pagine.slice().sort((a, b) => a.n - b.n)) {
      const f = firma(p.testo), prima = f ? visti.get(f) : undefined;
      const tf = new Map<string, number>(), titoli = new Set<string>();
      for (const w of parole(p.testo)) { const r = rad(lingua, w); tf.set(r, (tf.get(r) || 0) + 1); }
      for (const t of titoliDa(p.testo)) for (const w of parole(t)) titoli.add(rad(lingua, w));
      const len = Array.from(tf.values()).reduce((a, b) => a + b, 0);
      const pi: PaginaIdx = { n: p.n, tf, len, titoli, testo: p.testo, esercizio: RE_ESERCIZIO.test(p.testo) || RE_FORMULA.test(p.testo) };
      if (prima !== undefined) pi.dup = prima;                                   // stessa pagina in due PDF: indicizzata una volta
      else { if (f) visti.set(f, p.n); for (const r of tf.keys()) df.set(r, (df.get(r) || 0) + 1); somma += len; }
      out.push(pi); per.set(p.n, pi);
    }
    const N = out.filter(p => p.dup === undefined).length;
    return { libro, N, avgdl: N ? somma / N : 0, df, pagine: out, per, lingua };
  }

  /** Radici della query con il loro peso: termini 1, sinonimi 0,5 (mai sotto il peso già dato al termine). */
  function query(ind: IndiceLibro, termini: string[]): Map<string, number> {
    const q = new Map<string, number>(), base = termini.flatMap(parole);
    for (const w of base) q.set(rad(ind.lingua, w), 1);
    for (const w of ind.lingua.espandi(base).flatMap(parole)) { const r = rad(ind.lingua, w); if (!q.has(r)) q.set(r, PESO_SINONIMO); }
    return q;
  }
  function bm25(ind: IndiceLibro, p: PaginaIdx, q: Map<string, number>): { s: number; occ: number; inTitolo: boolean } {
    let s = 0, occ = 0, inTitolo = false;
    for (const [r, peso] of q) {
      const f = p.tf.get(r) || 0; if (!f) continue;
      if (peso === 1) { occ += f; if (p.titoli.has(r)) inTitolo = true; }
      const df = ind.df.get(r) || 0, idf = Math.log(1 + (ind.N - df + 0.5) / (df + 0.5));
      s += peso * idf * f * (K1 + 1) / (f + K1 * (1 - B + B * p.len / (ind.avgdl || 1)));
    }
    return { s: Math.round(s * 1000) / 1000, occ, inTitolo };
  }
  /** τ della query in questo libro: ALFA × il punteggio massimo (0 se nessuna pagina risponde). */
  function soglia(punteggi: number[], alfa = ALFA): number {
    const m = punteggi.reduce((a, b) => b > a ? b : a, 0);
    return m > 0 ? Math.round(alfa * m * 1000) / 1000 : 0;
  }
  function estratto(testo: string, radici: string[]): string {
    const t = testo.replace(/\s+/g, ' '), low = n2(t);
    let i = -1; for (const r of radici) { const k = low.indexOf(r); if (k >= 0 && (i < 0 || k < i)) i = k; }
    const a = Math.max(0, (i < 0 ? 0 : i) - 60);
    return (a > 0 ? '…' : '') + t.slice(a, a + 200).trim() + (a + 200 < t.length ? '…' : '');
  }

  /** CoperturaPagine di un concetto/microstep nel libro: riscontri per pagina, tratti, stato e incertezze dichiarate. */
  function copertura(ind: IndiceLibro, termini: string[], o: OpzCoperturaPagine = {}): CoperturaPagine {
    const q = query(ind, termini), radiciTermini = Array.from(q).filter(([, p]) => p === 1).map(([r]) => r);
    const ver = new Set(o.verificate || []), inc = new Set(o.incluse || []), esc = new Set(o.escluse || []), iv = o.intervallo;
    const dentro = (n: number) => !!iv && n >= iv[0] && n <= iv[1];
    const calc = ind.pagine.filter(p => p.dup === undefined).map(p => ({ p, ...bm25(ind, p, q) }));
    const tau = o.tau != null ? o.tau : soglia(calc.map(x => x.s));
    const incertezze: string[] = [];
    if (!radiciTermini.length) incertezze.push('nessun termine utile nella richiesta');
    if (!iv) incertezze.push("manca l'intervallo dell'indice: un segnale su tre non è disponibile");
    const dup = new Map<number, number[]>(); for (const p of ind.pagine) if (p.dup !== undefined) dup.set(p.dup, (dup.get(p.dup) || []).concat(p.n));
    let riscontri: RiscontroPagina[] = [];
    for (const x of calc) {
      const manuale = inc.has(x.p.n);
      if (esc.has(x.p.n)) continue;
      if (!x.occ && !manuale) { if (dentro(x.p.n)) riscontri.push(riscontro(x, 'fuori_programma', tau, dentro, ver, 'nell\'intervallo ma senza i termini del microstep (da controllare, non cancellata)')); continue; }
      const tratta = manuale || (tau > 0 && x.s >= tau && (x.inTitolo || x.occ >= 3));
      const classe: ClassePagina = !tratta ? (iv && !dentro(x.p.n) ? 'richiamo' : 'presenza') : x.p.esercizio ? 'applicazione' : 'trattazione';
      const motivo = manuale ? 'inclusa a mano' : tratta ? 'BM25 ' + x.s + ' ≥ τ ' + tau + (x.inTitolo ? ' e termine nel titolo' : ' e ' + x.occ + ' occorrenze')
        : x.occ + ' occorrenze, BM25 ' + x.s + (x.s >= tau ? ' ma termine né nel titolo né ripetuto' : ' < τ ' + tau);
      riscontri.push(riscontro(x, classe, tau, dentro, ver, motivo, dup.get(x.p.n)));
    }
    // contiguità: fino a VICINI pagine accanto a una trattazione, con i termini e non fuori dall'intervallo, ne fanno parte
    const fortiDi = () => new Set(riscontri.filter(r => r.classe === 'trattazione' || r.classe === 'applicazione').map(r => r.n));
    for (let giro = 0; giro < VICINI; giro++) {
      const f = fortiDi();
      riscontri = riscontri.map(r => (r.classe === 'presenza' || (r.classe === 'richiamo' && !iv)) && (f.has(r.n - 1) || f.has(r.n + 1))
        ? { ...r, classe: (ind.per.get(r.n)!.esercizio ? 'applicazione' : 'trattazione') as ClassePagina, motivo: r.motivo + '; accanto a una trattazione' } : r);
    }
    // tratti: pagine contigue di trattazione/applicazione; ≥ 3 pagine → approfondimento
    const forti = riscontri.filter(r => r.classe === 'trattazione' || r.classe === 'applicazione').map(r => r.n).sort((a, b) => a - b);
    const tratti: TrattoIdx[] = [];
    for (const n of forti) { const t = tratti[tratti.length - 1]; if (t && n === t.a + 1) t.a = n; else tratti.push({ da: n, a: n, classe: 'trattazione' }); }
    for (const t of tratti) if (t.a - t.da + 1 >= 3) {
      t.classe = 'approfondimento';
      riscontri = riscontri.map(r => r.n >= t.da && r.n <= t.a && r.classe === 'trattazione' ? { ...r, classe: 'approfondimento' as ClassePagina } : r);
    }
    // stato: due segnali su tre su almeno una pagina; uno solo → da verificare; nessuno → lacuna. Inclusa a mano = coperto.
    const contaSegnali = (r: RiscontroPagina) => +r.segnali.intervallo + +r.segnali.bm25 + +r.segnali.verificata;
    const utili = riscontri.filter(r => r.classe !== 'fuori_programma');
    const stato: StatoCoperturaPagine = utili.some(r => inc.has(r.n) || contaSegnali(r) >= 2) ? 'coperto' : utili.some(r => contaSegnali(r) === 1) ? 'da_verificare' : 'lacuna';
    if (stato === 'da_verificare') incertezze.push('un solo segnale: fonte da verificare');
    riscontri.sort((a, b) => b.punteggio - a.punteggio || a.n - b.n);
    return { stato, tau, riscontri, tratti, incertezze };

    function riscontro(x: { p: PaginaIdx; s: number; occ: number; inTitolo: boolean }, classe: ClassePagina, t: number, inIv: (n: number) => boolean, v: Set<number>, motivo: string, duplicati?: number[]): RiscontroPagina {
      const r: RiscontroPagina = { n: x.p.n, classe, punteggio: x.s, occorrenze: x.occ, inTitolo: x.inTitolo,
        segnali: { intervallo: inIv(x.p.n), bm25: t > 0 && x.s >= t, verificata: v.has(x.p.n) }, estratto: estratto(x.p.testo, radiciTermini), motivo };
      if (duplicati && duplicati.length) r.duplicati = duplicati;
      return r;
    }
  }
  return { costruisci, copertura, soglia, titoliDa, parole, rad, simboli: (s: string) => simboli(forma(s)) };
})();
