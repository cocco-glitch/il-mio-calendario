// =====================================================================
// 07-assistente.ts — v0.42 ASSISTENTE DELLA HOME: coordina tutta l'app da una frase.
// Prima prova il riconoscimento locale (07-rapido: eventi e promemoria con data/ora, offline e immediato);
// se la frase chiede altro, l'AI «veloce» la traduce in AZIONI tipizzate che l'app esegue con le sue
// funzioni (mai codice libero): evento, promemoria, appunto, quiz da creare, flashcard, ricerca, apertura
// di una vista, «studia ora», lezione audio, oppure una risposta sull'uso dell'app.
// Le azioni che creano qualcosa si confermano con un tocco (si possono togliere); aprire/cercare è immediato.
// =====================================================================

type AzioneA =
  | { tipo: 'evento'; titolo: string; data: string; inizio?: string; fine?: string; tutto_il_giorno?: boolean; ripeti?: string }
  | { tipo: 'promemoria'; titolo: string; data?: string; ora?: string; ripeti?: string }
  | { tipo: 'appunto'; titolo: string; testo?: string; modo?: 'testo' | 'mano' }
  | { tipo: 'quiz'; argomento: string; materia?: string; cosa?: string; parole?: string }
  | { tipo: 'carte'; argomento?: string }
  | { tipo: 'cerca'; testo: string }
  | { tipo: 'apri'; vista: string }
  | { tipo: 'studia_ora' } | { tipo: 'lezione_audio'; titolo?: string } | { tipo: 'pacchetti' } | { tipo: 'quiz_creati' }
  | { tipo: 'risposta'; testo: string };

/** il dialogo di scelta globale (dentro Assistente «chiedi» è la funzione dell'assistente) */
const scegliTra = (t: string, o: { testo: string; valore: string; pericolo?: boolean }[], sotto?: string) => chiedi(t, o, sotto);

