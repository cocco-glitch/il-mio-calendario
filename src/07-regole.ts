// 07-regole.ts — Quiz Studio Q4 (v0.25): regole che imparano dall'esperienza.
//
// Legge le statistiche per domanda (record 'statq') e:
//  • raggruppa gli errori degli esercizi generati per TIPO (chiave dk del distrattore → categoria);
//  • dopo N errori dello stesso tipo mostra un avviso con il consiglio, nel quiz;
//  • per le domande della banca avvisa se la stessa domanda è già stata sbagliata;
//  • negli esercizi generati sceglie più spesso i modelli in cui sbagli (quota «deboli»);
//  • nel quiz nativo può mettere prima le domande già sbagliate (ordineQuiz = 'deboli-prima').
// Le regole sono un oggetto JSON: predefinite qui, modificabili in Altro → Regole dei quiz (record
// 'regole', id 'regole-quiz', sincronizzato su Drive). Claude può proporre una versione nuova da incollare.

interface CatErrore { etichetta: string; consiglio: string; dk: string[]; }
interface RegoleQuiz { versione: number; avvisoDopo: number; quotaDeboli: number; minTentativi: number; ordineQuiz: 'scheda' | 'deboli-prima'; categorie: Record<string, CatErrore>; }
interface RegoleRec extends Rec { type: 'regole'; json: string; }

