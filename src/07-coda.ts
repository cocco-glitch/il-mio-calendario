// 07-coda.ts — v0.59 «Coda unica» (CodaRipasso).
//
// Le 5 cose da ripassare (sotto-step, flashcard, quiz da rifare, appunti, ripassi del piano L1–L4) avevano 5 elenchi
// separati e 3 riquadri in Oggi. Qui diventano una coda sola, ordinata per rischio di oblio × vicinanza dell'esame.
// Ogni sorgente è un adapter che chiama la funzione che già decideva cosa è dovuto: la coda SOLO LEGGE, non scrive
// nessuno stato (le date di ripasso le scrivono, come prima, quiz, visore carte, Cornell e Ripassi.registra).
// Studia ora compone la sessione da qui; Oggi mostra un solo riquadro «🧠 Ripassa (N)» (U6).

type SorgenteCoda = 'step' | 'carte' | 'quiz' | 'appunti' | 'piano';
interface ElemCoda {
  sorgente: SorgenteCoda; id: string; titolo: string; sotto: string;
  /** Quante cose conta in «Ripassa (N)» (carte e quiz sono raggruppati in un elemento). */
  n: number; min: number; rischio: number; priorita: number;
  materia?: string; k?: string; ids?: string[];
  /** Voce già pronta per Studia ora. */
  voce: VoceSessione; apri: () => void;
}

const CodaRipasso = (() => {
  const ORDINE: SorgenteCoda[] = ['step', 'carte', 'quiz', 'appunti', 'piano'];   // a parità di priorità, l'ordine di prima
  const MIN = 10;
  const giornoData = (g: string) => new Date(g + 'T12:00');

  function step(g: string): ElemCoda[] {
    const out: ElemCoda[] = [];
    for (const x of Ripassi.delGiorno(g).oggi) {
      const sc = Ripassi.schedaDaProporre(x.k); if (!sc) continue;
      const t = trovaScheda(sc.id), sub = Studio.trovaSotto(x.k), pc = Math.round(x.r * 100) + '%';
      out.push({ sorgente: 'step', id: 'step:' + x.k, k: x.k, materia: materiaDi(x.k), n: 1, min: MIN, rischio: 1 - x.r, priorita: 0,
        titolo: Studio.etichetta(x.k) + (sub ? ' · ' + sub.sub.titolo : ''),
        sotto: 'Rifai: ' + (t ? t.micro + ' ' + t.s.titolo + ' (' + t.s.k + '/' + t.s.n + ')' : sc.titolo) + ' · ricordo ' + pc,
        voce: { tipo: 'ripasso', titolo: '🧠 Ripasso ' + Studio.etichetta(x.k), sotto: 'Rifai: ' + sc.titolo + ' · ricordo ' + pc, min: MIN, k: x.k, id: sc.id },
        apri: () => { const s = trovaScheda(sc.id); if (s) apriScheda(s.pk, s.m, s.micro, s.s, true); } });
    }
    return out;
  }
  function carte(g: string): ElemCoda[] {
    if (!Carte.mazzi().length) return [];
    const nc = Carte.conta(), n = nc.ripasso + nc.nuove; if (!n) return [];
    const min = Math.min(15, Math.max(5, Math.round(n * 0.2))), sotto = nc.ripasso + ' da ripassare + ' + nc.nuove + ' nuove';
    return [{ sorgente: 'carte', id: 'carte', n, min, rischio: nc.ripasso ? 1 - Ripassi.ritenzione(g) : 0.05, priorita: 0,
      titolo: '🃏 Flashcard (' + n + ')', sotto, voce: { tipo: 'carte', titolo: '🃏 Flashcard', sotto, min }, apri: () => avviaCarte(undefined, 'Flashcard') }];
  }
  function quiz(g: string): ElemCoda[] {
    const d = QuizRifare.dovute(g); if (!d.length) return [];
    const ill = d.some(s => !!(s.neuro && s.neuro.tag && s.neuro.tag.includes('illusione_competenza')));
    const sotto = (d.length > QuizRifare.MAX ? 'Le ' + QuizRifare.MAX + ' più urgenti' : 'Le domande scadute') + ', prima le illusioni di competenza';
    const min = Math.max(3, QuizRifare.minuti(d.length));
    return [{ sorgente: 'quiz', id: 'quiz', ids: d.map(s => s.id), n: d.length, min, rischio: ill ? 0.5 : 1 - Ripassi.ritenzione(g), priorita: 0,
      titolo: '🎯 Quiz da rifare (' + d.length + ')', sotto, voce: { tipo: 'quiz', titolo: '🎯 Quiz da rifare (' + d.length + ')', sotto, min }, apri: () => { QuizRifare.avvia(); } }];
  }
  function appunti(g: string): ElemCoda[] {
    return Appunti.appuntiDaRipassare().map(a => {
      const sotto = 'Copri e ricorda · ' + Appunti.daRipassare(a).length + ' sezioni';
      return { sorgente: 'appunti' as SorgenteCoda, id: a.id, materia: a.sub ? materiaDi(a.sub) : undefined, n: 1, min: 4, rischio: 1 - Ripassi.ritenzione(g), priorita: 0,
        titolo: '🧠 ' + a.titolo, sotto, voce: { tipo: 'appunto' as VoceSessione['tipo'], titolo: '🧠 ' + a.titolo, sotto, min: 4, id: a.id }, apri: () => apriCornell(a, true) };
    });
  }
  function piano(g: string): ElemCoda[] {
    return Studio.vociDelGiorno(giornoData(g)).filter(x => x.v.isRipassoFSRS && !Studio.stepFatto(x.v.k, x.p)).map(x => {
      const min = x.v.min || MIN, pid = x.p.id;
      return { sorgente: 'piano' as SorgenteCoda, id: 'piano:' + pid + ':' + x.v.k, k: x.v.k, materia: materiaDi(x.v.k) || undefined, n: 1, min, rischio: 1 - Ripassi.ritenzione(g), priorita: 0,
        titolo: x.v.t, sotto: x.p.titolo || 'Piano', voce: { tipo: 'piano' as VoceSessione['tipo'], titolo: x.v.t, sotto: (x.p.titolo || 'Piano') + ' · ancoraggio FSRS', min, k: x.v.k, id: pid },
        apri: () => apriPianoDi(pid) };
    });
  }
  const ADAPTER: Record<SorgenteCoda, (g: string) => ElemCoda[]> = { step, carte, quiz, appunti, piano };

  /** 0..1: quanto è vicino l'esame (della materia, se c'è; un esame senza materie vale per tutte). */
  function vicinanza(materia: string | undefined, g: string): number {
    const es = Stato.tutti<Esame>('esame').filter(e => !e.deleted && (!materia || !e.materie || !e.materie.length || e.materie.includes(materia)));
    let d = Infinity; for (const e of es) { const x = Math.round((daDt(e.data).getTime() - daDt(g).getTime()) / 864e5); if (x >= 0 && x < d) d = x; }
    return d === Infinity ? 0 : Math.max(0, 1 - d / 60);
  }

  function per(s: SorgenteCoda, g = ymd(new Date())): ElemCoda[] {
    return ADAPTER[s](g).map(e => ({ ...e, priorita: Math.round(e.rischio * (1 + vicinanza(e.materia, g)) * 20) / 20 }));
  }
  /** Tutto ciò che è dovuto oggi, il più urgente per primo. */
  function dovuti(g = ymd(new Date())): ElemCoda[] {
    const tutti = ORDINE.flatMap(s => per(s, g).map((e, i) => ({ e, o: ORDINE.indexOf(s), i })));
    return tutti.sort((a, b) => b.e.priorita - a.e.priorita || a.o - b.o || a.i - b.i).map(x => x.e);
  }
  const conta = (g?: string) => dovuti(g).reduce((s, e) => s + e.n, 0);
  return { dovuti, per, conta, vicinanza };
})();

