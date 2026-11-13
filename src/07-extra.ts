// ============================================================
// 07-extra.ts — Studio "versatile":
// - corsi di studio creati dall'utente (qualsiasi materia, esame, certificazione…)
// - registro errori (schede da rifare)
// - timer di studio (Pomodoro) e sessioni registrate
// - statistiche per materia
// - esami con conto alla rovescia
// ============================================================

interface Sessione extends Rec { type: 'sessione'; data: string; inizio: string; minuti: number; m?: string; k?: string; schedaId?: string; titolo?: string; }
interface Esame extends Rec { type: 'esame'; nome: string; data: string; ora?: string; materie?: string[]; nota?: string; }

function sogliaErrori(): number { const v = (imp() as any).sogliaErrori; return typeof v === 'number' ? v : 70; }
/** Una scheda è "da rifare" se segnata a mano o se il punteggio è sotto la soglia. */
function daRifare(id: string): boolean {
  const p = Studio.prog(id);
  return !!p && (!!p.daRifare || (p.punteggio != null && p.punteggio < sogliaErrori()));
}
/** Tutte le schede (di tutti i corsi) con il loro contesto. */
function tutteLeSchede(): { pk: PkStep; mat: MateriaS; sub: SottoS; mi: MicroS; s: SchedaS }[] {
  const out: { pk: PkStep; mat: MateriaS; sub: SottoS; mi: MicroS; s: SchedaS }[] = [];
  for (const pk of Studio.pkStep()) for (const mat of pk.materie) for (const sub of mat.sottostep) for (const mi of sub.microstep) for (const s of mi.schede) out.push({ pk, mat, sub, mi, s });
  return out;
}

// ---------- Registro errori ----------
function vistaErrori(): HTMLElement {
  const lista = tutteLeSchede().filter(x => daRifare(x.s.id));
  const perMat = new Map<string, typeof lista>();
  for (const x of lista) { if (!perMat.has(x.mat.m)) perMat.set(x.mat.m, []); perMat.get(x.mat.m)!.push(x); }
  const soglia = h('input', { type: 'number', min: '0', max: '100', value: String(sogliaErrori()), inputMode: 'numeric', onchange: (e: Event) => {
    const i = imp() as any; i.sogliaErrori = Math.max(0, Math.min(100, parseInt((e.target as HTMLInputElement).value, 10) || 70)); Stato.salva(i);
  } });
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    sezioneDomande(),
    Regole.sezioneTipici(),
    AIGen.sezione(),
    h('section.card', null, h('div.tenue.piccolo', null, 'Qui finiscono le schede con punteggio sotto la soglia o segnate "da rifare". Rifalle e inserisci il nuovo punteggio: escono da sole. Compaiono anche nei giorni del piano di raffinamento.'),
      riga('Soglia', soglia, h('span.dopo', null, '%'))),
    lista.length ? null : vuoto('Nessuna scheda da rifare. 🎉'),
    Array.from(perMat.entries()).map(([m, xs]) => h('section.card', null,
      h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m) + ' · ' + xs.length),
      xs.sort((a, b) => (Studio.prog(a.s.id)!.punteggio ?? 101) - (Studio.prog(b.s.id)!.punteggio ?? 101)).map(x => {
        const p = Studio.prog(x.s.id)!;
        return h('button.voce-lista', { onclick: () => apriScheda(x.pk, x.mat.m, x.mi.n, x.s) },
          h('span.barra', { style: { background: coloreMateria(m) } }),
          h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.mi.n + ' · ' + x.s.titolo),
            h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, (p.punteggio != null ? p.punteggio + '%' : 'segnata a mano') + (p.data ? ' · ' + fmt(daYmd(p.data), { day: 'numeric', month: 'short' }) : '') + (p.nota ? ' · ' + p.nota.slice(0, 60) : ''))));
      }))));
}
function widgetErrori(): HTMLElement | null {
  const n = tutteLeSchede().filter(x => daRifare(x.s.id)).length, nr = Domande.ricorrenti().length;
  if (!n && !nr) return null;
  return scheda('Schede da rifare', h('button.voce-lista', { onclick: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } },
    h('span.voce-corpo', null, h('span.voce-titolo', null, n + (n === 1 ? ' scheda da rifare' : ' schede da rifare') + (nr ? ' · ' + nr + (nr === 1 ? ' domanda ricorrente' : ' domande ricorrenti') : '')), h('span.voce-sotto', null, 'Punteggio sotto il ' + sogliaErrori() + '% o segnate a mano' + (nr ? '; domande sbagliate 2+ volte' : ''))), icona('dx', 18)));
}

