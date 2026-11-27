// 07-copertura.ts — motore unificato, blocco 7: duplicati e lacune di un piano (audit S2 §8). Modulo PURO (niente DOM, Stato o rete), 0 token.
//
// Decisione utente 26/11 (Sessione 8): solo AVVISI nell'anteprima dei piani AI, mai bloccanti; l'unione la decide lo studente.
//  - duplicato: due unità con concetti simili (Jaccard delle radici ≥ 0,5) E pagine sovrapposte (≥ 50% della più corta) → proposta di unione;
//  - ripetizione didattica: concetti simili ma pagine diverse (o assenti) → introduzione/approfondimento, conservata e solo segnalata;
//  - lacuna: voce della struttura (indice delle fonti) che nessuna unità copre né per pagine (stesso file, intervalli sovrapposti) né per
//    contenuto (≥ 50% delle radici del titolo della voce in una stessa unità) → «argomento mancante».
// Controllo sulla banca reale (217 schede, 26/11): 0 coppie alle soglie; le 4 più vicine (0,37–0,40) sono «teoria + problemi» dello stesso
// microstep. Le soglie sono rapporti, non costanti per libro (vale per qualsiasi materia).

interface UnitaCop { uid: string; titolo: string; concettiChiave?: string[]; fileId?: string; pagine?: [number, number]; }
interface CoppiaCop { a: string; b: string; titoloA: string; titoloB: string; jaccard: number; sovrapp: number; }
interface LacunaCop { titolo: string; fileId: string; pagine?: [number, number]; }
interface EsitoCop { duplicati: CoppiaCop[]; ripetizioni: CoppiaCop[]; lacune: LacunaCop[]; voci: number; avvisi: string[]; }

const Copertura = (() => {
  const SOGLIA_J = 0.5, SOGLIA_PAG = 0.5, SOGLIA_VOCE = 0.5, MAX_AVVISI = 6;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  function radici(testi: string[], lingua: LinguaIndice): Set<string> {
    const s = new Set<string>();
    for (const t of testi) for (const w of IndicePagine.parole(t)) { const r = IndicePagine.rad(lingua, w); if (r.length >= 3) s.add(r); }
    return s;
  }
  function jaccard(a: Set<string>, b: Set<string>): number {
    let i = 0; for (const x of a) if (b.has(x)) i++;
    const u = a.size + b.size - i; return u ? i / u : 0;
  }
  /** Sovrapposizione delle pagine rispetto all'intervallo più corto (0 se file diversi o pagine assenti). */
  function sovrapp(a: UnitaCop, b: UnitaCop): number {
    if (!a.pagine || !b.pagine || (a.fileId && b.fileId && a.fileId !== b.fileId)) return 0;
    const i = Math.min(a.pagine[1], b.pagine[1]) - Math.max(a.pagine[0], b.pagine[0]) + 1;
    const corto = Math.min(a.pagine[1] - a.pagine[0] + 1, b.pagine[1] - b.pagine[0] + 1);
    return i > 0 && corto > 0 ? Math.min(1, i / corto) : 0;
  }
  /** Concetti dell'unità: i concettiChiave se ci sono (≥ 2), altrimenti titolo + concetti. */
  const contenuto = (u: UnitaCop) => (u.concettiChiave && u.concettiChiave.length >= 2 ? u.concettiChiave : [u.titolo, ...(u.concettiChiave || [])]);
  function coppie(unita: UnitaCop[], lingua: LinguaIndice): { duplicati: CoppiaCop[]; ripetizioni: CoppiaCop[] } {
    const R = unita.map(u => radici(contenuto(u), lingua)), duplicati: CoppiaCop[] = [], ripetizioni: CoppiaCop[] = [];
    for (let i = 0; i < unita.length; i++) for (let j = i + 1; j < unita.length; j++) {
      const jj = jaccard(R[i], R[j]); if (jj < SOGLIA_J) continue;
      const a = unita[i], b = unita[j], ov = sovrapp(a, b);
      const c: CoppiaCop = { a: a.uid, b: b.uid, titoloA: a.titolo, titoloB: b.titolo, jaccard: r2(jj), sovrapp: r2(ov) };
      (ov >= SOGLIA_PAG ? duplicati : ripetizioni).push(c);
    }
    return { duplicati, ripetizioni };
  }
  /** Voci della struttura «FILE_ID | NOME | a-b | TITOLO» (stesso formato di Pianificatore.strutturaDaFonti). */
  function voci(struttura: string): LacunaCop[] {
    const out: LacunaCop[] = [];
    for (const r of String(struttura || '').split('\n')) {
      const p = r.split('|').map(x => x.trim()); if (p.length < 4 || !p[3]) continue;
      const m = /^(\d+)-(\d+)$/.exec(p[2]);
      out.push({ titolo: p[3], fileId: p[0], pagine: m ? [+m[1], Math.max(+m[1], +m[2])] : undefined });
    }
    return out;
  }
  function lacune(unita: UnitaCop[], struttura: string, lingua: LinguaIndice): { lacune: LacunaCop[]; voci: number } {
    const vv = voci(struttura), R = unita.map(u => radici([u.titolo, ...(u.concettiChiave || [])], lingua)), out: LacunaCop[] = [];
    for (const v of vv) {
      const perPagine = !!v.pagine && unita.some(u => u.pagine && (!u.fileId || u.fileId === v.fileId) && sovrapp({ uid: '', titolo: '', pagine: v.pagine, fileId: v.fileId }, u) > 0);
      if (perPagine) continue;
      const rv = radici([v.titolo], lingua); if (!rv.size) continue;
      const perTesto = R.some(r => { let i = 0; for (const x of rv) if (r.has(x)) i++; return i / rv.size >= SOGLIA_VOCE; });
      if (!perTesto) out.push(v);
    }
    return { lacune: out, voci: vv.length };
  }
  const pp = (p?: [number, number]) => p ? ' (pp. ' + p[0] + (p[1] !== p[0] ? '–' + p[1] : '') + ')' : '';
  /** Analisi completa con gli avvisi da mostrare (al massimo 6, il resto contato). */
  function analizza(unita: UnitaCop[], struttura: string, lingua: LinguaIndice): EsitoCop {
    const c = coppie(unita || [], lingua), l = lacune(unita || [], struttura, lingua), avvisi: string[] = [];
    for (const d of c.duplicati) avvisi.push('🔁 Possibile doppione: «' + d.titoloA + '» e «' + d.titoloB + '» (stessi concetti, stesse pagine): valuta di unirle.');
    for (const x of l.lacune) avvisi.push('🕳 Argomento mancante: «' + x.titolo + '»' + pp(x.pagine) + ' non è in nessuna unità.');
    for (const r of c.ripetizioni) avvisi.push('↪ Ripetizione didattica: «' + r.titoloB + '» riprende «' + r.titoloA + '» su altre pagine (conservata).');
    const extra = avvisi.length - MAX_AVVISI;
    return { ...c, ...l, avvisi: extra > 0 ? avvisi.slice(0, MAX_AVVISI).concat(['… e altri ' + extra + ' avvisi.']) : avvisi };
  }
  return { analizza, coppie, lacune, voci, jaccard, sovrapp, SOGLIA_J, SOGLIA_PAG, SOGLIA_VOCE };
})();
