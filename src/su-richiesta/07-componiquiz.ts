// 07-componiquiz.ts — fase 9 e 12 del brief (27/11/2026), nel chunk del motore (motore-studio.js).
//
// «Componi un quiz»: lo studente sceglie un quiz SUI DEBOLI o CUMULATIVO, le materie, quante domande e il modo
// (Allenamento = correzione subito · Esame = correzione alla fine, a tempo). Un solo quiz con domande di più schede,
// alternate (interleaving g = 0,42 [A], Brunmair & Richter 2019); il risultato si divide per scheda: aggiorna la padronanza
// `con:` e l'SRS delle domande, NON il punteggio delle schede (come VerificaConcetti). Le sbagliate entrano in «Quiz da rifare».
// La stessa macchina fa la simulazione d'esame del Generatore senza file su Drive (modo Esame a tempo, minuti e domande scelti
// a mano: decisione utente 27/11) e la revisione degli errori il giorno dopo (correzione ritardata [B], Butler et al. 2007).
// Scouting: docs/scouting/2026-11-27-quiz-manuali-e-simulazioni.md.

type TipoComposto = 'deboli' | 'cumulativo';
interface CandidatoQuiz { sk: string; etichette: string[]; materia: string; r: number; peggiore: StatoConcetto; }
interface OpzComposto { tipo: TipoComposto; materie: string[]; n: number; esame: boolean; minuti: number; titolo?: string; piano?: string; voce?: string; }
interface SimulazioneApp extends Simulazione { piano?: string; voce?: string; errate?: [string, string][]; }

