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

interface Appunto extends Rec { type: 'appunto'; titolo: string; testo: string; riassunto?: string; sub?: string; micro?: string; drive?: { id: string; agg: number; h?: string }; driveChiesto?: number; }

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
    const corpo = '# ' + a.titolo + '\n\n' + (a.sub ? '_Step: ' + Studio.etichetta(a.sub) + (a.micro ? ' · ' + a.micro : '') + '_\n\n' : '') + a.testo + '\n' + (a.riassunto ? '\n---\n**Riassunto:** ' + a.riassunto + '\n' : '');
    const id = await Drive.carica(nome, cart, corpo, 'text/markdown', a.drive && a.drive.id);
    a.drive = { id, agg: Date.now(), h: Carte.hash(a.titolo + '\n' + a.testo + (a.riassunto || '')) }; Stato.salva(a);
  }
  const daSalvareSuDrive = (a: Appunto) => !a.drive || a.drive.h !== Carte.hash(a.titolo + '\n' + a.testo + (a.riassunto || ''));
  // ---------- Fase 2: sezioni Cornell e ripasso dell'appunto ----------
  /** Divide l'appunto in sezioni (dai titoli); spunti = titolo + domande «::» + righe che finiscono con «?». */
  function sezioni(a: Appunto): { id: string; titolo: string; spunti: string[]; testo: string }[] {
    const out: { id: string; titolo: string; spunti: string[]; testo: string }[] = [];
    let cur = { titolo: a.titolo || 'Appunto', righe: [] as string[] };
    const chiudi = () => {
      const testo = cur.righe.join('\n').trim(); if (!testo) return;
      const spunti: string[] = [];
      for (const r of cur.righe) { const x = r.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim(); const q = /^(.+?)\s::\s/.exec(x); if (q) spunti.push(q[1]); else if (/\?\s*$/.test(x)) spunti.push(x); else if (/\{\{/.test(x)) spunti.push(x.replace(/\{\{[^}]+\}\}/g, '[…]')); }
      out.push({ id: Carte.hash(norm(cur.titolo)), titolo: cur.titolo, spunti, testo });
    };
    for (const r of a.testo.split('\n')) { const t = /^#{1,4}\s+(.+)$/.exec(r.trim()); if (t) { chiudi(); cur = { titolo: t[1].trim(), righe: [] }; } else cur.righe.push(r); }
    chiudi();
    return out;
  }
  const idMemS = (a: Appunto, s: string) => 'mem-ap-' + a.id.replace(/^ap-/, '') + '-' + s;
  function valutaSezione(a: Appunto, s: string, g: number): void {
    const oggiK = ymd(new Date()), id = idMemS(a, s), m = Stato.prendi<Memoria>(id);
    const t = m && m.ultimo ? Math.max(0, Math.round((daDt(oggiK).getTime() - daDt(m.ultimo).getTime()) / 864e5)) : 0;
    const st = Ripassi.passo(m && m.ultimo ? { d: m.d, s: m.s } : null, g, t), iv = g === 1 ? 1 : Ripassi.intervallo(st.s, Ripassi.ritenzione(oggiK));
    const d = daDt(oggiK); d.setDate(d.getDate() + iv);
    Stato.salva({ id, type: 'memoria', updatedAt: 0, er: 'appunto:' + a.id + ':' + s, d: st.d, s: st.s, due: ymd(d), ultimo: oggiK, n: (m ? m.n : 0) + 1, lapsi: (m ? m.lapsi : 0) + (m && g === 1 ? 1 : 0), log: ((m && m.log) || []).concat([[oggiK, g]] as any).slice(-30) } as Memoria);
  }
  /** Sezioni da ripassare oggi (mai ripassate o scadute). */
  function daRipassare(a: Appunto, oggiK = ymd(new Date())) { return sezioni(a).filter(s => { const m = Stato.prendi<Memoria>(idMemS(a, s.id)); return !m || m.due <= oggiK; }); }
  const appuntiDaRipassare = () => tutti().filter(a => daRipassare(a).length);
  return { sezioni, valutaSezione, daRipassare, appuntiDaRipassare, idMemS, tutti, estraiCarte, sincronizzaCarte, salva, nuovo, elimina, suDrive, daSalvareSuDrive };
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
function apriAppunto(a?: Appunto, extra: Partial<Appunto> = {}, alRiassunto = false): void {
  const ap = a ? { ...a } : Appunti.nuovo(extra);
  let cambiato = false;
  const v = visore(a ? '📝 Appunto' : '📝 Nuovo appunto', () => { if (cambiato) fine(); else if (a) chiediDrive(Stato.prendi<Appunto>(ap.id) || ap); disegna(); });
  const titolo = h('input.appunto-titolo', { type: 'text', placeholder: 'Titolo (es. «Chi 2.2.4 Calore latente» lo collega allo step)', value: ap.titolo }) as HTMLInputElement;
  const testo = h('textarea.appunto-testo', { placeholder: 'Scrivi con parole tue.\n\n# Titolo  ·  - punto  (rientro = sotto-punto)\nDomanda :: risposta  → diventa una flashcard\nIl {{mitocondrio}} produce ATP  → completamento', spellcheck: 'true' }, ap.testo) as HTMLTextAreaElement;
  const riass = h('textarea.appunto-riassunto', { rows: 3, placeholder: 'Riassunto (facoltativo): 2-3 frasi con parole tue, senza guardare sopra. È il passaggio che fissa di più.' }, ap.riassunto || '') as HTMLTextAreaElement;
  const stato = h('div.appunto-stato.tenue.piccolo');
  const anteprima = h('div.appunto-anteprima', { hidden: true });
  const aggiornaStato = () => {
    const n = Appunti.estraiCarte(testo.value).length, col = Carte.collega(titolo.value);
    svuota(stato); stato.append(col.sub ? h('span.chip-mini', null, '🔗 ' + Studio.etichetta(col.sub) + (col.micro ? ' ' + col.micro : '')) : h('span', null, 'Nessuno step collegato'), ' · 🃏 ' + n + (n === 1 ? ' carta' : ' carte'), cambiato ? ' · modifiche non salvate' : ' · salvato');
  };
  let timer = 0;
  const salvaOra = () => { ap.titolo = titolo.value; ap.testo = testo.value; ap.riassunto = riass.value.trim() || undefined; if (!ap.testo.trim() && !ap.titolo.trim()) return; const r = Appunti.salva(ap); Object.assign(ap, Stato.prendi<Appunto>(ap.id) || {}); cambiato = false; aggiornaStato(); return r; };
  const modifica = () => { cambiato = true; aggiornaStato(); clearTimeout(timer); timer = setTimeout(salvaOra, 1500) as any; };
  titolo.addEventListener('input', modifica); testo.addEventListener('input', modifica); riass.addEventListener('input', modifica);
  function fine(): void {
    clearTimeout(timer); const r = salvaOra();
    // richiesta gentile, non obbligo: solo per appunti lunghi senza riassunto, una volta per appunto
    const x0 = Stato.prendi<Appunto>(ap.id);
    if (x0 && !x0.riassunto && x0.testo.length > 400 && !(x0 as any).riassChiesto) { (x0 as any).riassChiesto = 1; Stato.salva(x0, true); setTimeout(() => avviso('✍️ Ti va di scrivere il riassunto in 2-3 frasi? Tocca qui.', 7000, () => apriAppunto(Stato.prendi<Appunto>(ap.id)!, {}, true)), 1200); } if (r && (r[0] || r[1])) avviso('🃏 ' + (r[0] ? r[0] + ' carte nuove/aggiornate' : '') + (r[0] && r[1] ? ', ' : '') + (r[1] ? r[1] + ' tolte' : '')); const x = Stato.prendi<Appunto>(ap.id); if (x) setTimeout(() => chiediDrive(x), 300); }
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
    h('button.ai', { title: 'Domande con l\'AI', onclick: () => { salvaOra(); aiDomande(Stato.prendi<Appunto>(ap.id) || ap, r => { testo.value = testo.value.replace(/\s*$/, '') + '\n\n## Domande\n' + r.join('\n') + '\n'; modifica(); salvaOra(); avviso('🃏 ' + r.length + ' domande aggiunte.'); }); } }, '✨'),
    h('button', { title: 'Grassetto', onclick: () => inserisci('**', '**', 'testo') }, h('b', null, 'B')),
    h('button', { title: 'Anteprima', onclick: (e: Event) => { const on = !!anteprima.hidden; anteprima.hidden = !on; testo.hidden = on; (e.currentTarget as HTMLElement).classList.toggle('attivo', on); if (on) { anteprima.innerHTML = htmlCarta(testo.value.replace(/\s::\s/g, ' → '), 'mostra'); caricaImmagini(anteprima); } } }, '👁'));
  v.barra.append(h('button.btn-testo', { onclick: async () => {
    const s = await chiedi(ap.titolo || 'Appunto', [{ testo: '📑 Vista Cornell', valore: 'cornell' }, { testo: '🧠 Copri e ricorda', valore: 'copri' }, { testo: '✨ Riscontro AI sul riassunto', valore: 'airiass' }, { testo: '☁︎ Salva su Drive', valore: 'drive' }, { testo: '🃏 Ripassa le sue carte', valore: 'carte' }, { testo: '🗑 Elimina appunto', valore: 'del', pericolo: true }]);
    if (s === 'drive') { salvaOra(); const x = Stato.prendi<Appunto>(ap.id); if (x) { x.drive && !Appunti.daSalvareSuDrive(x) ? avviso('Copia su Drive già aggiornata.') : chiediDrive(x, true); } }
    if (s === 'cornell' || s === 'copri') { salvaOra(); const x = Stato.prendi<Appunto>(ap.id); if (x) { cambiato = false; v.chiudi(); apriCornell(x, s === 'copri'); } }
    if (s === 'airiass') { salvaOra(); const x = Stato.prendi<Appunto>(ap.id); if (x) aiRiassunto(x); }
    if (s === 'carte') { salvaOra(); avviaCarte(['mz-ap-' + ap.id.replace(/^ap-/, '')], ap.titolo); }
    if (s === 'del') { const x = Stato.prendi<Appunto>(ap.id); if (x) Appunti.elimina(x); cambiato = false; v.chiudi(); avviso('Appunto eliminato (la copia su Drive, se c\'è, resta).'); }
  } }, '⋯'));
  v.corpo.append(h('div.appunto', null, titolo, stato, barra, testo, anteprima, riass));
  aggiornaStato();
  setTimeout(() => { const el = alRiassunto ? riass : a ? testo : titolo; el.focus(); if (alRiassunto) el.scrollIntoView({ block: 'center' }); }, 80);
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
        Appunti.appuntiDaRipassare().length ? h('button.btn.neutro', { onclick: () => { const l = Appunti.appuntiDaRipassare(); apriCornell(l[0], true); } }, '🧠 Ripassa appunti (' + Appunti.appuntiDaRipassare().length + ')') : null,
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

// ---------- Fase 2: vista Cornell + «copri e ricorda» ----------
/** Vista Cornell: spunti a sinistra, testo a destra, riassunto in fondo; con «copri» il testo è nascosto. */
function apriCornell(a: Appunto, copri = false): void {
  const v = visore((copri ? '🧠 Copri e ricorda · ' : '📑 ') + (a.titolo || 'Appunto'), () => disegna());
  const sez = copri ? Appunti.daRipassare(a) : Appunti.sezioni(a);
  if (!sez.length) { v.corpo.append(h('div.vuoto', null, copri ? 'Niente da ripassare oggi in questo appunto. 👍' : 'Appunto vuoto.')); return; }
  let fatte = 0;
  const righe = sez.map(s => {
    const testo = h('div.cornell-testo' + (copri ? '.coperto' : ''));
    testo.innerHTML = htmlCarta(s.testo.replace(/\s::\s/g, ' → '), 'mostra'); caricaImmagini(testo);
    const spunti = h('div.cornell-spunti', null, h('b', null, s.titolo), s.spunti.map(x => h('div.cornell-spunto', null, x)));
    const azioni = h('div.cornell-azioni');
    if (copri) {
      const voti = () => h('div.carte-voti', null, ['Non ricordavo', 'A fatica', 'Bene', 'Facile'].map((t, i) => h('button.voto.voto-' + (i + 1), { onclick: () => {
        Appunti.valutaSezione(a, s.id, i + 1); svuota(azioni); azioni.append(h('span.tenue.piccolo', null, '✓ registrato'));
        if (++fatte === sez.length) avviso('🧠 Appunto ripassato. Le sezioni più deboli torneranno prima.');
      } }, h('b', null, t))));
      azioni.append(h('div.tenue.piccolo', null, 'Prova a ripetere a voce (o a scrivere) la sezione partendo dagli spunti, poi scopri.'),
        h('button.btn', { onclick: () => { testo.classList.remove('coperto'); svuota(azioni); azioni.append(voti()); } }, 'Scopri'));
    }
    return h('section.cornell-riga', null, spunti, h('div', null, testo, azioni));
  });
  v.corpo.append(h('div.cornell', null, righe,
    h('div.cornell-riassunto', null, h('b', null, 'Riassunto'), a.riassunto ? h('div', null, a.riassunto)
      : h('button.btn-testo', { onclick: () => { v.chiudi(); apriAppunto(a, {}, true); } }, '✍️ Scrivilo in 2-3 frasi con parole tue: fissa più di una rilettura'))));
}

// ---------- AI (Groq) sugli appunti ----------
/** Propone domande-flashcard dal testo dell'appunto; scegli quali tenere: diventano righe «::». */
async function aiDomande(a: Appunto, dopo: (righe: string[]) => void): Promise<void> {
  if (!a.testo.trim()) { avviso('Scrivi prima qualcosa.'); return; }
  avviso('✨ Preparo le domande…', 15000);
  let d: any;
  try {
    d = await Spiega.chat([{ role: 'system', content: 'Sei un tutor di ' + Spiega.materia(a.titolo + ' ' + (a.sub ? nomeMateria(materiaDi(a.sub)) : '')) + ' per il semestre filtro di Medicina. Crei flashcard di ripasso SOLO dal testo dello studente, in italiano. Regole: un\'idea per carta; domanda breve e precisa; risposta di poche parole o una formula; niente domande sì/no; non inventare fatti che non sono nel testo. Rispondi in JSON: {"domande":[{"q":"...","r":"..."}]}' },
      { role: 'user', content: 'Titolo: ' + a.titolo + '\n\nAppunto:\n' + a.testo.slice(0, 9000) + '\n\nCrea da 4 a 8 flashcard sui concetti più importanti che NON hanno già una riga «domanda :: risposta».' }], 0.3);
  } catch (e: any) { avviso(String(e.message || e), 8000); return; }
  const lista: { q: string; r: string }[] = (d && d.domande || []).filter((x: any) => x && x.q && x.r).slice(0, 10);
  if (!lista.length) { avviso('Nessuna domanda proposta.'); return; }
  const scelte = lista.map(() => true);
  foglio({ titolo: '✨ Domande proposte', etichettaSalva: 'Aggiungi le scelte', corpo: h('div.modulo', null,
    h('div.tenue.piccolo', null, 'Tieni solo quelle utili: diventano righe «domanda :: risposta» in fondo all\'appunto, quindi flashcard. Puoi correggerle dopo.'),
    lista.map((x, i) => h('label.gen-arg', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => { scelte[i] = (e.target as HTMLInputElement).checked; } }),
      h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.q), h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, x.r))))),
    salva: () => { const r = lista.filter((_x, i) => scelte[i]).map(x => '- ' + x.q.replace(/\s::\s/g, ' ') + ' :: ' + x.r.replace(/\n/g, ' ')); if (r.length) dopo(r); } });
}
/** Riscontro sul riassunto: cosa manca o è impreciso rispetto all'appunto (non lo riscrive). */
async function aiRiassunto(a: Appunto): Promise<void> {
  if (!(a.riassunto || '').trim()) { avviso('Scrivi prima il riassunto: l\'AI ti dice cosa manca, non lo scrive al posto tuo.'); return; }
  avviso('✨ Leggo il riassunto…', 15000);
  try {
    const d = await Spiega.chat([{ role: 'system', content: 'Sei un tutor per il semestre filtro di Medicina. Confronti il riassunto dello studente con il suo appunto. NON riscrivere il riassunto. Rispondi in italiano, con il tu, in JSON: {"ok":"cosa va bene (1 frase)","manca":["concetto chiave mancante", ...],"errori":["affermazione imprecisa e correzione", ...]}' },
      { role: 'user', content: 'Appunto:\n' + a.testo.slice(0, 8000) + '\n\nRiassunto dello studente:\n' + a.riassunto }], 0.2);
    foglio({ titolo: '✨ Riscontro sul riassunto', corpo: h('div.modulo', null, d.ok ? h('div', null, '✅ ' + d.ok) : null,
      (d.manca || []).length ? h('div', null, h('b', null, 'Manca:'), (d.manca as string[]).map(x => h('div', null, '• ' + x))) : h('div', null, 'Non manca nulla di importante. 👍'),
      (d.errori || []).length ? h('div', null, h('b', null, 'Da correggere:'), (d.errori as string[]).map(x => h('div', null, '• ' + x))) : null) });
  } catch (e: any) { avviso(String(e.message || e), 8000); }
}