// ---------- Timer di studio (Pomodoro) ----------
interface StatoTimer { inizio: number; durata: number; fase: 'studio' | 'pausa'; pausaDa?: number; m?: string; k?: string; schedaId?: string; titolo?: string; }
const Timer = (() => {
  const CH = 'imc-timer';
  let tick = 0;
  const leggi = (): StatoTimer | null => { try { return JSON.parse(localStorage.getItem(CH) || 'null'); } catch (_) { return null; } };
  const scrivi = (t: StatoTimer | null) => { try { if (t) localStorage.setItem(CH, JSON.stringify(t)); else localStorage.removeItem(CH); } catch (_) { /* niente */ } };
  const durate = () => { const i = imp() as any; return { studio: i.pomodoro || 25, pausa: i.pausa || 5 }; };
  function trascorsi(t: StatoTimer): number { return ((t.pausaDa || Date.now()) - t.inizio) / 1000; }
  function restano(t: StatoTimer): number { return Math.max(0, t.durata * 60 - trascorsi(t)); }
  function registra(t: StatoTimer, minuti: number): void {
    if (t.fase !== 'studio' || minuti < 1) return;
    const i = new Date(t.inizio);
    Stato.salva({ id: 'ses-' + uid(), type: 'sessione', updatedAt: 0, data: ymd(i), inizio: dtStr(i), minuti: Math.round(minuti), m: t.m, k: t.k, schedaId: t.schedaId, titolo: t.titolo } as Sessione);
  }
  function avvia(o: { m?: string; k?: string; schedaId?: string; titolo?: string; durata?: number }): void {
    const t = leggi(); if (t) registra(t, trascorsi(t) / 60);
    scrivi({ inizio: Date.now(), fase: 'studio', ...o, durata: o.durata || durate().studio }); // v0.15: durata scelta da «Studia ora»
    avviso('▶ Timer avviato: ' + durate().studio + ' minuti' + (o.titolo ? ' · ' + o.titolo : ''));
    aggiorna(); disegna();
  }
  function pausaRiprendi(): void {
    const t = leggi(); if (!t) return;
    if (t.pausaDa) { t.inizio += Date.now() - t.pausaDa; delete t.pausaDa; } else t.pausaDa = Date.now();
    scrivi(t); aggiorna();
  }
  function ferma(): void {
    const t = leggi(); if (!t) return;
    registra(t, trascorsi(t) / 60);
    scrivi(null); aggiorna(); disegna();
  }
  /** Controlla la scadenza (anche dopo che l'app è stata in background) e aggiorna la barra. */
  function aggiorna(): void {
    const t = leggi(); let bar = document.getElementById('timer-barra');
    if (!t) { if (bar) bar.remove(); return; }
    if (!t.pausaDa && restano(t) <= 0) {
      if (t.fase === 'studio') {
        registra(t, t.durata);
        try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (_) { /* niente */ }
        avviso('⏰ Fine sessione: ' + t.durata + ' minuti di studio registrati. Pausa di ' + durate().pausa + ' minuti.', 12000);
        scrivi({ ...t, inizio: t.inizio + t.durata * 60000, durata: durate().pausa, fase: 'pausa' });
        Stato.notifica();
      } else {
        avviso('⏰ Pausa finita: tocca ▶ per un\'altra sessione.', 12000);
        scrivi(null); if (bar) bar.remove(); return;
      }
      return aggiorna();
    }
    const r = Math.ceil(restano(t)), testo = (t.fase === 'pausa' ? '☕ Pausa ' : '📚 ') + pad2(Math.floor(r / 60)) + ':' + pad2(r % 60) + (t.titolo && t.fase === 'studio' ? ' · ' + t.titolo : '');
    if (!bar) {
      bar = h('div', { id: 'timer-barra' },
        h('span.timer-testo'),
        h('button.timer-btn', { 'aria-label': 'Pausa o riprendi', onclick: pausaRiprendi }, ''),
        h('button.timer-btn', { 'aria-label': 'Ferma', onclick: () => chiedi('Fermare il timer?', [{ testo: 'Ferma e registra', valore: 'si' }]).then(s => { if (s) ferma(); }) }, '■'));
      document.body.appendChild(bar);
    }
    bar.style.setProperty('--c', t.m ? coloreMateria(t.m) : 'var(--accento)');
    (bar.querySelector('.timer-testo') as HTMLElement).textContent = testo;
    (bar.querySelectorAll('.timer-btn')[0] as HTMLElement).textContent = t.pausaDa ? '▶' : '❚❚';
  }
  function parti(): void { clearInterval(tick); tick = window.setInterval(aggiorna, 1000); aggiorna(); }
  return { avvia, ferma, pausaRiprendi, aggiorna, parti, attivo: () => !!leggi(), durate };
})();

