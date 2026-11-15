// =====================================================================
// 07-memoriaia.ts — v0.43 MEMORIA DEGLI ASSISTENTI AI (miglioramento progressivo)
// Un unico algoritmo di memoria usato da TUTTE le AI dell'app, con «ambiti» specifici per mansione
// e una parte generica (linee guida comuni). Ogni voce ha: tipo, chiave, valore, quante volte è stata
// confermata (n) e quando (t). Punteggio = conferme × recenza: le voci utili salgono, le vecchie e mai
// riconfermate scendono e, oltre il tetto per ambito, si dimenticano da sole.
// Tipi di voce:
//   correzione  «prima → dopo» (es. trascrizione audio: «in talpa» → «entalpia»; calcoli a mano: «7» → «1»)
//   termine     parola tecnica che l'utente usa davvero (aiuta Whisper e la lettura della scrittura a mano)
//   lezione     errore già commesso dall'AI e regola per non ripeterlo (es. «la corretta era la più lunga»)
//   esempio     frase dell'utente → azioni confermate (l'assistente impara il suo modo di chiedere)
//   posto       dove si trova cosa nel Drive (argomento → file e pagine utili): meno ricerche e meno token
// Ambiti: ricerca, quiz, audio, scrittura, calcolo, assistente, spiegazioni, generale.
// I record (type 'memia') si sincronizzano con gli altri dati, quindi la memoria vale su tutti i dispositivi.
// =====================================================================

interface VoceMemIA { tipo: string; k: string; v: any; n: number; t: number; }
interface MemIA extends Rec { type: 'memia'; ambito: string; voci: VoceMemIA[]; }

