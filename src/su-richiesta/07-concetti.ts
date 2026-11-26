// 07-concetti.ts — motore unificato, blocco 6: il livello CONCETTO (audit S2 §6, §14). Modulo PURO (niente DOM, Stato o rete).
//
// Decisioni utente 26/11 (Sessione 7):
//  - etichette dei concetti = lista CHIUSA per scheda: il campo `focus` della banca («A, B (x, y), C» → 3 concetti; le virgole
//    tra parentesi non dividono); le domande AI portano già `concetto` (contratto quiz-v3/v4, ~5 token per domanda);
//  - assegnazione locale con il BM25 di IndicePagine (le etichette fanno da «pagine», domanda + risposta + spiegazione da query),
//    accettata solo se il primo punteggio supera il secondo di almeno il 30% (MARGINE). Misura sul pilota (3.906 domande):
//    68,4% assegnate nel prototipo (67,3% con questo codice: test/concetti.mjs), ~86% corrette su 25 controllate a mano; il resto ricade sul RIPIEGO = la scheda, dichiarato come tale;
//  - padronanza = record 'memoria' con er 'con:<chiave>' (stesso tipo di Ripassi e Carte, nessuna entità nuova), un passo FSRS
//    per concetto per giorno (più quiz nello stesso giorno si sommano e il passo si rifà dallo stato precedente).
// Solo le verifiche contano (lettura, appunto e generazione: peso 0, nessuna chiamata qui). Stati (audit §14):
//  non verificato · da studiare · da consolidare · in consolidamento · consolidato. Una verifica con < 3 domande sul concetto
//  non porta oltre «in consolidamento» (affidabilità); il microstep prende lo stato del suo concetto più debole.

type StatoConcetto = 'non_verificato' | 'da_studiare' | 'da_consolidare' | 'in_consolidamento' | 'consolidato';
interface EsitoCon { ok: boolean; caso?: string; }
interface AssegnaCon { chiave: string; etichetta: string; ripiego: boolean; }
/** Record di padronanza: Memoria + campi propri (tutti facoltativi per i lettori vecchi). */
interface MemoriaCon extends Memoria {
  sk: string; etichetta: string; ripiego?: boolean; /** risposte fortunate di oggi (per rifare il passo) */ fortOggi?: number;
  /** verifiche per giorno: [giorno, giuste, domande, illusioni], ultime 20 */ ver: [string, number, number, number][];
  prima?: { d: number; s: number; ultimo?: string; n: number; lapsi: number; due: string } | null;
}
interface PadronanzaCon { stato: StatoConcetto; giorni: number; ultimaAcc: number | null; r: number | null; s: number; ripiego: boolean; motivo: string; }