const Assistente = (() => {
  const VISTE: Record<string, () => void> = {
    oggi: () => vai('oggi'), calendario: () => vai('cal'), studio: () => { UI.studioVista = 'schede'; vai('studio'); }, piano: () => { UI.studioVista = 'piano'; vai('studio'); },
    carte: () => { UI.studioVista = 'carte'; vai('studio'); }, errori: () => { UI.studioVista = 'errori'; vai('studio'); }, statistiche: () => { UI.studioVista = 'statistiche'; vai('studio'); },
    esami: () => { UI.studioVista = 'esami'; vai('studio'); }, syllabus: () => { UI.studioVista = 'syllabus'; vai('studio'); }, tabelle: () => { UI.studioVista = 'tabelle'; vai('studio'); },
    appunti: () => vai('appunti'), promemoria: () => vai('task'), note: () => vai('note'), impostazioni: () => vai('altro'), altro: () => vai('altro'),
  };
  const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  function ricorrenza(s?: string): Ricorrenza | undefined {
    if (!s) return undefined; const n = norm(s);
    if (/giorn/.test(n)) return { freq: 'D', interval: 1 } as Ricorrenza;
    if (/mes/.test(n)) return { freq: 'M', interval: 1 } as Ricorrenza;
    if (/ann/.test(n)) return { freq: 'Y', interval: 1 } as Ricorrenza;
    const by = GG.map((g, i) => n.includes(g) ? i : -1).filter(i => i >= 0);
    if (/settiman|ogni/.test(n) || by.length) return { freq: 'W', interval: 1, ...(by.length ? { byday: by } : {}) } as Ricorrenza;
    return undefined;
  }
  const ora = (s?: string): [number, number] | undefined => { const m = /^(\d{1,2})[:.](\d{2})/.exec(s || ''); return m ? [+m[1], +m[2]] : undefined; };
  const giorno = (s?: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  function descrivi(a: AzioneA): string {
    switch (a.tipo) {
      case 'evento': return '📅 Evento «' + a.titolo + '» · ' + (giorno(a.data) ? fmt(giorno(a.data)!, { weekday: 'short', day: 'numeric', month: 'short' }) : a.data) + (a.tutto_il_giorno ? ' · tutto il giorno' : a.inizio ? ' · ' + a.inizio + (a.fine ? '–' + a.fine : '') : '') + (a.ripeti ? ' · ' + a.ripeti : '');
      case 'promemoria': return '🔔 Promemoria «' + a.titolo + '»' + (a.data && giorno(a.data) ? ' · ' + fmt(giorno(a.data)!, { weekday: 'short', day: 'numeric', month: 'short' }) : '') + (a.ora ? ' · ' + a.ora : '') + (a.ripeti ? ' · ' + a.ripeti : '');
      case 'appunto': return '📝 Nuovo appunto «' + a.titolo + '»' + (a.modo === 'mano' ? ' (a mano)' : '');
      case 'quiz': return '✨ Crea un quiz su «' + a.argomento + '»' + (a.materia ? ' · ' + a.materia : '');
      case 'carte': return '🃏 Flashcard' + (a.argomento ? ' su «' + a.argomento + '»' : '');
      case 'cerca': return '🔎 Cerca «' + a.testo + '»';
      case 'apri': return '↗ Apri ' + a.vista;
      case 'studia_ora': return '▶ Studia ora';
      case 'lezione_audio': return '🎙 Lezione audio' + (a.titolo ? ' «' + a.titolo + '»' : '');
      case 'pacchetti': return '☁︎ Aggiorna i pacchetti dal Drive';
      case 'quiz_creati': return '✨ Quiz creati in app';
      case 'risposta': return '💬 ' + a.testo;
    }
  }
  /** Esegue un'azione con le funzioni dell'app. */
  function esegui(a: AzioneA): Rec | null {
    switch (a.tipo) {
      case 'evento': case 'promemoria': {
        const g = giorno(a.data) || inizioGiorno(new Date()), o = a.tipo === 'evento' ? ora(a.inizio) : ora(a.ora);
        const r: Rapido = { tipo: a.tipo === 'evento' ? 'evento' : 'task', titolo: a.titolo, giorno: g, ora: o, fine: a.tipo === 'evento' ? ora(a.fine) : undefined,
          tuttoIlGiorno: a.tipo === 'evento' ? (!!a.tutto_il_giorno || !o) : false, rrule: (a as any)._rr || ricorrenza(a.ripeti), dataEsplicita: !!a.data } as Rapido;
        return creaDaRapido(r);
      }
      case 'appunto': { const i = imp() as any; if (a.modo) { i.modoAppunti = a.modo; Stato.salva(i, true); } vai('appunti'); setTimeout(() => apriAppunto(undefined, { titolo: a.titolo, testo: a.testo || '' } as any), 150); return null; }
      case 'quiz': CreaQuiz.nuovo({ argomento: a.argomento, materia: a.materia, cosa: a.cosa, extra: a.parole }); return null;
      case 'carte': UI.studioVista = 'carte'; vai('studio'); return null;
      case 'cerca': UI.q = a.testo; vai('cerca'); return null;
      case 'apri': (VISTE[norm(a.vista).split(' ')[0]] || VISTE.oggi)(); return null;
      case 'studia_ora': apriStudiaOra(); return null;
      case 'lezione_audio': vai('appunti'); setTimeout(() => apriAppunto(undefined, { titolo: a.titolo || 'Lezione ' + new Date().toLocaleDateString('it-IT') } as any), 150); setTimeout(() => (document.querySelector('.appunto-barra button[aria-label="Lezione audio"]') as HTMLElement | null)?.click(), 700); return null;
      case 'pacchetti': UI.studioVista = 'schede'; vai('studio'); setTimeout(() => (Array.from(document.querySelectorAll('button')).find(b => /Aggiorna pacchetti da Drive/.test(b.textContent || '')) as HTMLElement | undefined)?.click(), 300); return null;
      case 'quiz_creati': CreaQuiz.elenco(); return null;
      case 'risposta': return null;
    }
  }
  function contesto(): string {
    const d = new Date(), gs = Array.from({ length: 8 }, (_, i) => { const x = piuGiorni(inizioGiorno(d), i); return ymd(x) + ' ' + fmt(x, { weekday: 'long' }); });
    const materie = Array.from(new Set(Stato.tutti<Rec>('pacchetto').flatMap(r => ((r.contenuto && r.contenuto.materie) || []).map((m: any) => m.nome)).filter(Boolean)));
    return 'Oggi è ' + ymd(d) + ' (' + fmt(d, { weekday: 'long' }) + '), ore ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' (fuso Europe/Rome). Prossimi giorni: ' + gs.join(', ') + '.\nMaterie dell\'utente: ' + (materie.join(', ') || 'Chimica, Biologia, Fisica') + '.';
  }
  const SISTEMA = 'Sei l\'assistente dell\'app «Il mio calendario» (calendario, promemoria, studio con quiz e flashcard, appunti a mano e a testo). Trasforma la richiesta in AZIONI JSON: {"azioni":[…]}. Tipi ammessi e campi:\n'
    + '- evento {titolo, data:"YYYY-MM-DD", inizio:"HH:MM"?, fine:"HH:MM"?, tutto_il_giorno?:bool, ripeti?:"ogni giorno|ogni settimana|ogni lun e gio|ogni mese"}\n'
    + '- promemoria {titolo, data?:"YYYY-MM-DD", ora?:"HH:MM", ripeti?}\n'
    + '- appunto {titolo, testo?, modo?:"testo"|"mano"}\n'
    + '- quiz {argomento (preciso), materia?, cosa?:"misto|teoria|problemi|trabocchetti", parole? (sinonimi/capitolo utili alla ricerca nel Drive)} = CREARE un quiz nuovo con l\'AI\n'
    + '- carte {argomento?} = flashcard / ripasso carte\n'
    + '- cerca {testo} = cercare tra eventi, promemoria, appunti, note\n'
    + '- apri {vista: oggi|calendario|studio|piano|carte|errori|statistiche|esami|syllabus|tabelle|appunti|promemoria|note|impostazioni}\n'
    + '- studia_ora {} | lezione_audio {titolo?} | pacchetti {} (aggiorna piani/quiz dal Drive) | quiz_creati {} (elenco dei quiz creati in app)\n'
    + '- risposta {testo} = solo per domande su come si usa l\'app o se la richiesta non è un\'azione (rispondi in italiano, breve).\n'
    + 'Regole: date sempre assolute calcolate dal contesto; «stasera» = oggi 20:00 se manca l\'ora; più azioni se la frase ne chiede più di una; titoli brevi in italiano con l\'iniziale maiuscola; non inventare dettagli non detti.';
  async function capisci(frase: string): Promise<AzioneA[]> {
    // v0.43 memoria: frase già vista con azioni senza date → la rifaccio senza chiamare l'AI
    const uguale = MemoriaIA.migliori('assistente', 'esempio', 1, frase).find(x => norm(x.k) === norm(frase) && x.n >= 2 && (x.v.azioni || []).every((a: any) => !['evento', 'promemoria'].includes(a.tipo)));
    if (uguale) return uguale.v.azioni;
    const es = MemoriaIA.migliori('assistente', 'esempio', 4, frase);
    const esempi = es.length ? '\nESEMPI DI QUESTO UTENTE (richiesta → azioni che ha confermato; le date erano relative al giorno indicato):\n' + es.map(x => '[' + x.v.data + '] «' + x.k + '» → ' + JSON.stringify({ azioni: x.v.azioni })).join('\n') : '';
    const r = await IA.chiedi([{ role: 'system', content: SISTEMA + MemoriaIA.linee('assistente', 5) + esempi + '\n\n' + contesto() }, { role: 'user', content: frase }], 'veloce', { temp: 0 });
    return normalizza(r.j);
  }
  // v0.44: i modelli a volte rispondono con nomi diversi ({"actions":…}, "type", "title", un elenco nudo…):
  // tutto viene ricondotto ai nostri tipi, così una risposta valida non viene più scartata.
  const SIN: Record<string, string> = { event: 'evento', evento: 'evento', appuntamento: 'evento', reminder: 'promemoria', task: 'promemoria', todo: 'promemoria', promemoria: 'promemoria',
    note: 'appunto', nota: 'appunto', appunto: 'appunto', quiz: 'quiz', crea_quiz: 'quiz', test: 'quiz', flashcard: 'carte', flashcards: 'carte', cards: 'carte', carte: 'carte', card: 'carte',
    search: 'cerca', cerca: 'cerca', ricerca: 'cerca', open: 'apri', apri: 'apri', vai: 'apri', naviga: 'apri', answer: 'risposta', reply: 'risposta', risposta: 'risposta', messaggio: 'risposta',
    studia_ora: 'studia_ora', study: 'studia_ora', lezione_audio: 'lezione_audio', audio: 'lezione_audio', pacchetti: 'pacchetti', quiz_creati: 'quiz_creati' };
  function normalizza(j: any): AzioneA[] {
    let l: any[] = Array.isArray(j) ? j : j ? (j.azioni || j.actions || j.azione || j.action || j.risultato || (j.tipo || j.type ? [j] : [])) : [];
    if (!Array.isArray(l)) l = [l];
    const out: AzioneA[] = [];
    for (let a of l) {
      if (!a || typeof a !== 'object') continue;
      if (a.parametri || a.params || a.parameters || a.dati) a = { ...a, ...(a.parametri || a.params || a.parameters || a.dati) };
      const t = SIN[norm(String(a.tipo || a.type || a.azione || a.action || a.nome || '')).replace(/\s+/g, '_')]; if (!t) continue;
      const x: any = { tipo: t };
      x.titolo = a.titolo || a.title || a.nome_evento || a.testo || a.text;
      x.data = a.data || a.date || a.giorno; x.inizio = a.inizio || a.start || a.ora_inizio || a.ora || a.time; x.fine = a.fine || a.end || a.ora_fine; x.ora = a.ora || a.time || a.inizio;
      x.tutto_il_giorno = a.tutto_il_giorno || a.allDay || a.all_day; x.ripeti = a.ripeti || a.ricorrenza || a.repeat;
      x.argomento = a.argomento || a.topic || a.argument || a.testo || a.query || a.titolo; x.materia = a.materia || a.subject; x.cosa = a.cosa || a.tipo_domande; x.parole = a.parole || a.keywords;
      x.testo = a.testo || a.text || a.query || a.risposta || a.answer || a.messaggio; x.vista = a.vista || a.view || a.schermata || a.pagina; x.modo = a.modo || a.mode;
      if ((t === 'evento' && x.titolo && x.data) || (t === 'promemoria' && x.titolo) || (t === 'appunto') || (t === 'quiz' && x.argomento) || (t === 'cerca' && x.testo) || (t === 'apri' && x.vista) || (t === 'risposta' && x.testo) || ['carte', 'studia_ora', 'lezione_audio', 'pacchetti', 'quiz_creati'].includes(t)) {
        if (t === 'appunto' && !x.titolo) x.titolo = 'Nuovo appunto';
        out.push(x);
      }
    }
    return out.slice(0, 6);
  }
  /** Mostra le azioni capite e le esegue: subito quelle innocue, con un tocco quelle che creano qualcosa. */
  async function chiedi(frase: string): Promise<void> {
    const pill = h('div.audio-pillola.lavora', { role: 'status' }, h('span.audio-giro'), h('span.audio-stato', null, 'Capisco «' + frase.slice(0, 40) + '»…'));
    document.body.appendChild(pill);
    let az: AzioneA[] = [], errore = '';
    // v0.44: prima gli algoritmi locali (zero token, immediati); l'AI solo per il resto
    const loc = Locale.capisci(frase) as AzioneA[] | null;
    if (loc) az = loc;
    else if (!Spiega.attiva && !IA.gemini) errore = 'manca la chiave AI gratuita (Altro → Spiegazioni AI)';
    else { try { az = await capisci(frase); } catch (e: any) { errore = String(e.message || e); } }
    pill.remove();
    if (!az.length) {
      // mai un vicolo cieco: propongo le interpretazioni più probabili con un tocco
      const f = frase.replace(/^(crea(mi)?|fammi|voglio|vorrei)\s+/i, '');
      const s = await scegliTra(errore ? 'L\'AI non ha risposto (' + errore.slice(0, 80) + '). Cosa vuoi fare?' : 'Cosa vuoi fare con «' + frase.slice(0, 60) + '»?',
        [{ testo: '✨ Crea un quiz su «' + f.slice(0, 40) + '»', valore: 'quiz' }, { testo: '🔎 Cerca «' + f.slice(0, 40) + '»', valore: 'cerca' }, { testo: '🔔 Promemoria «' + f.slice(0, 40) + '»', valore: 'prom' }, { testo: '📝 Nuovo appunto', valore: 'app' }]);
      const scelta: AzioneA | null = s === 'quiz' ? { tipo: 'quiz', argomento: f } : s === 'cerca' ? { tipo: 'cerca', testo: f } : s === 'prom' ? { tipo: 'promemoria', titolo: f } : s === 'app' ? { tipo: 'appunto', titolo: f } : null;
      if (scelta) { const r = esegui(scelta); MemoriaIA.nota('assistente', 'esempio', frase, { data: ymd(new Date()), azioni: [scelta] }); if (r) avviso('✓ Creato: ' + descrivi(scelta)); }
      return;
    }
    const innocue = az.every(a => ['apri', 'cerca', 'quiz', 'carte', 'studia_ora', 'quiz_creati', 'pacchetti', 'lezione_audio'].includes(a.tipo)) && az.length === 1;
    if (innocue) { esegui(az[0]); MemoriaIA.nota('assistente', 'esempio', frase, { data: ymd(new Date()), azioni: az }); return; }
    const risposte = az.filter(a => a.tipo === 'risposta') as { tipo: 'risposta'; testo: string }[], fare = az.filter(a => a.tipo !== 'risposta');
    const scelte = fare.map(() => true);
    foglio({ titolo: '✨ Assistente', etichettaSalva: fare.length ? 'Fai' : 'Ok', corpo: h('div.modulo', null,
      h('div.tenue.piccolo', null, '«' + frase + '»'),
      ...risposte.map(r => h('p', null, r.testo)),
      ...fare.map((a, i) => h('label.cq-fonte', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => scelte[i] = (e.target as HTMLInputElement).checked }), h('span', null, descrivi(a))))),
      salva: () => {
        const fatti: Rec[] = []; fare.forEach((a, i) => { if (scelte[i]) { const r = esegui(a); if (r) fatti.push(r); } });
        // v0.43 memoria: le azioni confermate diventano un esempio; quelle tolte, una lezione
        const conf = fare.filter((_, i) => scelte[i]); if (conf.length) MemoriaIA.nota('assistente', 'esempio', frase, { data: ymd(new Date()), azioni: conf });
        fare.forEach((a, i) => { if (!scelte[i]) MemoriaIA.nota('assistente', 'lezione', 'no-' + a.tipo + '-' + norm(frase).slice(0, 40), 'Per richieste come «' + frase.slice(0, 80) + '» l\'utente NON voleva: ' + descrivi(a)); });
        if (fatti.length) avviso('✓ Fatto: ' + fatti.length + (fatti.length === 1 ? ' elemento creato' : ' elementi creati'), 5000, () => { const r = fatti[0]; r.type === 'task' ? apriTask(r as Task) : r.type === 'evento' ? apriEvento(r as Evento) : null; });
        disegna();
      } });
  }
  /** Una frase è «da calendario veloce» se ha una data o un orario chiari (la gestisce 07-rapido, offline). */
  function eRapida(f: string): boolean {
    const n = norm(f), r = interpreta(f);
    if (!r) return false;
    if (/\b(crea|creami|fammi|apri|cerca|trova|quiz|flashcard|carte|appunt|lezione|studia|pacchett|come si|come faccio|dove|cos[ae])\b/.test(n)) return false;
    return !!(r.ora || r.dataEsplicita || r.rrule || r.tipo === 'task');
  }
  return { chiedi, capisci, esegui, descrivi, eRapida };
})();