/** Apre un piano nella vista Studio → Piano. */
function apriPianoDi(pid: string): void { UI.studioVista = 'piano'; UI.studioPiano = pid; vai('studio'); }

/** v0.59 (U6): un solo riquadro in Oggi al posto di «Ripassi di oggi», «Flashcard di oggi» e «Appunti da ripassare». */
function widgetRipassa(): HTMLElement | null {
  const el = CodaRipasso.dovuti(), r = Ripassi.delGiorno();
  if (!el.length) return r.fatti.length ? h('section.card.ripassa', null, h('h2.card-titolo', null, '🧠 Ripassa'),
    h('div.tenue.piccolo', null, '✓ Ripassi di oggi fatti (' + r.fatti.length + '). Ottimo: la fatica di ricordare è ciò che fissa la memoria.')) : null;
  const somma = (s: SorgenteCoda) => el.filter(e => e.sorgente === s).reduce((t, e) => t + e.n, 0);
  const nomi: [SorgenteCoda, string, string][] = [['step', 'sotto-step', 'sotto-step'], ['carte', 'carta', 'carte'], ['quiz', 'quiz', 'quiz'], ['appunti', 'appunto', 'appunti'], ['piano', 'dal piano', 'dal piano']];
  const pezzi = nomi.map(([s, uno, piu]) => { const n = somma(s); return n ? n + ' ' + (n === 1 ? uno : piu) : ''; }).filter(Boolean);
  const min = el.reduce((t, e) => t + e.min, 0), N = el.reduce((t, e) => t + e.n, 0), MAX = 5;
  return h('section.card.ripassa', null,
    h('h2.card-titolo', null, '🧠 Ripassa (' + N + ')'),
    h('div.tenue.piccolo', null, pezzi.join(' · ') + ' · circa ' + min + ' min, prima il più a rischio'),
    el.slice(0, MAX).map(e => h('button.voce-lista', { onclick: () => e.apri() },
      h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, e.titolo), h('span.voce-sotto', null, e.sotto)), icona('dx', 18))),
    el.length > MAX ? h('div.tenue.piccolo', null, '+' + (el.length - MAX) + ' altri: li trovi in «Studia ora».') : null,
    r.coda.length ? h('div.tenue.piccolo', null, '+' + r.coda.length + ' sotto-step in coda per i prossimi giorni (tetto: ' + (imp().ripassoMinuti || 30) + ' min al giorno).') : null,
    h('div.bottoni', null, h('button.btn', { onclick: () => el[0].apri() }, '▶ Inizia')));
}