const Concetti = (() => {
  const MARGINE = 1.3, MIN_AFFIDABILE = 3, MAX_ETICHETTE = 12;
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const una = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
  const slug = (s: string) => n2(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const ORDINE: StatoConcetto[] = ['non_verificato', 'da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato'];
  const NOMI: Record<StatoConcetto, string> = { non_verificato: 'non verificato', da_studiare: 'da studiare', da_consolidare: 'da consolidare', in_consolidamento: 'in consolidamento', consolidato: 'consolidato' };

  /** «A, B (x, y); C» → ['A', 'B (x, y)', 'C']: virgole e punti e virgola fuori dalle parentesi, senza doppioni. */
  function etichette(focus: string): string[] {
    const out: string[] = [], visti = new Set<string>();
    let d = 0, cur = '';
    const chiudi = () => { const x = una(cur).replace(/^[-•·]\s*|[.\s]+$/g, ''); cur = ''; const k = slug(x); if (x.length >= 3 && k && !visti.has(k)) { visti.add(k); out.push(x.slice(0, 80)); } };
    for (const ch of String(focus || '')) {
      if (ch === '(' || ch === '[') d++;
      if ((ch === ')' || ch === ']') && d > 0) d--;
      if ((ch === ',' || ch === ';' || ch === '\n') && d === 0) chiudi(); else cur += ch;
    }
    chiudi();
    return out.slice(0, MAX_ETICHETTE);
  }
  const chiave = (sk: string, etichetta: string | null) => sk + '|' + (etichetta ? slug(etichetta) : '*');

  /**
   * Concetto di ogni domanda (per id). Ordine: `concetto` esplicito della domanda (AI) → BM25 sulle etichette con margine 30% →
   * ripiego sulla scheda. Senza etichette (meno di 2) e senza concetto esplicito: tutto ripiego.
   */
  function assegna(sk: string, titoloScheda: string, domande: { id: string; q: string; giusta?: string; spieg?: string; concetto?: string }[], lista: string[], lingua: LinguaIndice): Map<string, AssegnaCon> {
    const out = new Map<string, AssegnaCon>(), rip: AssegnaCon = { chiave: chiave(sk, null), etichetta: titoloScheda || sk, ripiego: true };
    const ind = lista.length >= 2 ? IndicePagine.costruisci(sk, lista.map((t, i) => ({ n: i + 1, testo: t })), lingua) : null;
    for (const d of domande) {
      const esp = una(d.concetto || '');
      if (esp) {   // l'AI ha scelto il concetto: se coincide con un'etichetta (stesso slug) si usa quella grafia
        const e = lista.find(x => slug(x) === slug(esp)) || esp.slice(0, 80);
        out.set(d.id, { chiave: chiave(sk, e), etichetta: e, ripiego: false }); continue;
      }
      if (!ind) { out.set(d.id, rip); continue; }
      const q = new Map<string, number>();
      for (const w of IndicePagine.parole([d.q, d.giusta || '', d.spieg || ''].join(' '))) { const r = lingua.radice(w); q.set(r, 1); }
      const sc = ind.pagine.map(p => ({ n: p.n, s: punteggio(ind, p, q) })).sort((a, b) => b.s - a.s || a.n - b.n);
      const [a, b] = sc;
      if (a && a.s > 0 && a.s >= MARGINE * (b ? b.s : 0)) { const e = lista[a.n - 1]; out.set(d.id, { chiave: chiave(sk, e), etichetta: e, ripiego: false }); }
      else out.set(d.id, rip);
    }
    return out;
  }
  /** BM25 (k1 1,2, b 0,75) di un'etichetta per la query: stessa formula di IndicePagine, ma la query conta i termini una volta. */
  function punteggio(ind: IndiceLibro, p: PaginaIdx, q: Map<string, number>): number {
    let s = 0;
    for (const r of q.keys()) {
      const f = p.tf.get(r) || 0; if (!f) continue;
      const df = ind.df.get(r) || 0, idf = Math.log(1 + (ind.N - df + 0.5) / (df + 0.5));
      s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * p.len / (ind.avgdl || 1)));
    }
    return s;
  }

  const giorniTra = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const piu = (k: string, n: number) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  /** Voto FSRS di una verifica: illusione o accuratezza < 0,5 → 1; < 0,8 → 2; tutto giusto senza fortuna su ≥ 3 domande → 4; altrimenti 3. */
  function voto(giuste: number, tot: number, illusioni: number, fortunate: number): number {
    const acc = tot ? giuste / tot : 0;
    if (illusioni || acc < 0.5) return 1;
    if (acc < 0.8) return 2;
    return giuste === tot && !fortunate && tot >= MIN_AFFIDABILE ? 4 : 3;
  }
  /**
   * Nuovo stato del concetto dopo gli esiti di un quiz (puro: restituisce il record da salvare).
   * Stesso giorno dell'ultima verifica: gli esiti si sommano a quelli di oggi e il passo si rifà da `prima`.
   */
  function aggiorna(m0: MemoriaCon | undefined, base: { id: string; chiave: string; sk: string; etichetta: string; ripiego: boolean }, esiti: EsitoCon[], giorno: string, ritenzione = 0.9): MemoriaCon {
    const g0 = esiti.filter(e => e.ok).length, i0 = esiti.filter(e => !e.ok && e.caso === 'illusione_competenza').length;
    const f0 = esiti.filter(e => e.ok && e.caso === 'lucky_guess').length;
    const ver = (m0 && m0.ver ? m0.ver.slice() : []) as [string, number, number, number][];
    const stessoGiorno = !!(m0 && m0.ultimo === giorno && ver.length && ver[ver.length - 1][0] === giorno);
    const prec = stessoGiorno ? ver.pop()! : null;
    const giuste = g0 + (prec ? prec[1] : 0), tot = esiti.length + (prec ? prec[2] : 0), ill = i0 + (prec ? prec[3] : 0);
    const fort = f0 + (stessoGiorno ? (m0!.fortOggi || 0) : 0);
    ver.push([giorno, giuste, tot, ill]);
    const pr = stessoGiorno ? (m0!.prima || null) : m0 ? { d: m0.d, s: m0.s, ultimo: m0.ultimo, n: m0.n, lapsi: m0.lapsi, due: m0.due } : null;
    const g = voto(giuste, tot, ill, fort), t = pr && pr.ultimo ? Math.max(0, giorniTra(pr.ultimo, giorno)) : 0;
    const st = Fsrs.passo(pr && pr.ultimo ? { d: pr.d, s: pr.s } : null, g, t);
    const log = ((m0 && m0.log) || []).filter(x => x[0] !== giorno).concat([[giorno, g]] as [string, number][]).slice(-50);
    return { id: base.id, type: 'memoria', updatedAt: 0, er: 'con:' + base.chiave, sk: base.sk, etichetta: base.etichetta, ...(base.ripiego ? { ripiego: true } : {}),
      d: st.d, s: st.s, due: piu(giorno, Fsrs.intervallo(st.s, ritenzione)), ultimo: giorno, n: (pr ? pr.n : 0) + 1,
      lapsi: (pr ? pr.lapsi : 0) + (pr && pr.ultimo && g === 1 ? 1 : 0), log, ver: ver.slice(-20), prima: pr, fortOggi: fort } as MemoriaCon;
  }
  /** Stato del concetto oggi, con il motivo (regole dell'audit §14; mai «sbagliato» per un concetto mai verificato). */
  function stato(m: MemoriaCon | undefined, giorno: string): PadronanzaCon {
    const rip = !!(m && m.ripiego);
    if (!m || !m.ver || !m.ver.length || !m.ultimo) return { stato: 'non_verificato', giorni: 0, ultimaAcc: null, r: null, s: 0, ripiego: rip, motivo: 'nessuna verifica' };
    const v = m.ver, u = v[v.length - 1], acc = (x: [string, number, number, number]) => x[2] ? x[1] / x[2] : 0;
    const giorni = new Set(v.map(x => x[0])).size, ua = acc(u), r = Fsrs.recuperabilita(Math.max(0, giorniTra(m.ultimo, giorno)), m.s);
    const ult3 = (m.log || []).slice(-3), lapsiRecenti = ult3.filter(x => x[1] === 1).length;
    const base = { giorni, ultimaAcc: Math.round(ua * 100) / 100, r: Math.round(r * 100) / 100, s: Math.round(m.s * 10) / 10, ripiego: rip };
    const pct = Math.round(ua * 100) + '%';
    if (ua < 0.5 || lapsiRecenti >= 2) return { ...base, stato: 'da_studiare', motivo: lapsiRecenti >= 2 ? '2 errori nelle ultime 3 verifiche' : 'ultima verifica ' + pct };
    if (giorni < 2 || r < 0.8 || ua < 0.8) return { ...base, stato: 'da_consolidare', motivo: giorni < 2 ? 'verificato in un solo giorno' : r < 0.8 ? 'ricordo stimato ' + Math.round(r * 100) + '%' : 'ultima verifica ' + pct };
    const ult2 = v.slice(-2), arco = giorniTra(v[0][0], u[0]);
    const consolidato = giorni >= 3 && arco >= 7 && ult2.every(x => acc(x) >= 0.8) && m.s >= 21 && ult2.every(x => !x[3]) && u[2] >= MIN_AFFIDABILE;
    if (consolidato) return { ...base, stato: 'consolidato', motivo: giorni + ' giorni su ' + arco + ', stabilità ' + Math.round(m.s) + ' g' };
    return { ...base, stato: 'in_consolidamento', motivo: u[2] < MIN_AFFIDABILE ? 'solo ' + u[2] + ' domande nell\'ultima verifica' : 'stabilità ' + Math.round(m.s) + ' g (consolidato da 21)' };
  }
  /** Microstep (o scheda) = il concetto più debole, con la frazione dei concetti verificati: nessuna generalizzazione. */
  function insieme(stati: PadronanzaCon[]): { stato: StatoConcetto; verificati: number; totale: number } {
    const ver = stati.filter(s => s.stato !== 'non_verificato');
    const peggiore = ver.length ? ver.map(s => s.stato).sort((a, b) => ORDINE.indexOf(a) - ORDINE.indexOf(b))[0] : 'non_verificato';
    return { stato: ver.length < stati.length && peggiore === 'consolidato' ? 'in_consolidamento' : peggiore, verificati: ver.length, totale: stati.length };
  }
  return { etichette, assegna, aggiorna, stato, insieme, voto, chiave, slug, NOMI, MARGINE, MIN_AFFIDABILE };
})();