function minutiStudio(da: Date, a: Date, m?: string): number {
  const x = ymd(da), y = ymd(a);
  return Stato.tutti<Sessione>('sessione').filter(s => s.data >= x && s.data <= y && (!m || s.m === m)).reduce((t, s) => t + s.minuti, 0);
}
function durata(min: number): string { return min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60 ? pad2(min % 60) + ' min' : '') : min + ' min'; }
function widgetTimer(): HTMLElement {
  const g = oggi(), oggiMin = minutiStudio(g, g), sett = minutiStudio(lunedi(g), g);
  const st = Studio.vociDelGiorno(g).filter(x => !x.v.speciale);
  return scheda('Timer e tempo di studio',
    h('div.numeri', null, numero(durata(oggiMin), 'oggi'), numero(durata(sett), 'questa settimana')),
    h('div.chips', { style: { marginTop: '8px' } },
      st.map(x => h('button.chip', { style: { borderLeft: '4px solid ' + coloreChiave(x.v.k) }, onclick: () => Timer.avvia({ m: materiaDi(x.v.k), k: x.v.k, titolo: Studio.etichetta(x.v.k) }) }, '▶ ' + Studio.etichetta(x.v.k))),
      h('button.chip', { onclick: () => Timer.avvia({ titolo: 'Studio libero' }) }, '▶ Studio libero')),
    h('div.tenue.piccolo', null, 'Sessioni da ' + Timer.durate().studio + ' min + pausa ' + Timer.durate().pausa + ' (si cambia in Altro → Studio).'));
}

// ---------- Statistiche ----------
function vistaStatistiche(): HTMLElement {
  const g = oggi(), schede = tutteLeSchede();
  const codici = Array.from(new Set([...schede.map(x => x.mat.m), ...Stato.tutti<Sessione>('sessione').map(s => s.m || '').filter(Boolean)]));
  const ritardo = Studio.inRitardo();
  const righe = codici.map(m => {
    const mie = schede.filter(x => x.mat.m === m), fatte = mie.filter(x => Studio.fatta(x.s.id));
    const punti = fatte.map(x => Studio.prog(x.s.id)!.punteggio).filter((v): v is number => v != null);
    return { m, tot: mie.length, P: mie.filter(x => x.s.tipo === 'P').length, Pf: fatte.filter(x => x.s.tipo === 'P').length, fatte: fatte.length,
      media: punti.length ? Math.round(punti.reduce((a, b) => a + b, 0) / punti.length) : null, err: mie.filter(x => daRifare(x.s.id)).length,
      min7: minutiStudio(piuGiorni(g, -6), g, m), rit: ritardo.filter(v => materiaDi(v.k) === m).length };
  });
  // ultimi 14 giorni: minuti per giorno, divisi per materia
  const giorni = Array.from({ length: 14 }, (_, i) => piuGiorni(g, i - 13));
  const ses = Stato.tutti<Sessione>('sessione');
  const perGiorno = giorni.map(d => { const k = ymd(d), o: Record<string, number> = {}; for (const s of ses) if (s.data === k) o[s.m || '?'] = (o[s.m || '?'] || 0) + s.minuti; return o; });
  const max = Math.max(30, ...perGiorno.map(o => Object.values(o).reduce((a, b) => a + b, 0)));
  const peggiore = righe.filter(r => r.rit > 0).sort((a, b) => b.rit - a.rit)[0];
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('section.card', null, h('h2.card-titolo', null, 'Tempo di studio'),
      h('div.numeri', null, numero(durata(minutiStudio(g, g)), 'oggi'), numero(durata(minutiStudio(piuGiorni(g, -6), g)), 'ultimi 7 giorni'), numero(durata(minutiStudio(piuGiorni(g, -29), g)), 'ultimi 30')),
      h('div.grafico', { role: 'img', 'aria-label': 'Minuti di studio negli ultimi 14 giorni' }, perGiorno.map((o, i) => h('div.colonna', { title: dataBreve(giorni[i]) + ': ' + durata(Object.values(o).reduce((a, b) => a + b, 0)) },
        h('div.pila', null, Object.entries(o).map(([m, v]) => h('div', { style: { height: (v / max) * 100 + '%', background: m === '?' ? 'var(--tenue)' : coloreMateria(m) } }))),
        h('span', null, String(giorni[i].getDate()))))),
      ses.length ? null : h('div.tenue.piccolo', null, 'Usa il timer (▶) per registrare il tempo di studio.')),
    sezionePuntiDeboli(),
    sezioneSottostepDeboli(),
    sezioneSonno(),
    peggiore ? h('div.indicatore.ritardo', null, 'Materia più indietro: ' + nomeMateria(peggiore.m) + ' (' + peggiore.rit + ' step in ritardo)') : null,
    righe.map(r => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(r.m) } }, nomeMateria(r.m)),
      h('div.numeri', null, numero(r.Pf + '/' + r.P, 'prioritarie'), numero(r.fatte + '/' + r.tot, 'schede fatte'), numero(r.media != null ? r.media + '%' : '—', 'media punteggi')),
      barra(r.fatte, r.tot, coloreMateria(r.m)),
      h('div.tenue.piccolo', null, durata(r.min7) + ' negli ultimi 7 giorni · ' + r.err + ' da rifare' + (r.rit ? ' · ' + r.rit + ' step in ritardo' : '')))));
}