const ComponiQuiz = (() => {
  const ORD: StatoConcetto[] = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];
  const DEBOLI: StatoConcetto[] = ['da_studiare', 'da_consolidare'];
  /** domande per scheda: sui deboli 3 per concetto (MIN_AFFIDABILE, così un concetto può consolidarsi); cumulativo 1 per concetto (ampiezza). */
  //  (funzione e non costante: nel chunk questo file precede 07-verificaconcetti, concatenati in ordine alfabetico)
  const perScheda = (t: TipoComposto) => t === 'deboli' ? VerificaConcetti.PER * VerificaConcetti.MAX_CON : VerificaConcetti.MAX_CON;

  /**
   * Pura. Deboli: concetti da studiare/da consolidare o scaduti (mai il ripiego), per scheda i più deboli, dalla scheda peggiore.
   * Cumulativo: tutte le schede verificate più quelle fatte senza quiz in app (`fatte`, concetti presi dal focus al caricamento),
   * dal ricordo più basso. In entrambi materie alternate (la prima di ogni materia, poi la seconda…).
   */
  function candidati(tipo: TipoComposto, mem: MemoriaCon[], giorno: string, materiaDi: (sk: string) => string, fatte: string[], materie: string[]): CandidatoQuiz[] {
    const per = new Map<string, { e: string; p: PadronanzaCon; scad: boolean }[]>();
    for (const m of mem) {
      if (!m || m.deleted || !String(m.er || '').startsWith('con:') || m.ripiego || !m.sk || !m.etichetta || !m.ultimo) continue;
      const p = Concetti.stato(m, giorno), scad = m.due <= giorno;
      if (tipo === 'deboli' && !scad && !DEBOLI.includes(p.stato)) continue;
      const l = per.get(m.sk) || []; l.push({ e: m.etichetta, p, scad }); per.set(m.sk, l);
    }
    if (tipo === 'cumulativo') for (const sk of fatte) if (!per.has(sk)) per.set(sk, []);
    const peso = (x: { p: PadronanzaCon; scad: boolean }) => (x.scad ? 0 : 1) + ORD.indexOf(x.p.stato) * 10 + (x.p.r === null ? 1 : x.p.r);
    const out: CandidatoQuiz[] = [];
    per.forEach((l, sk) => {
      const materia = materiaDi(sk); if (materie.length && !materie.includes(materia)) return;
      const c = l.sort((a, b) => peso(a) - peso(b) || (a.e < b.e ? -1 : 1)).slice(0, VerificaConcetti.MAX_CON);
      out.push({ sk, etichette: c.map(z => z.e), materia, r: c.length ? Math.min(...c.map(z => z.p.r === null ? 1 : z.p.r)) : 0, peggiore: c.length ? c[0].p.stato : 'non_verificato' });
    });
    out.sort((a, b) => tipo === 'deboli' ? ORD.indexOf(a.peggiore) - ORD.indexOf(b.peggiore) || a.r - b.r || (a.sk < b.sk ? -1 : 1) : a.r - b.r || (a.sk < b.sk ? -1 : 1));
    const code = new Map<string, CandidatoQuiz[]>(); for (const s of out) { const l = code.get(s.materia) || []; l.push(s); code.set(s.materia, l); }
    const alt: CandidatoQuiz[] = [], liste = Array.from(code.values());
    for (let i = 0; alt.length < out.length; i++) for (const l of liste) if (l[i]) alt.push(l[i]);
    return alt;
  }

  /** Pura: alterna le schede domanda per domanda (A1 B1 C1 A2 …) fino a n; ogni gruppo è già alternato per concetto. */
  function intreccia<D>(gruppi: D[][], n: number): D[] {
    const out: D[] = [];
    for (let i = 0; out.length < n && gruppi.some(g => g[i]); i++) for (const g of gruppi) if (g[i] && out.length < n) out.push(g[i]);
    return out;
  }

  /** Pura: divide il risultato del quiz misto per scheda (punteggio, sbagliate, dettagli) per Cattura.salva in modo «verifica». */
  function dividi(r: RisultatoQuiz, skDi: Map<string, string>): Map<string, RisultatoQuiz> {
    const per = new Map<string, EsitoQ[]>();
    for (const e of r.dettagli || []) { const sk = skDi.get(e.id); if (!sk) continue; const l = per.get(sk) || []; l.push(e); per.set(sk, l); }
    const out = new Map<string, RisultatoQuiz>();
    per.forEach((det, sk) => {
      const giuste = det.filter(e => e.ok).length, sb = det.filter(e => !e.ok);
      out.set(sk, { imc: 'quiz-risultato', pct: Math.round(giuste * 100 / det.length), giuste, totale: det.length, livelli: [], debole: null, errori: false,
        domandeSvolte: det.map(e => e.q), sbagliate: sb.map(e => [e.q, e.giusta, e.spieg || ''] as [string, string, string]), dettagli: det, verifica: true, misto: true });
    });
    return out;
  }

  const matSk = (sk: string) => { const t = trovaScheda(sk); return t ? t.m : '?'; };
  const fatte = () => Stato.tutti<Progresso>('progresso').filter(p => !p.deleted && p.fatta && trovaScheda(p.id.slice(5))).map(p => p.id.slice(5));

  /** Carica le domande dei candidati (una banca per step, in cache) finché bastano per n. */
  async function domande(cand: CandidatoQuiz[], n: number, per: number): Promise<{ gruppi: DomB[][]; immagini: Record<string, string>; focus: Map<string, string> }> {
    const gruppi: DomB[][] = [], immagini: Record<string, string> = {}, focus = new Map<string, string>();
    const viste = new Map(Stato.tutti<StatQ>('statq').filter(s => !s.deleted).map(s => [s.id, s.ultima || ''] as [string, string]));
    let tot = 0;
    for (const c of cand) {
      if (tot >= n) break;
      const t = trovaScheda(c.sk); if (!t) continue;
      let b: Awaited<ReturnType<typeof Banca.scheda>>;
      try { b = await Banca.scheda(t.pk, t.m, t.micro, t.s); } catch (e) { console.warn('ComponiQuiz: banca ' + c.sk, e); continue; }
      const lista = Concetti.etichette(b.focus || ''), doms = b.domande.map(d => ({ ...d, sk: c.sk }));
      if (!doms.length) continue;
      const ass = Concetti.assegna(c.sk, t.s.titolo, doms.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' && d.o ? d.o[0] : String(d.show || ''),
        spieg: Array.isArray(d.e) ? d.e.join(' ') : String(d.e || ''), concetto: d.concetto })), lista, Locale);
      const et = c.etichette.length ? c.etichette : lista.slice(0, VerificaConcetti.MAX_CON);
      let sel = VerificaConcetti.scegli(doms, ass, et, id => viste.get('sq-' + id) || '');
      if (per < VerificaConcetti.PER * et.length) sel = sel.slice(0, per);   // cumulativo: la prima domanda di ogni concetto
      if (!sel.length) continue;
      gruppi.push(sel); tot += sel.length; Object.assign(immagini, b.immagini); if (b.focus) focus.set(c.sk, b.focus);
    }
    return { gruppi, immagini, focus };
  }

  /** Apre il quiz misto. `fatto` riceve le sbagliate [sk, id] (per la simulazione). */
  function apriMisto(lista: DomB[], immagini: Record<string, string>, focus: Map<string, string>, o: { occh: string; titolo: string; esame: boolean; minuti: number },
    fatto?: (r: RisultatoQuiz, errate: [string, string][], minuti: number) => void): void {
    const t0 = trovaScheda(lista[0].sk); if (!t0) return;
    const skDi = new Map(lista.map(d => [d.id, d.sk] as [string, string])), inizio = Date.now();
    let ferma: (() => void) | null = null, tick = 0, salvata = false;
    QuizApp.apri(t0.pk, t0.m, t0.micro, t0.s, () => lista, { occh: o.occh, titolo: o.titolo, immagini, modo: o.esame ? 'esame' : 'neuro', verifica: true,
      ferma: f => { ferma = f; },
      fine: r => {
        clearInterval(tick);
        const parti = dividi(r, skDi), annulli: (() => void)[] = [];
        parti.forEach((rp, sk) => { const t = trovaScheda(sk); rp.titoloScheda = t ? t.s.titolo : sk; rp.focus = focus.get(sk); annulli.push(Cattura.salva(sk, rp, undefined, true)); });
        // per la revisione anche le senza risposta (tempo scaduto); per la padronanza e «Quiz da rifare» solo le risposte date
        const giuste = new Set((r.dettagli || []).filter(e => e.ok).map(e => e.id)), sb = (r.dettagli || []).filter(e => !e.ok && skDi.has(e.id)).length;
        const errate = lista.filter(d => !giuste.has(d.id)).map(d => [d.sk, d.id] as [string, string]);
        const box = document.querySelector('.qz-carta');
        if (box) box.appendChild(h('p.tenue.piccolo.misto-riga', null, '🧩 Padronanza aggiornata su ' + parti.size + (parti.size === 1 ? ' scheda' : ' schede') + ' · il punteggio delle schede non cambia'
          + (sb ? ' · ' + sb + (sb === 1 ? ' sbagliata torna' : ' sbagliate tornano') + ' in «Quiz da rifare»' : '')));
        if (fatto && !salvata) { salvata = true; fatto(r, errate, Math.round((Date.now() - inizio) / 60000)); }   // «Rifai» non crea una seconda simulazione
        avviso('🧩 Quiz salvato: ' + r.giuste + '/' + r.totale + ' su ' + parti.size + (parti.size === 1 ? ' scheda' : ' schede') + ' · tocca per annullare', 8000,
          () => { annulli.forEach(f => f()); avviso('Annullato: risultato non salvato.'); });
      } });
    if (!o.esame || !o.minuti) return;
    // limite di tempo (modo Esame): conto alla rovescia nella barra del visore, avvisi a 10 e 1 minuto, poi il quiz si chiude
    const fineT = inizio + o.minuti * 60000, el = h('span.misto-tempo', { role: 'timer', 'aria-live': 'off' });
    const vis = Array.from(document.querySelectorAll('.visore')).pop(); vis?.querySelector('.visore-strumenti')?.appendChild(el);
    const avvisati = new Set<number>();
    const aggiorna = () => {
      if (!el.isConnected || document.querySelector('.qz-punti')) { clearInterval(tick); return; }   // .qz-carta è anche la carta della domanda
      const s = Math.max(0, Math.round((fineT - Date.now()) / 1000)), m = Math.floor(s / 60);
      el.textContent = '⏱ ' + m + ':' + String(s % 60).padStart(2, '0');
      for (const k of [10, 1]) if (m < k && o.minuti > k && !avvisati.has(k)) { avvisati.add(k); avviso('⏱ ' + (k === 1 ? 'Manca 1 minuto' : 'Mancano ' + k + ' minuti')); }
      if (s <= 0) { clearInterval(tick); avviso('⏰ Tempo scaduto: le domande senza risposta contano come sbagliate e tornano nella revisione.', 6000); if (ferma) ferma(); }
    };
    tick = window.setInterval(aggiorna, 1000); aggiorna();
  }

  async function avvia(o: OpzComposto): Promise<void> {
    const cand = candidati(o.tipo, Stato.tutti<MemoriaCon>('memoria'), ymd(new Date()), matSk, fatte(), o.materie);
    if (!cand.length) { avviso(o.tipo === 'deboli' ? 'Nessun concetto debole o scaduto: per ora sei in pari.' : 'Nessuna scheda studiata in queste materie.', 6000); return; }
    avviso('Preparo le domande…', 2500);
    const { gruppi, immagini, focus } = await domande(cand, o.n, perScheda(o.tipo));
    const lista = intreccia(gruppi, o.n);
    if (!lista.length) { avviso('⚠️ Domande non disponibili (serve la connessione la prima volta).', 6000); return; }
    const sim = !!o.piano;
    apriMisto(lista, immagini, focus, { occh: (sim ? '📝 Simulazione d\'esame' : o.tipo === 'deboli' ? '🎯 Quiz sui punti deboli' : '📚 Quiz cumulativo') + ' · ' + lista.length + ' domande · '
      + gruppi.length + (gruppi.length === 1 ? ' scheda' : ' schede') + (o.esame ? ' · correzione alla fine' + (o.minuti ? ' · ' + o.minuti + ' min' : '') : ''),
      titolo: o.titolo || (o.materie.length ? o.materie.map(nomeMateria).join(' · ') : 'Tutte le materie'), esame: o.esame, minuti: o.esame ? o.minuti : 0 },
      sim ? (r, errate, minuti) => {
        const ad = new Date(), rec: SimulazioneApp = { id: 'sim-' + ad.getTime(), type: 'simulazione', updatedAt: 0, data: ymd(ad), ora: hm(ad), fileId: 'app', nome: o.titolo || 'Simulazione in app',
          pct: r.pct, giuste: r.giuste, totale: r.totale, deboli: r.livelli, debole: r.debole, minuti, limite: o.minuti, piano: o.piano, voce: o.voce, errate };
        Stato.salva(rec);
      } : undefined);
  }

  /** Revisione degli errori dell'ultima simulazione del piano (correzione ritardata): solo le sbagliate, in Allenamento. */
  async function revisione(piano: string): Promise<void> {
    const s = Stato.tutti<SimulazioneApp>('simulazione').filter(x => !x.deleted && x.piano === piano && x.errate).sort((a, b) => a.data + a.ora < b.data + b.ora ? 1 : -1)[0];
    if (!s) { avviso('Nessuna simulazione in app per questo piano: fai prima la simulazione, poi qui rivedi gli errori.', 6000); return; }
    if (!s.errate!.length) { avviso('🎉 Nessun errore nella simulazione del ' + s.data.slice(8) + '/' + s.data.slice(5, 7) + ': ripassa le carte di oggi.', 6000); return; }
    const per = new Map<string, string[]>(); for (const [sk, id] of s.errate!) { const l = per.get(sk) || []; l.push(id); per.set(sk, l); }
    const gruppi: DomB[][] = [], immagini: Record<string, string> = {}, focus = new Map<string, string>();
    for (const [sk, ids] of per) {
      const t = trovaScheda(sk); if (!t) continue;
      try { const b = await Banca.scheda(t.pk, t.m, t.micro, t.s); const g = b.domande.filter(d => ids.includes(d.id)).map(d => ({ ...d, sk })); if (g.length) { gruppi.push(g); Object.assign(immagini, b.immagini); if (b.focus) focus.set(sk, b.focus); } }
      catch (e) { console.warn('ComponiQuiz: revisione ' + sk, e); }
    }
    const lista = intreccia(gruppi, Infinity);
    if (!lista.length) { avviso('⚠️ Domande della simulazione non disponibili (serve la connessione la prima volta).', 6000); return; }
    apriMisto(lista, immagini, focus, { occh: '🔍 Revisione degli errori · simulazione del ' + s.data.slice(8) + '/' + s.data.slice(5, 7) + ' · ' + lista.length + ' domande', titolo: s.nome, esame: false, minuti: 0 });
  }

  /** Foglio «Componi un quiz» (anche per la simulazione: modo Esame, tutte le materie del piano, domande e minuti a scelta). */
  function apri(pre?: Partial<OpzComposto>): void {
    const o: OpzComposto = { tipo: 'deboli', materie: [], n: 18, esame: false, minuti: Simulazioni.minutiPredefiniti(), ...pre };
    const sim = !!o.piano, presenti = Array.from(new Set(Stato.tutti<MemoriaCon>('memoria').filter(m => !m.deleted && String(m.er || '').startsWith('con:') && m.sk).map(m => matSk(m.sk))
      .concat(fatte().map(matSk)))).filter(m => m !== '?').sort();
    const corpo = h('div.modulo');
    // simulazione: i file della cartella Drive nello stesso foglio (decisione utente 27/11), con i minuti scelti qui; senza Google, un pulsante
    const drive = h('div.gruppo.misto-drive');
    if (sim && Drive.pronto) {
      drive.appendChild(h('div.tenue.piccolo', null, 'Cerco le simulazioni su Drive…'));
      Simulazioni.file().then(lista => {
        svuota(drive); if (!lista.length) return;
        const fatte = Simulazioni.tutte();
        drive.append(h('div.tenue.piccolo', null, 'Oppure una simulazione da Drive (stessi minuti):'), ...lista.map(x => {
          const nome = x.name.replace(/\.html?$/i, ''), prec = fatte.filter(z => z.fileId === x.id);
          return h('button.voce-lista', { type: 'button', onclick: () => { f.chiudi(); void avviaSimulazione(x.id, nome, o.minuti || Simulazioni.minutiPredefiniti()); } },
            h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, nome),
              h('span.voce-sotto', null, prec.length ? 'Fatta ' + prec.length + (prec.length === 1 ? ' volta' : ' volte') + (prec[0].pct != null ? ' · ultima ' + prec[0].pct + '%' : '') : 'Mai fatta')));
        }));
      }, e => { svuota(drive); console.warn('ComponiQuiz: simulazioni Drive', e); });
    } else if (sim) drive.appendChild(h('button.btn.neutro', { type: 'button', onclick: () => { f.chiudi(); void apriSimulazioni(); } }, 'Accedi a Google per le simulazioni su Drive'));
    const seg = <T>(voci: [T, string][], val: T, set: (v: T) => void) => h('div.segmenti', null, voci.map(([v, t]) => h('button' + (v === val ? '.attivo' : ''), { type: 'button', onclick: () => { set(v); disegna(); } }, t)));
    const num = (v: number, min: number, max: number, set: (n: number) => void, et: string) => {
      const i = h('input', { type: 'number', min: String(min), max: String(max), value: String(v), 'aria-label': et, inputmode: 'numeric' }) as HTMLInputElement;
      i.onchange = () => { const n = Math.round(+i.value); set(n >= min && n <= max ? n : v); i.value = String(n >= min && n <= max ? n : v); }; return i;
    };
    function disegna(): void {
      svuota(corpo);
      const parti: (HTMLElement | null)[] = [
        sim ? h('p.tenue.piccolo', null, 'Domande di tutte le schede studiate, alternate tra le materie. Correzione alla fine; domani la revisione riapre solo le sbagliate.')
          : riga('Cosa', seg<TipoComposto>([['deboli', '🎯 Punti deboli'], ['cumulativo', '📚 Cumulativo']], o.tipo, v => { o.tipo = v; })),
        !sim ? h('p.tenue.piccolo', null, o.tipo === 'deboli' ? 'Concetti da studiare, da consolidare o con la verifica scaduta: 3 domande per concetto, dal più debole.'
          : 'Una domanda per concetto da tutte le schede studiate, dal ricordo più basso, alternate tra le materie.') : null,
        presenti.length > 1 ? riga('Materie', h('div.chips', null, h('button.chip' + (o.materie.length ? '' : '.on'), { type: 'button', onclick: () => { o.materie = []; disegna(); } }, 'Tutte'),
          presenti.map(m => h('button.chip' + (o.materie.includes(m) ? '.on' : ''), { type: 'button', onclick: () => { o.materie = o.materie.includes(m) ? o.materie.filter(x => x !== m) : o.materie.concat(m); disegna(); } }, nomeMateria(m))))) : null,
        riga('Domande', h('div.chips', null, [9, 18, 27, 36].map(n => h('button.chip' + (o.n === n ? '.on' : ''), { type: 'button', onclick: () => { o.n = n; disegna(); } }, String(n))),
          num(o.n, 3, 120, n => { o.n = n; }, 'Numero di domande'))),
        sim ? null : riga('Modo', seg<boolean>([[false, '🧠 Allenamento'], [true, '📝 Esame']], o.esame, v => { o.esame = v; })),
        o.esame ? riga('Minuti', h('div.chips', null, num(o.minuti, 0, 300, n => { o.minuti = n; }, 'Minuti a disposizione'), h('span.tenue.piccolo', null, '0 = senza limite'))) : null,
        h('button.btn', { type: 'button', onclick: () => { f.chiudi(); void avvia(o); } }, sim ? '▶ Inizia la simulazione' : '▶ Inizia il quiz'),
        sim ? drive : null];
      for (const el of parti) if (el) corpo.appendChild(el);
    }
    const f = foglio({ titolo: sim ? '📝 Simulazione d\'esame' : '🧩 Componi un quiz', corpo });
    disegna();
  }

  /** Voce speciale del piano: SIM → simulazione in app (o da Drive), REV/revisione → errori della simulazione, VERIFICA → Drive. */
  function daVoce(p: PkPiano, v: VocePiano): void {
    if (/^VERIFICA/.test(v.k)) { void apriSimulazioni(); return; }
    if (/^REV-/.test(v.k) || /^🔍/.test(v.t)) { void revisione(p.id); return; }
    const g = (p as PianoGen).generato, materie = g && g.argomenti ? Array.from(new Set(g.argomenti.map(k => materiaDi(k)))).filter(Boolean) : [];
    apri({ tipo: 'cumulativo', esame: true, n: 27, materie, piano: p.id, voce: v.k, titolo: v.t.replace(/^\S+\s/, '') });
  }

  return { candidati, intreccia, dividi, apri, avvia, revisione, daVoce, perScheda };
})();
