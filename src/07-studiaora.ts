// 07-studiaora.ts — "Studia ora" (v0.15, F4 ridotta, tattiche T15–T19).
//
// Un tasto in cima a Oggi: scegli quanto tempo hai (25/50/90 min) e l'app compone la sessione,
// una cosa alla volta, in quest'ordine:
//  1. la coda unica dei ripassi (CodaRipasso, v0.59): sotto-step (al massimo ~40% del tempo), carte, quiz, appunti, piano;
//  2. step del giorno: prova a freddo se lo step non è iniziato, poi le prioritarie da fare in ordine;
//  3. schede da rifare (errori), se avanza tempo;
//  4. 5 minuti finali di richiamo a memoria (cosa ho imparato? scrivo una domanda).
// Le pause sono inserite ogni ~25 minuti. Il timer della sessione parte con la durata scelta.
// La sessione in corso si salva sul dispositivo (localStorage) per riprenderla.

interface VoceSessione { tipo: 'ripasso' | 'carte' | 'quiz' | 'appunto' | 'piano' | 'freddo' | 'scheda' | 'errore' | 'pausa' | 'richiamo'; titolo: string; sotto: string; min: number; k?: string; id?: string; fatto?: boolean; }
interface SessioneOra { inizio: number; minuti: number; voci: VoceSessione[]; }