// ---------- Esami ----------
function giorniA(data: string): number { return Math.round((daYmd(data).getTime() - oggi().getTime()) / 86400000); }
function testoCountdown(d: number): string { return d === 0 ? 'oggi!' : d === 1 ? 'domani' : d < 0 ? 'passato' : 'tra ' + d + ' giorni'; }
function vistaEsami(): HTMLElement {
  const esami = Stato.tutti<Esame>('esame').sort((a, b) => a.data < b.data ? -1 : 1);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    sezioneSimulazioni(),
    esami.length ? h('section.card', null, esami.map(e => { const d = giorniA(e.data); return h('button.voce-lista' + (d < 0 ? '.passato' : ''), { onclick: () => editorEsame(e) },
      h('span.esame-giorni', null, d >= 0 ? String(d) : '✓', h('small', null, d >= 0 ? (d === 1 ? 'giorno' : 'giorni') : '')),
      h('span.voce-corpo', null, h('span.voce-titolo', null, e.nome), h('span.voce-sotto', null, dataLunga(daYmd(e.data)) + (e.ora ? ' · ' + e.ora : '') + (e.materie && e.materie.length ? ' · ' + e.materie.map(nomeMateria).join(', ') : '')))); }))
      : vuoto('Nessun esame. Aggiungi le date degli appelli: compaiono nel calendario e in Oggi con il conto alla rovescia.'),
    h('button.btn', { onclick: () => editorEsame() }, '+ Aggiungi esame / appello'));
}
function widgetEsami(): HTMLElement | null {
  const prossimi = Stato.tutti<Esame>('esame').filter(e => giorniA(e.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 3);
  if (!prossimi.length) return null;
  return scheda('Prossimi esami', prossimi.map(e => { const d = giorniA(e.data); return h('button.voce-lista', { onclick: () => { UI.studioVista = 'esami'; UI.studioSub = null; vai('studio'); } },
    h('span.esame-giorni', null, String(d), h('small', null, d === 1 ? 'giorno' : 'giorni')),
    h('span.voce-corpo', null, h('span.voce-titolo', null, e.nome), h('span.voce-sotto', null, dataLunga(daYmd(e.data)) + ' · ' + testoCountdown(d)))); }));
}
function editorEsame(es?: Esame): void {
  const e: Esame = es ? JSON.parse(JSON.stringify(es)) : { id: 'esame-' + uid(), type: 'esame', updatedAt: 0, nome: '', data: ymd(piuGiorni(oggi(), 30)) };
  const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Primo appello semestre filtro', value: e.nome }) as HTMLInputElement;
  const data = h('input', { type: 'date', value: e.data }) as HTMLInputElement;
  const ora = h('input', { type: 'time', value: e.ora || '' }) as HTMLInputElement;
  const nota = h('textarea', { rows: 2, placeholder: 'Aula, documenti, note…', value: e.nota || '' }) as HTMLTextAreaElement;
  const codici = Array.from(new Set(tutteLeSchede().map(x => x.mat.m)));
  const scelte = new Set(e.materie || []);
  const f = foglio({ titolo: es ? 'Esame' : 'Nuovo esame', corpo: h('div.modulo', null, nome,
      h('div.gruppo', null, riga('Data', data), riga('Ora', ora)),
      codici.length ? h('div.gruppo', null, h('div.gruppo-titolo', null, 'Materie'), h('div.chips', { style: { margin: '4px 0 10px' } }, codici.map(m => { const b = h('button.chip' + (scelte.has(m) ? '.attivo' : ''), { type: 'button', onclick: () => { scelte.has(m) ? scelte.delete(m) : scelte.add(m); b.classList.toggle('attivo', scelte.has(m)); } }, nomeMateria(m)); return b; }))) : null,
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), nota)),
    salva: () => { if (!nome.value.trim() || !data.value) { avviso('Nome e data'); return false; } e.nome = nome.value.trim(); e.data = data.value; e.ora = ora.value || undefined; e.nota = nota.value || undefined; e.materie = Array.from(scelte); Stato.salva(e); },
    elimina: es ? () => chiedi('Eliminare l\'esame?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], e.nome).then(s => { if (s) { Stato.elimina(e.id); f.chiudi(); } }) : undefined });
  if (!es) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) nome.focus(); }, 50);
}

