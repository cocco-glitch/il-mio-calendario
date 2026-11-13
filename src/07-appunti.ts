// 07-appunti.ts — Appunti (v0.28, fase 1).
//
// Ispirazione (scouting 13/11): RemNote (appunti e flashcard sono la stessa cosa: «domanda :: risposta»
// scritta nel testo), Obsidian + plugin FSRS (contesto della carta = titolo › sezione; completamenti
// {{…}}), metodo Cornell (spunti / testo / riassunto: arriva nella fase 2), app con AI (generano domande
// dagli appunti: qui le prepara Claude leggendo la copia .md su Drive, senza costi).
// Neuroscienza: appunti con parole proprie (elaborazione generativa) + recupero (le righe-domanda
// diventano carte con ripasso FSRS) + collegamento allo step (interleaving con quiz e piano).
//
// Dati: record 'appunto' (id 'ap-…'). Le carte nascono al salvataggio nel mazzo 'mz-ap-<id>' (figlio di
// 'mz-appunti'), collegato allo stesso sotto-step; una riga cancellata toglie la sua carta.
// Drive: copia «titolo.md» in «Calendario personale/Appunti», SOLO dopo conferma nell'app.

interface Appunto extends Rec { type: 'appunto'; titolo: string; testo: string; sub?: string; micro?: string; drive?: { id: string; agg: number; h?: string }; driveChiesto?: number; }