const Regole = (() => {
  const ID = 'regole-quiz';
  const PREDEFINITE: RegoleQuiz = {
    versione: 1,
    avvisoDopo: 2,          // dalla 2ª volta dello stesso tipo di errore compare l'avviso
    quotaDeboli: 0.5,       // metà degli esercizi generati viene dai modelli in cui sbagli di più
    minTentativi: 2,        // un modello conta come «debole» solo dopo almeno 2 tentativi
    ordineQuiz: 'scheda',   // 'deboli-prima' = nel quiz nativo prima le domande già sbagliate
    categorie: {
      unita: { etichetta: 'Unità di misura non convertite', consiglio: 'Prima di sostituire porta tutto nelle stesse unità (m, s, kg, L, m², m³, Pa) e scrivi l\'unità accanto a ogni numero.', dk: ['ml', 'kmh', 'noconv', 'min', 'cm', 'cm2', 'dm3', 'mm', 'pa', 'km', 'cento', 'mille', 'esp', 'milli', 'per36', 'cm3', 'r', 'ordine'] },
      kelvin: { etichetta: 'Temperatura in °C invece che in K', consiglio: 'Nelle formule di termodinamica, gas e soluzioni T va in kelvin: T = t + 273.', dk: ['celsius'] },
      joule: { etichetta: 'J e kJ confusi', consiglio: 'ΔH è di solito in kJ, ΔS in J/K: converti prima di sottrarre (÷1000 o ×1000).', dk: ['joule'] },
      segno: { etichetta: 'Segno sbagliato', consiglio: 'Scrivi la formula con il suo segno prima dei numeri, e metti tra parentesi i valori negativi.', dk: ['segno'] },
      inverso: { etichetta: 'Rapporto invertito o operazione sbagliata', consiglio: 'Controlla le unità del risultato: dicono cosa sta al numeratore e cosa al denominatore.', dk: ['inv', 'div', 'molt', 'unok', 'mmolt', 'divi'] },
      fattore: { etichetta: 'Fattore dimenticato (½, 2, g, i, ρ…)', consiglio: 'Scrivi sempre la formula completa prima di sostituire, poi spunta ogni simbolo mentre metti il numero.', dk: ['nomezzo', 'no2', 'nog', 'noi', 'norho', 'noh', 'nok', 'noquad', 'noradice', 'pi', 'nopi', 'nocos', 'meta', 'doppio', 'sin', 'cos', 'tan', 'massa', 'soloh'] },
      grandezza: { etichetta: 'Hai calcolato un\'altra grandezza', consiglio: 'Rileggi cosa chiede la domanda: tempo o spazio? rimasta o decaduta? molecole o atomi? relativa o assoluta?', dk: ['tempo', 'omega', 'soloa', 'peso', 'lavoro', 'p', 'assoluta', 'decaduta', 'atomi', 'energia', 'resp', 'gh', 'uguale', 'somma', 'diff', 'solo2', 'nodiv', 'keb'] },
      stechiometria: { etichetta: 'Coefficienti stechiometrici ignorati', consiglio: 'Il rapporto in moli è quello dei coefficienti: moli cercate = moli date × (coeff. cercato / coeff. dato).', dk: ['solo'] },
      conteggio: { etichetta: 'Conteggi (cromosomi, ioni, molecole)', consiglio: 'Fai uno schema: quante unità prima, cosa raddoppia o si divide, quante dopo.', dk: ['n', '2n', '4n', 'n2', 'uno', 'piu1', 'meno1', 'p1', 'm1', 'p2', 'm2', 'x2', 'lordi', 'tre', 'lineare'] },
    },
  };

  let cache: RegoleQuiz | null = null, cacheTs = -1;
  function get(): RegoleQuiz {
    const r = Stato.prendi<RegoleRec>(ID), ts = r && !r.deleted ? r.updatedAt : 0;
    if (cache && ts === cacheTs) return cache;
    let x: RegoleQuiz = PREDEFINITE;
    if (r && !r.deleted) try { const j = JSON.parse(r.json); x = { ...PREDEFINITE, ...j, categorie: { ...PREDEFINITE.categorie, ...(j.categorie || {}) } }; } catch (_) { /* JSON rotto: predefinite */ }
    cache = x; cacheTs = ts; return x;
  }
  function categoriaDi(dk: string): string {
    const c = get().categorie;
    for (const k of Object.keys(c)) if (c[k].dk.includes(dk)) return k;
    return 'altro';
  }
  /** Errori per categoria negli esercizi generati (somma delle scelte sbagliate per dk). */
  function perTipo(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of Stato.tutti<StatQ>('statq')) if (s.id.startsWith('sq-g-') && s.scelte) for (const [dk, n] of Object.entries(s.scelte)) { const c = categoriaDi(dk); out[c] = (out[c] || 0) + n; }
    return out;
  }
  /** Avviso da mostrare dopo una risposta sbagliata ('' se nessuno). */
  function avvisoRisposta(d: DomB, dk: string | null): string {
    const R = get();
    if (d.gen && dk) {
      const c = categoriaDi(dk); if (c === 'altro') return '';
      const n = perTipo()[c] || 0;
      if (n >= R.avvisoDopo) return '⚠️ ' + n + 'ª volta: ' + R.categorie[c].etichetta.toLowerCase() + '. ' + R.categorie[c].consiglio;
      return '';
    }
    const s = Stato.prendi<StatQ>('sq-' + d.id);
    const sb = s && !s.deleted ? s.n - s.ok : 0;
    return sb >= R.avvisoDopo ? '⚠️ Hai sbagliato questa domanda ' + sb + ' volte: rileggi la spiegazione dalle fonti e poi chiedi la versione «Dettagliata» all\'AI.' : '';
  }
  /** Tasso d'errore di un modello generato (0..1), null se pochi tentativi. */
  function errModello(id: string): number | null {
    const s = Stato.prendi<StatQ>('sq-g-' + id);
    if (!s || s.deleted || s.n < get().minTentativi) return null;
    return (s.n - s.ok) / s.n;
  }
  /** Sceglie l'ordine dei modelli per una serie: quota ai più sbagliati, il resto a rotazione. */
  function scegliModelli<T extends { id: string }>(ms: T[], n: number): T[] {
    const R = get(), out: T[] = [];
    const deboli = ms.map(m => ({ m, e: errModello(m.id) })).filter(x => x.e !== null && x.e > 0).sort((a, b) => b.e! - a.e!);
    const nd = deboli.length ? Math.round(n * R.quotaDeboli) : 0;
    for (let i = 0; i < nd; i++) {
      // estrazione pesata sul tasso d'errore
      const tot = deboli.reduce((a, x) => a + x.e!, 0); let r = Math.random() * tot;
      const x = deboli.find(y => (r -= y.e!) <= 0) || deboli[0]; out.push(x.m);
    }
    for (let i = 0; out.length < n; i++) out.push(ms[i % ms.length]);
    return out;
  }
  /** Ordine delle domande del quiz nativo secondo la regola. */
  function ordina(domande: DomB[]): number[] {
    const idx = domande.map((_, k) => k);
    if (get().ordineQuiz !== 'deboli-prima') return idx;
    const err = (d: DomB) => { const s = Stato.prendi<StatQ>('sq-' + d.id); return s && !s.deleted ? s.n - s.ok : 0; };
    return idx.sort((a, b) => err(domande[b]) - err(domande[a]));
  }

  // ---- Studio → Errori: errori tipici ----
  function sezioneTipici(): HTMLElement | null {
    const t = perTipo(), R = get();
    const voci = Object.entries(t).filter(([c]) => R.categorie[c]).sort((a, b) => b[1] - a[1]);
    const modelli = Generatori.MODELLI.map(m => ({ m, e: errModello(m.id), s: Stato.prendi<StatQ>('sq-g-' + m.id) })).filter(x => x.e !== null && x.e >= 0.5).sort((a, b) => b.e! - a.e!);
    if (!voci.length && !modelli.length) return null;
    return h('section.card', null, h('h2.card-titolo', null, 'I tuoi errori tipici'),
      h('div.tenue.piccolo', null, 'Dagli esercizi generati (🎲): che tipo di errore fai più spesso e come evitarlo.'),
      voci.map(([c, n]) => h('div.dom-voce', null, h('div', null, h('b', null, R.categorie[c].etichetta), ' · ' + n + (n === 1 ? ' volta' : ' volte')), h('div.tenue.piccolo', null, R.categorie[c].consiglio))),
      modelli.length ? h('div', null, h('div.gruppo-titolo', null, 'Esercizi dove sbagli di più'),
        modelli.slice(0, 8).map(x => h('div.tenue.piccolo', null, nomeMateria(x.m.m) + ' · ' + x.m.titolo + ' — ' + Math.round(x.e! * 100) + '% di errori su ' + x.s!.n))) : null);
  }

  // ---- Altro → Regole dei quiz ----
  function sezioneAltro(): HTMLElement {
    const r = Stato.prendi<RegoleRec>(ID), propria = !!(r && !r.deleted);
    const ta = h('textarea.regole-json', { rows: 12, spellcheck: false, value: JSON.stringify(get(), null, 1) }) as HTMLTextAreaElement;
    const box = h('div', { hidden: true }, ta, h('div.bottoni', null,
      h('button.btn', { onclick: () => {
        let j: any; try { j = JSON.parse(ta.value); } catch (e: any) { avviso('JSON non valido: ' + e.message, 7000); return; }
        if (typeof j !== 'object' || !j.categorie) { avviso('Mancano le categorie.', 5000); return; }
        Stato.salva({ id: ID, type: 'regole', updatedAt: 0, json: JSON.stringify(j) } as RegoleRec, true); cache = null; avviso('Regole salvate.'); disegna();
      } }, 'Salva regole'),
      propria ? h('button.btn.neutro', { onclick: () => { Stato.elimina(ID); cache = null; avviso('Ripristinate le regole predefinite.'); disegna(); } }, 'Ripristina predefinite') : null,
      h('button.btn.neutro', { onclick: async () => { try { await navigator.clipboard.writeText(ta.value); avviso('Copiate: puoi incollarle a Claude.'); } catch (_) { ta.select(); avviso('Seleziona e copia a mano.'); } } }, '📋 Copia')));
    const R = get();
    return scheda('Regole dei quiz',
      h('div.tenue.piccolo', null, 'Come l\'app adatta quiz ed esercizi ai tuoi errori. ' + (propria ? 'Stai usando regole modificate.' : 'Regole predefinite.')),
      h('div.gruppo', null,
        riga('Avviso dalla', h('select', { onchange: (e: Event) => imposta({ avvisoDopo: +(e.target as HTMLSelectElement).value }) }, [2, 3, 4, 5].map(n => h('option', { value: n, selected: R.avvisoDopo === n }, n + 'ª volta')))),
        riga('Esercizi sui punti deboli', h('select', { onchange: (e: Event) => imposta({ quotaDeboli: +(e.target as HTMLSelectElement).value }) }, [[0, 'nessuno'], [0.25, '1 su 4'], [0.5, 'metà'], [0.75, '3 su 4']].map(([v, n]) => h('option', { value: v, selected: R.quotaDeboli === v }, String(n))))),
        riga('Ordine nel quiz', h('select', { onchange: (e: Event) => imposta({ ordineQuiz: (e.target as HTMLSelectElement).value as any }) }, [['scheda', 'come nella scheda'], ['deboli-prima', 'prima quelle già sbagliate']].map(([v, n]) => h('option', { value: v, selected: R.ordineQuiz === v }, n))))),
      h('button.btn-testo', { onclick: (e: Event) => { box.hidden = !box.hidden; (e.target as HTMLElement).textContent = box.hidden ? 'Modifica avanzata (JSON)' : 'Chiudi modifica avanzata'; } }, 'Modifica avanzata (JSON)'),
      box);
  }
  function imposta(p: Partial<RegoleQuiz>): void {
    const j = { ...get(), ...p };
    Stato.salva({ id: ID, type: 'regole', updatedAt: 0, json: JSON.stringify(j) } as RegoleRec, true); cache = null; avviso('Regola aggiornata.');
  }

  return { get, PREDEFINITE, categoriaDi, perTipo, avvisoRisposta, errModello, scegliModelli, ordina, sezioneTipici, sezioneAltro };
})();