const MemoriaIA = (() => {
  const TETTO = 300, GIORNO = 864e5;
  const AMBITI: Record<string, string> = { ricerca: '🔎 Ricerca nel Drive', quiz: '✨ Creazione quiz', audio: '🎙 Trascrizione audio', scrittura: '✍️ Lettura della scrittura a mano',
    calcolo: '🧮 Calcoli a mano', assistente: '💬 Assistente della home', spiegazioni: '💡 Spiegazioni AI', generale: '🧠 Linee guida generali' };
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const parole = (s: string) => new Set(n2(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2));
  function simile(a: string, b: string): number { const A = parole(a), B = parole(b); if (!A.size || !B.size) return 0; let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / Math.min(A.size, B.size); }
  const rec = (ambito: string): MemIA => Stato.prendi<MemIA>('memia-' + ambito) || { id: 'memia-' + ambito, type: 'memia', updatedAt: 0, ambito, voci: [] };
  const punteggio = (x: VoceMemIA, ora = Date.now()) => x.n * Math.pow(.5, (ora - x.t) / (45 * GIORNO));   // dimezza ogni 45 giorni senza conferme
  /** Aggiunge o rinforza una voce. «peso» = quanto vale questa conferma (1 di base). */
  function nota(ambito: string, tipo: string, k: string, v: any = null, peso = 1): void {
    if (!k || !String(k).trim()) return;
    const r = rec(ambito), kk = n2(k), x = r.voci.find(y => y.tipo === tipo && n2(y.k) === kk);
    if (x) { x.n += peso; x.t = Date.now(); if (v !== null && v !== undefined) x.v = v; }
    else r.voci.push({ tipo, k: String(k).slice(0, 300), v, n: peso, t: Date.now() });
    if (r.voci.length > TETTO) { const ora = Date.now(); r.voci.sort((a, b) => punteggio(b, ora) - punteggio(a, ora)); r.voci.length = TETTO; }
    Stato.salva(r, true);
  }
  /** Indebolisce una voce sbagliata (es. una correzione rifiutata dall'utente). */
  function smentisci(ambito: string, tipo: string, k: string): void {
    const r = rec(ambito), kk = n2(k), i = r.voci.findIndex(y => y.tipo === tipo && n2(y.k) === kk); if (i < 0) return;
    r.voci[i].n -= 1; if (r.voci[i].n <= 0) r.voci.splice(i, 1); Stato.salva(r, true);
  }
  /** Le voci migliori di un tipo; con «testo» privilegia quelle simili (per esempi e posti). */
  function migliori(ambito: string, tipo: string, max = 10, testo?: string, minN = 1): VoceMemIA[] {
    const ora = Date.now();
    return rec(ambito).voci.filter(x => x.tipo === tipo && x.n >= minN)
      .map(x => ({ x, s: punteggio(x, ora) * (testo ? (simile(testo, x.k) + .05) : 1) })).filter(o => !testo || o.s > .05 * o.x.n)
      .sort((a, b) => b.s - a.s).slice(0, max).map(o => o.x);
  }
  /** Linee guida da mettere nel prompt di un'AI: le sue lezioni + quelle generali. */
  function linee(ambito: string, max = 6): string {
    const l = migliori(ambito, 'lezione', max).concat(migliori('generale', 'lezione', 3));
    return l.length ? '\nLEZIONI DALLE VOLTE PRECEDENTI (rispettale):\n- ' + l.map(x => x.v || x.k).join('\n- ') : '';
  }
  /** Applica le correzioni sicure (confermate almeno «minN» volte) a un testo: restituisce testo e cambi. */
  function correggi(ambito: string, testo: string, minN = 2): { testo: string; cambi: { prima: string; dopo: string }[] } {
    const cambi: { prima: string; dopo: string }[] = [];
    for (const c of migliori(ambito, 'correzione', 80, undefined, minN)) {
      const prima = c.k, dopo = String(c.v || ''); if (!dopo || prima.length < 2) continue;
      const re = new RegExp('(^|[^\\p{L}])(' + prima.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^\\p{L}])', 'giu');
      if (re.test(testo)) { testo = testo.replace(re, (_m, a) => a + dopo); cambi.push({ prima, dopo }); }
    }
    return { testo, cambi };
  }
  /** Differenze parola per parola tra due versioni (per imparare le correzioni «prima → dopo»). */
  function differenze(a: string, b: string): { prima: string; dopo: string }[] {
    const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean), out: { prima: string; dopo: string }[] = [];
    let i = 0, j = 0;
    while (i < A.length && j < B.length) {
      if (n2(A[i]) === n2(B[j])) { i++; j++; continue; }
      // cerco il prossimo punto di riallineamento
      let ii = -1, jj = -1;
      outer: for (let d = 1; d < 8; d++) for (let x = 0; x <= d; x++) { const p = i + x, q = j + d - x; if (p < A.length && q < B.length && n2(A[p]) === n2(B[q]) && n2(A[p]).length > 2) { ii = p; jj = q; break outer; } }
      if (ii < 0) { ii = A.length; jj = B.length; }
      const pr = A.slice(i, ii).join(' ').replace(/[.,;:!?]+$/, ''), dp = B.slice(j, jj).join(' ').replace(/[.,;:!?]+$/, '');
      if (pr && dp && pr.length < 60 && dp.length < 60) out.push({ prima: pr, dopo: dp });
      i = ii; j = jj;
    }
    return out;
  }
  const tutte = () => Stato.tutti<MemIA>('memia').filter(r => !r.deleted);
  /** Altro → Spiegazioni AI → «Memoria degli assistenti»: vedere e dimenticare. */
  function sezione(): HTMLElement {
    const box = h('div.memia');
    const disegnaM = () => {
      svuota(box);
      const rs = tutte(); const tot = rs.reduce((a, r) => a + r.voci.length, 0);
      box.append(h('div.tenue.piccolo', null, tot ? 'Gli assistenti hanno imparato ' + tot + ' cose dalle tue correzioni e conferme. Migliorano a ogni uso; qui puoi vederle e farle dimenticare.' : 'Ancora nulla: gli assistenti imparano dalle tue correzioni e conferme mentre usi l\'app.'));
      for (const r of rs) if (r.voci.length) box.append(h('details.memia-amb', null, h('summary', null, (AMBITI[r.ambito] || r.ambito) + ' · ' + r.voci.length),
        ...r.voci.slice().sort((a, b) => punteggio(b) - punteggio(a)).slice(0, 60).map(x => h('div.memia-voce', null,
          h('span', null, h('b', null, x.tipo), ' ' + (x.tipo === 'correzione' ? '«' + x.k + '» → «' + x.v + '»' : x.tipo === 'posto' ? x.k + ' → ' + ((x.v && x.v.files) || []).map((f: any) => f.name).join(', ') : x.tipo === 'esempio' ? '«' + x.k + '»' : String(x.v || x.k)) + ' · ×' + Math.round(x.n)),
          h('button.btn-testo', { type: 'button', onclick: () => { const rr = rec(r.ambito); rr.voci = rr.voci.filter(z => !(z.tipo === x.tipo && z.k === x.k)); Stato.salva(rr, true); disegnaM(); } }, 'Dimentica')))));
    };
    disegnaM();
    return h('div.gruppo', null, h('div.piccolo', null, h('b', null, '🧠 Memoria degli assistenti')), box);
  }
  return { nota, smentisci, migliori, linee, correggi, differenze, simile, sezione, tutte, AMBITI };
})();