const Appunti = (() => {
  const tutti = () => Stato.tutti<Appunto>('appunto').sort((a, b) => b.updatedAt - a.updatedAt);
  /** Carte contenute nel testo: «domanda :: risposta» e righe con {{completamenti}}; contesto = titoli sopra. */
  function estraiCarte(testo: string): { f: string; r: string; ctx: string }[] {
    const out: { f: string; r: string; ctx: string }[] = [], titoli: string[] = [];
    for (const riga of testo.split('\n')) {
      const t = /^(#{1,4})\s+(.+)$/.exec(riga.trim());
      if (t) { titoli.length = t[1].length - 1; titoli[t[1].length - 1] = t[2].trim(); continue; }
      const x = riga.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim(); if (!x) continue;
      const ctx = titoli.filter(Boolean).join(' › ');
      const q = /^(.+?)\s::\s(.+)$/.exec(x);
      if (q) out.push({ f: q[1].trim(), r: q[2].trim(), ctx });
      else if (/\{\{[^}]+\}\}/.test(x)) out.push({ f: x, r: '', ctx });
    }
    return out;
  }
  /** Allinea il mazzo dell'appunto alle righe-carta attuali. Restituisce [nuove, tolte]. */
  function sincronizzaCarte(a: Appunto): [number, number] {
    const lista = estraiCarte(a.testo), idM = 'mz-ap-' + a.id.replace(/^ap-/, '');
    const esistenti = Carte.carte().filter(c => c.mazzo === idM);
    if (!lista.length && !esistenti.length) return [0, 0];
    if (!Stato.prendi<Mazzo>('mz-appunti')) Stato.salva({ id: 'mz-appunti', type: 'mazzo', updatedAt: 0, nome: '📝 Dagli appunti' } as Mazzo, true);
    const m = Stato.prendi<Mazzo>(idM);
    const nome = '📝 ' + (a.titolo || 'Appunto');
    if (!m || m.nome !== nome || m.sub !== a.sub) Stato.salva({ ...(m || {}), id: idM, type: 'mazzo', updatedAt: 0, nome, padre: 'mz-appunti', sub: a.sub, micro: a.micro } as Mazzo, true);
    const prima = new Set(esistenti.map(c => c.id));
    const nuove = Carte.riempi(idM, lista);
    const ids = new Set(lista.map(x => 'cr-' + Carte.hash(idM + '|' + norm(x.f))));
    for (const x of lista) { const c = Stato.prendi<Carta>('cr-' + Carte.hash(idM + '|' + norm(x.f))); if (c && c.ctx !== (x.ctx || undefined)) { c.ctx = x.ctx || undefined; Stato.salva(c, true); } }
    let tolte = 0; for (const id of prima) if (!ids.has(id)) { Stato.elimina(id); tolte++; }
    Stato.notifica();
    return [nuove, tolte];
  }
  function salva(a: Appunto): [number, number] {
    a.titolo = a.titolo.trim() || (a.testo.trim().split('\n')[0] || 'Appunto').replace(/^#+\s*/, '').slice(0, 60);
    const col = Carte.collega(a.titolo); if (col.sub) { a.sub = col.sub; a.micro = col.micro; }
    Stato.salva(a);
    return sincronizzaCarte(a);
  }
  function nuovo(extra: Partial<Appunto> = {}): Appunto { return { id: 'ap-' + uid(), type: 'appunto', updatedAt: 0, titolo: '', testo: '', ...extra }; }
  function elimina(a: Appunto): void {
    for (const c of Carte.carte().filter(c => c.mazzo === 'mz-ap-' + a.id.replace(/^ap-/, ''))) Stato.elimina(c.id);
    Stato.elimina('mz-ap-' + a.id.replace(/^ap-/, '')); Stato.elimina(a.id);
  }
  /** Copia Markdown su Drive (crea o aggiorna lo stesso file). */
  async function suDrive(a: Appunto): Promise<void> {
    const cart = await Drive.sottocartella('Appunti');
    const nome = (a.titolo || 'Appunto').replace(/[\\/:*?"<>|]/g, '-') + '.md';
    const corpo = '# ' + a.titolo + '\n\n' + (a.sub ? '_Step: ' + Studio.etichetta(a.sub) + (a.micro ? ' · ' + a.micro : '') + '_\n\n' : '') + a.testo + '\n';
    const id = await Drive.carica(nome, cart, corpo, 'text/markdown', a.drive && a.drive.id);
    a.drive = { id, agg: Date.now(), h: Carte.hash(a.titolo + '\n' + a.testo) }; Stato.salva(a);
  }
  const daSalvareSuDrive = (a: Appunto) => !a.drive || a.drive.h !== Carte.hash(a.titolo + '\n' + a.testo);
  return { tutti, estraiCarte, sincronizzaCarte, salva, nuovo, elimina, suDrive, daSalvareSuDrive };
})();

/** Chiede conferma e salva la copia su Drive (regola: niente su Drive senza conferma). */
async function chiediDrive(a: Appunto, forza = false): Promise<void> {
  if (!Drive.collegato || !Appunti.daSalvareSuDrive(a)) { if (forza && !Drive.collegato) avviso('Collega Google Drive da Altro.'); return; }
  const s = await chiedi('Salvare «' + a.titolo + '» su Drive?', [{ testo: a.drive ? '☁︎ Aggiorna la copia' : '☁︎ Salva su Drive', valore: 'si' }],
    'Copia .md in «Calendario personale/Appunti». L\'appunto resta comunque salvato nell\'app.');
  if (s !== 'si') return;
  if (serveGoogle()) return;
  try { await Appunti.suDrive(a); avviso('☁︎ Salvato su Drive.'); } catch (e: any) { avviso('Drive: ' + (e.message || e), 6000); }
}

// ---------- Editor ----------
function apriAppunto(a?: Appunto, extra: Partial<Appunto> = {}): void {
  const ap = a ? { ...a } : Appunti.nuovo(extra);
  let cambiato = false;
  const v = visore(a ? '📝 Appunto' : '📝 Nuovo appunto', () => { if (cambiato) fine(); else if (a) chiediDrive(Stato.prendi<Appunto>(ap.id) || ap); disegna(); });
  const titolo = h('input.appunto-titolo', { type: 'text', placeholder: 'Titolo (es. «Chi 2.2.4 Calore latente» lo collega allo step)', value: ap.titolo }) as HTMLInputElement;
  const testo = h('textarea.appunto-testo', { placeholder: 'Scrivi con parole tue.\n\n# Titolo  ·  - punto  (rientro = sotto-punto)\nDomanda :: risposta  → diventa una flashcard\nIl {{mitocondrio}} produce ATP  → completamento', spellcheck: 'true' }, ap.testo) as HTMLTextAreaElement;
  const stato = h('div.appunto-stato.tenue.piccolo');
  const anteprima = h('div.appunto-anteprima', { hidden: true });
  const aggiornaStato = () => {
    const n = Appunti.estraiCarte(testo.value).length, col = Carte.collega(titolo.value);
    svuota(stato); stato.append(col.sub ? h('span.chip-mini', null, '🔗 ' + Studio.etichetta(col.sub) + (col.micro ? ' ' + col.micro : '')) : h('span', null, 'Nessuno step collegato'), ' · 🃏 ' + n + (n === 1 ? ' carta' : ' carte'), cambiato ? ' · modifiche non salvate' : ' · salvato');
  };
  let timer = 0;
  const salvaOra = () => { ap.titolo = titolo.value; ap.testo = testo.value; if (!ap.testo.trim() && !ap.titolo.trim()) return; const r = Appunti.salva(ap); Object.assign(ap, Stato.prendi<Appunto>(ap.id) || {}); cambiato = false; aggiornaStato(); return r; };
  const modifica = () => { cambiato = true; aggiornaStato(); clearTimeout(timer); timer = setTimeout(salvaOra, 1500) as any; };
  titolo.addEventListener('input', modifica); testo.addEventListener('input', modifica);
  function fine(): void { clearTimeout(timer); const r = salvaOra(); if (r && (r[0] || r[1])) avviso('🃏 ' + (r[0] ? r[0] + ' carte nuove/aggiornate' : '') + (r[0] && r[1] ? ', ' : '') + (r[1] ? r[1] + ' tolte' : '')); const x = Stato.prendi<Appunto>(ap.id); if (x) setTimeout(() => chiediDrive(x), 300); }
  const inserisci = (prima: string, dopo = '', segnaposto = '') => {
    const s = testo.selectionStart, e = testo.selectionEnd, sel = testo.value.slice(s, e) || segnaposto;
    testo.setRangeText(prima + sel + dopo, s, e, 'end'); if (!testo.value.slice(s, e)) testo.setSelectionRange(s + prima.length, s + prima.length + sel.length);
    testo.focus(); modifica();
  };
  const aCapo = (pref: string) => { const s = testo.selectionStart, ini = testo.value.lastIndexOf('\n', s - 1) + 1; testo.setRangeText(pref, ini, ini, 'end'); testo.focus(); modifica(); };
  const barra = h('div.appunto-barra', null,
    h('button', { title: 'Titolo', onclick: () => aCapo('# ') }, 'H'),
    h('button', { title: 'Punto', onclick: () => aCapo('- ') }, '•'),
    h('button', { title: 'Rientra', onclick: () => aCapo('  ') }, '⇥'),
    h('button', { title: 'Domanda :: risposta', onclick: () => inserisci('', ' :: ', '') }, '::'),
    h('button', { title: 'Completamento', onclick: () => inserisci('{{', '}}', 'parola') }, '{ }'),
    h('button', { title: 'Grassetto', onclick: () => inserisci('**', '**', 'testo') }, h('b', null, 'B')),
    h('button', { title: 'Anteprima', onclick: (e: Event) => { const on = !!anteprima.hidden; anteprima.hidden = !on; testo.hidden = on; (e.currentTarget as HTMLElement).classList.toggle('attivo', on); if (on) { anteprima.innerHTML = htmlCarta(testo.value.replace(/\s::\s/g, ' → '), 'mostra'); caricaImmagini(anteprima); } } }, '👁'));
  v.barra.append(h('button.btn-testo', { onclick: async () => {
    const s = await chiedi(ap.titolo || 'Appunto', [{ testo: '☁︎ Salva su Drive', valore: 'drive' }, { testo: '🃏 Ripassa le sue carte', valore: 'carte' }, { testo: '🗑 Elimina appunto', valore: 'del', pericolo: true }]);
    if (s === 'drive') { salvaOra(); const x = Stato.prendi<Appunto>(ap.id); if (x) { x.drive && !Appunti.daSalvareSuDrive(x) ? avviso('Copia su Drive già aggiornata.') : chiediDrive(x, true); } }
    if (s === 'carte') { salvaOra(); avviaCarte(['mz-ap-' + ap.id.replace(/^ap-/, '')], ap.titolo); }
    if (s === 'del') { const x = Stato.prendi<Appunto>(ap.id); if (x) Appunti.elimina(x); cambiato = false; v.chiudi(); avviso('Appunto eliminato (la copia su Drive, se c\'è, resta).'); }
  } }, '⋯'));
  v.corpo.append(h('div.appunto', null, titolo, stato, barra, testo, anteprima));
  aggiornaStato();
  setTimeout(() => (a ? testo : titolo).focus(), 80);
}

// ---------- Vista «Appunti» ----------
function vistaAppunti(): HTMLElement {
  const q = norm((UI as any).apCerca || '');
  const tutti = Appunti.tutti().filter(a => !q || norm(a.titolo + ' ' + a.testo).includes(q));
  const gruppi = new Map<string, Appunto[]>();
  for (const a of tutti) { const g = a.sub ? formaMateria(materiaDi(a.sub)) + ' ' + nomeMateria(materiaDi(a.sub)) : 'Senza step'; if (!gruppi.has(g)) gruppi.set(g, []); gruppi.get(g)!.push(a); }
  const voce = (a: Appunto) => {
    const n = Appunti.estraiCarte(a.testo).length, anteprima = a.testo.replace(/[#*_{}>`-]|::/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
    return h('button.voce-lista', { onclick: () => apriAppunto(a) }, h('span.voce-corpo', null,
      h('span.voce-titolo', null, a.sub ? segnoMateria(a.sub) : null, a.titolo || 'Appunto'),
      h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, (a.sub ? Studio.etichetta(a.sub) + (a.micro ? ' ' + a.micro : '') + ' · ' : '') + (n ? '🃏 ' + n + ' · ' : '') + (a.drive ? (Appunti.daSalvareSuDrive(a) ? '☁︎ da aggiornare · ' : '☁︎ · ') : '') + fmt(new Date(a.updatedAt), { day: 'numeric', month: 'short' }) + (anteprima ? ' — ' + anteprima : ''))));
  };
  const campo = h('input.campo', { type: 'search', placeholder: 'Cerca negli appunti…', value: (UI as any).apCerca || '', oninput: (e: Event) => { (UI as any).apCerca = (e.target as HTMLInputElement).value; clearTimeout((vistaAppunti as any).t); (vistaAppunti as any).t = setTimeout(() => { disegna(); const c = document.querySelector<HTMLInputElement>('main input[type=search]'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 250); } });
  const nCarte = Carte.conta(['mz-appunti']);
  return h('div.pagina', null,
    h('section.card', null, campo,
      h('div.bottoni', null, h('button.btn', { onclick: () => apriAppunto() }, '＋ Nuovo appunto'),
        nCarte.nuove + nCarte.ripasso ? h('button.btn.neutro', { onclick: () => avviaCarte(['mz-appunti'], 'Carte dagli appunti') }, '🃏 Ripassa ' + (nCarte.nuove + nCarte.ripasso)) : null),
      h('div.tenue.piccolo', null, 'Scrivi «domanda :: risposta» o {{parola}} dentro un appunto: diventa una flashcard. Un titolo con il numero dello step lo collega al piano.')),
    tutti.length ? Array.from(gruppi.entries()).map(([g, l]) => h('section.card', null, h('h2.card-titolo', null, g + ' · ' + l.length), l.map(voce)))
      : h('section.card', null, h('div.vuoto', null, q ? 'Nessun appunto trovato.' : 'Ancora nessun appunto. Tocca «Nuovo appunto».')));
}

/** Nel sotto-step: appunti collegati + nuovo appunto già collegato. */
function rigaAppunti(k: string): HTMLElement {
  const l = Appunti.tutti().filter(a => a.sub === k);
  const t = Studio.trovaSotto(k);
  return h('div.bottoni', null,
    l.slice(0, 3).map(a => h('button.btn.neutro', { onclick: () => apriAppunto(a) }, '📝 ' + a.titolo.slice(0, 28))),
    h('button.btn.neutro', { onclick: () => apriAppunto(undefined, { titolo: Studio.etichetta(k) + (t ? ' ' + t.sub.titolo : ''), sub: k }) }, '＋ Appunto'));
}