// ---------- Corsi di studio creati dall'utente ----------
// Un corso è un pacchetto (stesso formato v1) con proprio: true, salvato come record 'pacchetto'
// e quindi sincronizzato su Drive come tutto il resto. Argomenti = sotto-step (con data facoltativa:
// compaiono nel calendario e nel ritardo). Schede = qualsiasi cosa da fare, con file Drive collegato.
function pacchettoRec(pk: PkStep): Rec { return Stato.rec.get('pk-' + pk.id)!; }
function salvaPacchetto(pk: PkStep): void { pk.aggiornato = ymd(new Date()); const r = pacchettoRec(pk) || { id: 'pk-' + pk.id, type: 'pacchetto', updatedAt: 0 } as Rec; r.contenuto = pk; r.deleted = false; Stato.salva(r); }
function nuovoCodice(nome: string): string {
  const usati = new Set([...Object.keys(MATERIE_BASE), ...tutteLeSchede().map(x => x.mat.m), ...Studio.pkStep().flatMap(p => p.materie.map(m => m.m)), ...Stato.tutti<MateriaRec>('materia').map(m => m.codice)]);
  const base = norm(nome).replace(/[^a-z]/g, '').toUpperCase() || 'M';
  for (let l = 2; l <= base.length; l++) if (!usati.has(base.slice(0, l))) return base.slice(0, l);
  let i = 2; while (usati.has(base.slice(0, 3) + 'X'.repeat(i - 1))) i++; return base.slice(0, 3) + 'X'.repeat(i - 1);
}