const StudiaOra = (() => {
  const CH = 'imc-studia-ora', MIN = 10;
  const leggi = (): SessioneOra | null => { try { return JSON.parse(localStorage.getItem(CH) || 'null'); } catch (_) { return null; } };
  const scrivi = (s: SessioneOra | null) => { try { s ? localStorage.setItem(CH, JSON.stringify(s)) : localStorage.removeItem(CH); } catch (_) { /* niente */ } };

  function componi(minuti: number, giorno = oggi()): VoceSessione[] {
    const out: VoceSessione[] = [];
    let resto = minuti - 5;                                     // 5 min finali di richiamo
    const metti = (v: VoceSessione) => { if (resto >= v.min) { out.push(v); resto -= v.min; return true; } return false; };
    // 1) v0.59: la coda unica (CodaRipasso) in ordine di rischio × vicinanza dell'esame, con i tetti di prima:
    //    sotto-step ≤ ~40% del tempo, flashcard 5–15 min, quiz ~1 min a domanda (max 10), appunti al massimo 3, ripassi del piano
    let tettoRip = Math.max(MIN, Math.round(minuti * 0.4)), nAp = 0;
    for (const e of CodaRipasso.dovuti(ymd(giorno))) {
      if (e.sorgente === 'step') { if (tettoRip >= MIN && metti(e.voce)) tettoRip -= MIN; }
      else if (e.sorgente === 'appunti') { if (nAp < 3) { nAp++; metti(e.voce); } }
      else metti(e.voce);
    }
    // 2) step del giorno
    for (const vg of Studio.vociDelGiorno(giorno)) {
      if (vg.v.speciale || vg.p.modo === 'raffinamento') continue;
      const t = Studio.trovaSotto(vg.v.k); if (!t) continue;
      if (Freddo.possibile(vg.v.k) && !Freddo.rec(vg.v.k)) metti({ tipo: 'freddo', titolo: '🧊 Prova a freddo ' + Studio.etichetta(vg.v.k), sotto: 'Prima di leggere: d\'istinto, non conta', min: MIN, k: vg.v.k });
      for (const s of Studio.schedeDi(t.sub).filter(x => x.tipo === 'P' && !Studio.fatta(x.id)))
        if (!metti({ tipo: 'scheda', titolo: '📖 ' + Studio.etichetta(vg.v.k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo + ' · pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)), min: MIN, k: vg.v.k, id: s.id })) break;
    }
    // 3) errori
    for (const x of tutteLeSchede().filter(x => daRifare(x.s.id)))
      if (!metti({ tipo: 'errore', titolo: '✏️ Da rifare · ' + Studio.etichetta(x.sub.k), sotto: x.s.titolo, min: MIN, k: x.sub.k, id: x.s.id })) break;
    // pause ogni ~25 minuti di lavoro
    const conPause: VoceSessione[] = []; let acc = 0;
    out.forEach((v, i) => { conPause.push(v); acc += v.min; if (acc >= 25 && i < out.length - 1 && minuti >= 50) { conPause.push({ tipo: 'pausa', titolo: '☕ Pausa', sotto: 'Alzati, bevi, niente social: il cervello consolida', min: 5 }); acc = 0; } });
    conPause.push({ tipo: 'richiamo', titolo: '🔁 Richiamo finale', sotto: 'Senza guardare: scrivi i 3 concetti chiave di oggi e una domanda d\'esame che ti faresti', min: 5 });
    return conPause;
  }

  function avvia(minuti: number): SessioneOra {
    const s: SessioneOra = { inizio: Date.now(), minuti, voci: componi(minuti) };
    scrivi(s);
    const prima = s.voci.find(v => v.k);
    Timer.avvia({ m: prima && prima.k ? materiaDi(prima.k) : undefined, k: prima && prima.k, titolo: 'Studia ora · ' + minuti + ' min', durata: minuti });
    return s;
  }
  function segnaFatto(i: number): void { const s = leggi(); if (!s || !s.voci[i]) return; s.voci[i].fatto = !s.voci[i].fatto; scrivi(s); }
  function chiudi(): void { scrivi(null); }
  return { componi, avvia, leggi, segnaFatto, chiudi };
})();

/** Esegue una voce: apre il quiz giusto (ripasso, scheda, errore) o la prova a freddo. */
function eseguiVoce(v: VoceSessione): void {
  if (v.tipo === 'freddo' && v.k) { avviaProvaAFreddo(v.k); return; }
  if (v.tipo === 'carte') { avviaCarte(undefined, 'Flashcard'); return; }
  if (v.tipo === 'quiz') { QuizRifare.avvia(); return; }
  if (v.tipo === 'piano' && v.id) { apriPianoDi(v.id); return; }
  if (v.tipo === 'appunto' && v.id) { const a = Stato.prendi<Appunto>(v.id); if (a) { apriCornell(a, true); return; } }
  if (v.id) { const t = trovaScheda(v.id); if (t) { apriScheda(t.pk, t.m, t.micro, t.s, v.tipo === 'ripasso' || v.tipo === 'errore'); return; } }
  avviso(v.sotto, 8000);
}

function apriStudiaOra(): void {
  const s = StudiaOra.leggi();
  if (s) { apriSessione(); return; }
  let minuti = 50;
  const corpo = h('div.modulo');
  const disegnaS = () => {
    svuota(corpo);
    const voci = StudiaOra.componi(minuti);
    [
      h('div.gruppo-titolo', null, 'Quanto tempo hai?'),
      h('div.chips', null, [25, 50, 90].map(m => h('button.chip' + (m === minuti ? '.attivo' : ''), { onclick: () => { minuti = m; disegnaS(); } }, m + ' min'))),
      h('div.gruppo-titolo', null, 'La tua sessione'),
      h('div.gruppo', null, voci.map(v => h('div.widget-riga', null, h('span.nome', null, v.titolo, h('div.tenue.piccolo', null, v.sotto)), h('span.tenue.piccolo', null, v.min + "'")))),
      h('div.tenue.piccolo', null, 'Prima i ripassi più a rischio, poi lo step di oggi, poi gli errori; si chiude con un richiamo a memoria. Silenzia il telefono (Full immersion).'),
    ].forEach(el => corpo.appendChild(el));
  };
  disegnaS();
  foglio({ titolo: '▶ Studia ora', corpo, etichettaSalva: 'Inizia', salva: () => { StudiaOra.avvia(minuti); setTimeout(apriSessione, 50); } });
}

function apriSessione(): void {
  const corpo = h('div.modulo');
  const disegnaS = () => {
    const s = StudiaOra.leggi(); svuota(corpo); if (!s) return;
    const prossima = s.voci.findIndex(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
    [
      h('div.tenue.piccolo', null, fatte + ' di ' + s.voci.length + ' fatte · ' + s.minuti + ' minuti · iniziata alle ' + hm(new Date(s.inizio))),
      barra(fatte, s.voci.length),
      h('div.gruppo', null, s.voci.map((v, i) => h('div.voce-lista.task' + (v.fatto ? '.fatto' : '') + (i === prossima ? '.sessione-ora' : ''), null,
        h('button.spunta' + (v.fatto ? '.on' : ''), { 'aria-label': v.fatto ? 'Da fare' : 'Fatto', onclick: () => { StudiaOra.segnaFatto(i); disegnaS(); } }, v.fatto ? '✓' : ''),
        h('button.voce-corpo', { onclick: () => eseguiVoce(v) }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.titolo), h('span.voce-sotto', null, v.sotto + ' · ' + v.min + "'"))))),
      prossima >= 0 ? h('div.bottoni', null, h('button.btn', { onclick: () => eseguiVoce(s.voci[prossima]) }, '▶ ' + s.voci[prossima].titolo.replace(/^\S+\s/, ''))) : h('div.vuoto', null, '🎉 Sessione completata. Ora 5 minuti di pausa tranquilla, senza schermo.'),
    ].forEach(el => corpo.appendChild(el));
  };
  disegnaS();
  foglio({ titolo: 'Sessione in corso', corpo, etichettaSalva: 'Termina', salva: () => { StudiaOra.chiudi(); avviso('Sessione chiusa.'); } });
}

/** Riquadro in cima a Oggi. */
function widgetStudiaOra(): HTMLElement {
  const s = StudiaOra.leggi();
  if (s) {
    const prossima = s.voci.find(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
    return h('section.card', null, h('button.btn.studia-ora', { onclick: apriSessione }, '▶ Sessione in corso · ' + fatte + '/' + s.voci.length),
      prossima ? h('div.tenue.piccolo', { style: { marginTop: '6px' } }, 'Prossima: ' + prossima.titolo) : null);
  }
  // v0.58: card «Adesso» — cosa fare ora in una riga, durata stimata e [Inizia] che avvia subito la sessione (2 tocchi da app chiusa)
  // Il riassunto (2 composizioni della sessione) si calcola dopo il disegno: Oggi resta nel budget dei tempi (prestazioni.py).
  const e = prossimoEsame(), durata = h('span'), riassunto = h('div.tenue.piccolo', { style: { margin: '2px 0 8px' } }, '…');
  const inizia = () => { const a = adesso(); if (!a.minuti) { Timer.avvia({ titolo: 'Studio libero' }); return; } StudiaOra.avvia(a.minuti); setTimeout(apriSessione, 50); };
  const btn = h('button.btn.studia-ora', { onclick: inizia }, '▶ Inizia');
  setTimeout(() => {
    if (!riassunto.isConnected) return;
    const a = adesso(); riassunto.textContent = a.riassunto;
    durata.textContent = a.minuti ? ' · ' + a.minuti + ' min' : ''; if (!a.minuti) btn.textContent = '▶ Studio libero con timer';
  }, 0);
  return h('section.card.adesso', null,
    h('div.adesso-testa', null, h('b', null, 'Adesso'), durata,
      e ? h('span.tenue.piccolo', null, ' · ' + (e.giorni === 0 ? 'esame oggi' : '−' + e.giorni + (e.giorni === 1 ? ' giorno' : ' giorni')) + ' a ' + e.nome + (e.stato ? ' · ' + e.stato : '')) : null),
    riassunto,
    h('div.bottoni', null, lungo(btn, () => [
      { t: 'Scegli quanto tempo hai', ic: 'cronometro', f: () => apriStudiaOra() },
      { t: 'Ripassa le flashcard', ic: 'carte', f: () => { UI.studioVista = 'carte'; UI.studioSub = null; vai('studio'); } },
      { t: 'Rivedi gli errori', ic: 'avvertenza', f: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } },
      { t: 'Studio libero con timer', ic: 'cronometro', f: () => Timer.avvia({ titolo: 'Studio libero' }) },
      { t: 'Simulazione d\'esame', ic: 'quiz', f: () => apriSimulazioni() }], 'Studia ora'),
      h('button.btn-testo', { onclick: apriStudiaOra }, 'Altra durata')));
}

/** v0.58: la sessione consigliata adesso — la durata più corta (25/50/90) che contiene tutto il dovuto, e una riga di riassunto. */
function adesso(giorno = oggi()): { minuti: number; riassunto: string } {
  const lavoro = (vv: VoceSessione[]) => vv.filter(v => v.tipo !== 'pausa' && v.tipo !== 'richiamo');
  const tutto = lavoro(StudiaOra.componi(90, giorno)), serve = tutto.reduce((s, v) => s + v.min, 0);
  if (!tutto.length) return { minuti: 0, riassunto: 'Niente in scadenza: buon momento per avanzare o per una pausa vera.' };
  const minuti = [25, 50, 90].find(m => serve + 5 <= m) || 90, voci = lavoro(StudiaOra.componi(minuti, giorno));
  const n = (tipo: VoceSessione['tipo']) => voci.filter(v => v.tipo === tipo).length, pezzi: string[] = [];
  const nc = Carte.conta(), nq = QuizRifare.conta(ymd(giorno));
  if (n('ripasso')) pezzi.push(n('ripasso') + (n('ripasso') === 1 ? ' ripasso' : ' ripassi'));
  if (n('carte')) pezzi.push((nc.ripasso + nc.nuove) + ' carte');
  if (n('quiz')) pezzi.push(Math.min(nq, QuizRifare.MAX) + ' quiz da rifare');
  if (n('appunto')) pezzi.push(n('appunto') + (n('appunto') === 1 ? ' appunto' : ' appunti'));
  if (n('piano')) pezzi.push(n('piano') + (n('piano') === 1 ? ' ripasso del piano' : ' ripassi del piano'));
  const st = voci.find(v => (v.tipo === 'scheda' || v.tipo === 'freddo') && v.k);
  if (st && st.k) pezzi.push(Studio.etichetta(st.k));
  if (n('errore')) pezzi.push(n('errore') + ' errori');
  return { minuti, riassunto: pezzi.join(' + ') || voci[0].titolo };
}
/** v0.58: esame più vicino (oggi compreso) e stato rispetto al piano. */
/** v0.60: giorni al prossimo esame se la «Modalità esame» è attiva (≤ 21 giorni, non spenta), altrimenti null. */
function modalitaEsame(): number | null {
  if ((imp() || {} as Impostazioni).modoEsame === 'no') return null;
  const gg = Stato.tutti<Esame>('esame').map(x => giorniA(x.data)).filter(n => n >= 0);
  const m = gg.length ? Math.min(...gg) : Infinity;
  return m <= 21 ? m : null;
}
function prossimoEsame(): { nome: string; giorni: number; stato: string } | null {
  const e = Stato.tutti<Esame>('esame').filter(x => !x.deleted && giorniA(x.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1)[0];
  if (!e) return null;
  const r = Studio.pkPiani().length ? Studio.inRitardo().length : -1;
  return { nome: e.nome.replace(/ semestre filtro$/i, ''), giorni: giorniA(e.data), stato: r < 0 ? '' : r ? 'indietro di ' + r + ' step' : 'in pari ✓' };
}