function editorCorso(pk0?: PkStep): void {
  const pk: PkStep = pk0 ? JSON.parse(JSON.stringify(pk0)) : { tipo: 'step', id: 'corso-' + uid().slice(0, 8), step: 1000 + Studio.pkStep().filter(p => p.proprio).length, titolo: '', aggiornato: ymd(new Date()), proprio: true, risorse: { libri: {}, quiz: {} }, materie: [] };
  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Anatomia I, Inglese B2, Patente…', value: pk.titolo }) as HTMLInputElement;
  const descr = h('textarea', { rows: 2, placeholder: 'Descrizione (facoltativa)', value: pk.descrizione || '' }) as HTMLTextAreaElement;
  const zonaMat = h('div');
  function disegnaMat(): void {
    svuota(zonaMat);
    pk.materie.forEach((m, i) => zonaMat.appendChild(h('div.cat-riga', null,
      h('input', { type: 'color', value: coloreMateria(m.m), onchange: (e: Event) => { Stato.salva({ id: 'mat-' + m.m, type: 'materia', updatedAt: 0, codice: m.m, nome: m.nome, colore: (e.target as HTMLInputElement).value } as MateriaRec); } }),
      h('input', { type: 'text', value: m.nome, onchange: (e: Event) => { m.nome = (e.target as HTMLInputElement).value.trim() || m.nome; } }),
      h('input', { type: 'text', value: m.libro, placeholder: 'libro/fonte', style: { maxWidth: '110px' }, onchange: (e: Event) => { m.libro = (e.target as HTMLInputElement).value.trim(); } }),
      h('button.btn-ico', { 'aria-label': 'Togli materia', onclick: () => { if (m.sottostep.length) { avviso('Prima togli gli argomenti di questa materia.'); return; } pk.materie.splice(i, 1); disegnaMat(); } }, icona('x', 18)))));
  }
  disegnaMat();
  const nuovaMat = h('input', { type: 'text', placeholder: '+ Materia (es. Anatomia) e Invio', onkeydown: (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !nuovaMat.value.trim()) return;
    const nome = nuovaMat.value.trim(), codice = nuovoCodice(nome);
    pk.materie.push({ m: codice, nome, libro: '', sottostep: [] });
    Stato.salva({ id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome, colore: PALETTE_MATERIE[(tutteLeSchede().length + pk.materie.length) % PALETTE_MATERIE.length] } as MateriaRec);
    nuovaMat.value = ''; disegnaMat();
  } }) as HTMLInputElement;
  const f = foglio({ titolo: pk0 ? 'Corso' : 'Nuovo corso di studio', corpo: h('div.modulo', null, titolo,
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Materie del corso'), zonaMat, nuovaMat, h('div.tenue.piccolo', { style: { padding: '6px 0 10px' } }, 'Ogni materia ha il suo colore. Dopo potrai aggiungere argomenti (con data) e schede/attività con file del Drive.')),
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Descrizione'), descr)),
    salva: () => {
      if (!titolo.value.trim()) { avviso('Dai un nome al corso'); return false; }
      if (nuovaMat.value.trim()) { const nome = nuovaMat.value.trim(); pk.materie.push({ m: nuovoCodice(nome), nome, libro: '', sottostep: [] }); }
      if (!pk.materie.length) { avviso('Aggiungi almeno una materia'); return false; }
      pk.titolo = titolo.value.trim(); pk.descrizione = descr.value.trim() || undefined;
      salvaPacchetto(pk); UI.studioStep = pk.id; UI.studioVista = 'schede';
    },
    elimina: pk0 ? () => chiedi('Eliminare il corso?', [{ testo: 'Elimina il corso', valore: 'si', pericolo: true }], pk.titolo + ': i progressi restano salvati ma il corso sparisce.').then(s => { if (s) { Stato.elimina('pk-' + pk.id); UI.studioStep = ''; f.chiudi(); } }) : undefined });
  if (!pk0) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) titolo.focus(); }, 50);
}

function editorSottostep(pk0: PkStep, mat0?: MateriaS, sub0?: SottoS): void {
  const pk: PkStep = JSON.parse(JSON.stringify(pk0));
  const matSel = selettore(pk.materie.map(m => [m.m, m.nome] as [string, string]), mat0 ? mat0.m : pk.materie[0].m);
  if (sub0) matSel.disabled = true;
  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Argomento (es. Apparato cardiovascolare)', value: sub0 ? sub0.titolo : '' }) as HTMLInputElement;
  const data = h('input', { type: 'date', value: sub0 && sub0.data || '' }) as HTMLInputElement;
  const f = foglio({ titolo: sub0 ? 'Argomento' : 'Nuovo argomento', corpo: h('div.modulo', null, titolo,
      h('div.gruppo', null, riga('Materia', matSel), riga('Giorno nel piano', data), h('div.tenue.piccolo', { style: { paddingBottom: '10px' } }, 'Con una data, l\'argomento compare nel calendario e conta per "in pari / in ritardo".'))),
    salva: () => {
      if (!titolo.value.trim()) { avviso('Scrivi l\'argomento'); return false; }
      const mat = pk.materie.find(m => m.m === matSel.value)!;
      if (sub0) { const s = mat.sottostep.find(x => x.k === sub0.k)!; s.titolo = titolo.value.trim(); s.data = data.value || undefined; s.posizione = data.value ? dataLunga(daYmd(data.value)) : ''; }
      else {
        const n = '1.' + (mat.sottostep.length + 1), k = mat.m + n;
        mat.sottostep.push({ k, n, titolo: titolo.value.trim(), posizione: data.value ? dataLunga(daYmd(data.value)) : '', data: data.value || undefined, microstep: [{ n: n + '.1', schede: [] }] });
        UI.studioSub = k;
      }
      salvaPacchetto(pk);
    },
    elimina: sub0 ? () => chiedi('Eliminare l\'argomento?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], sub0.titolo).then(s => {
      if (!s) return; const mat = pk.materie.find(m => m.m === mat0!.m)!; mat.sottostep = mat.sottostep.filter(x => x.k !== sub0.k); salvaPacchetto(pk); UI.studioSub = null; f.chiudi();
    }) : undefined });
  if (!sub0) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) titolo.focus(); }, 50);
}

function editorSchedaPropria(pk0: PkStep, mat0: MateriaS, sub0: SottoS, s0?: SchedaS): void {
  const pk: PkStep = JSON.parse(JSON.stringify(pk0));
  const sub = pk.materie.find(m => m.m === mat0.m)!.sottostep.find(x => x.k === sub0.k)!;
  const mi = sub.microstep[0] || (sub.microstep[0] = { n: sub.n + '.1', schede: [] });
  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Quiz cuore 1, Esercizi cap. 3, Flashcard…', value: s0 ? s0.titolo : '' }) as HTMLInputElement;
  const tipo = selettore([['P', 'Prioritaria (da fare subito)'], ['R', 'Raffinamento (dopo)']], s0 ? s0.tipo : 'P');
  const pagine = h('input', { type: 'text', placeholder: 'es. 12-18, 25', value: s0 ? s0.pagine : '' }) as HTMLInputElement;
  let file: FileS | undefined = s0 && s0.file ? { ...s0.file } : undefined;
  const nomeFile = h('span.tenue', null, file ? file.nome : 'nessuno');
  const f = foglio({ titolo: s0 ? 'Scheda' : 'Nuova scheda', corpo: h('div.modulo', null, titolo,
      h('div.gruppo', null, riga('Tipo', tipo), riga('Pagine', pagine)),
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'File collegato (quiz HTML, PDF, documento…)'), h('div', { style: { padding: '4px 0' } }, nomeFile),
        h('div.bottoni', { style: { marginBottom: '10px' } },
          h('button.btn.neutro', { type: 'button', onclick: async () => { if (serveGoogle()) return; const [d] = await scegliFileDrive({ titolo: 'File della scheda' }); if (d) { file = { id: d.id, nome: d.name, mime: d.mimeType, url: d.url }; nomeFile.textContent = d.name; } } }, 'Dal Drive'),
          h('button.btn.neutro', { type: 'button', onclick: () => { file = undefined; nomeFile.textContent = 'nessuno'; } }, 'Togli')))),
    salva: () => {
      if (!titolo.value.trim()) { avviso('Scrivi un titolo'); return false; }
      if (s0) { const s = mi.schede.find(x => x.id === s0.id)!; Object.assign(s, { titolo: titolo.value.trim(), tipo: tipo.value, pagine: pagine.value.trim(), file }); }
      else { const k = mi.schede.length + 1; mi.schede.push({ id: mat0.m + '-' + uid().slice(0, 8), k, n: k, titolo: titolo.value.trim(), tipo: tipo.value as 'P' | 'R', problemi: false, pagine: pagine.value.trim(), quizFile: '', file }); }
      mi.schede.forEach(x => x.n = mi.schede.length);
      salvaPacchetto(pk);
    },
    elimina: s0 ? () => chiedi('Eliminare la scheda?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], s0.titolo).then(ok => { if (!ok) return; mi.schede = mi.schede.filter(x => x.id !== s0.id); mi.schede.forEach((x, i) => { x.k = i + 1; x.n = mi.schede.length; }); salvaPacchetto(pk); f.chiudi(); }) : undefined });
  if (!s0) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) titolo.focus(); }, 50);
}
