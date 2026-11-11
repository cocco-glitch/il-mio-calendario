// ============================================================
// 05-editor.ts — Fogli di creazione/modifica: evento, promemoria, nota.
// ============================================================

const PROMEMORIA_OPZ: [number, string][] = [
  [0, "All'ora dell'evento"], [5, '5 minuti prima'], [10, '10 minuti prima'], [30, '30 minuti prima'],
  [60, '1 ora prima'], [120, '2 ore prima'], [1440, '1 giorno prima'], [2880, '2 giorni prima'],
];
function testoPromemoria(min: number): string {
  const t = PROMEMORIA_OPZ.find(p => p[0] === min);
  return t ? t[1] : min + ' minuti prima';
}

/** Apre l'editor evento. `occ` = occorrenza toccata (per le serie); `preset` = nuovo evento. */
function apriEvento(esistente?: Evento, occ?: Occ, preset?: { inizio: Date; tuttoIlGiorno?: boolean; titolo?: string }): void {
  const nuovo = !esistente;
  const base = preset ? preset.inizio : new Date();
  let iniz0: Date, fine0: Date;
  if (occ) { iniz0 = occ.inizio; fine0 = occ.fine; }
  else if (esistente) { iniz0 = daDt(esistente.inizio); fine0 = daDt(esistente.fine); }
  else {
    iniz0 = new Date(base);
    if (!preset || (iniz0.getHours() === 0 && iniz0.getMinutes() === 0 && !preset.tuttoIlGiorno)) {
      // nessuna ora indicata: prossima ora piena
      const ora = new Date(); iniz0.setHours(Math.min(23, ora.getHours() + 1), 0, 0, 0);
    }
    fine0 = piuMinuti(iniz0, 60);
  }
  const ev: Evento = esistente ? JSON.parse(JSON.stringify(esistente)) : {
    id: uid(), type: 'evento', updatedAt: 0, titolo: preset && preset.titolo || '', inizio: '', fine: '',
    tuttoIlGiorno: !!(preset && preset.tuttoIlGiorno), categoriaId: categorie()[0] ? categorie()[0].id : undefined,
    promemoria: [], checklist: [],
  };

  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Titolo', value: ev.titolo, autocomplete: 'off' }) as HTMLInputElement;
  const tutto = h('input', { type: 'checkbox', checked: ev.tuttoIlGiorno, onchange: () => vistaDate() }) as HTMLInputElement;
  const dInizio = h('input', { type: 'date', value: ymd(iniz0) }) as HTMLInputElement;
  const oInizio = h('input', { type: 'time', value: hm(iniz0) }) as HTMLInputElement;
  const dFine = h('input', { type: 'date', value: ymd(fine0) }) as HTMLInputElement;
  const oFine = h('input', { type: 'time', value: hm(fine0) }) as HTMLInputElement;
  // Spostando l'inizio, la fine mantiene la durata.
  let durata = fine0.getTime() - iniz0.getTime();
  const leggi = () => ({ i: daDt(dInizio.value + 'T' + (tutto.checked ? '00:00' : oInizio.value || '00:00')), f: daDt(dFine.value + 'T' + (tutto.checked ? '23:59' : oFine.value || '00:00')) });
  const inizioCambiato = () => {
    if (!dInizio.value) return;
    const i = daDt(dInizio.value + 'T' + (oInizio.value || '00:00'));
    const f = new Date(i.getTime() + durata);
    dFine.value = ymd(f); oFine.value = hm(f);
  };
  const fineCambiata = () => { const v = leggi(); if (v.f > v.i) durata = daDt(dFine.value + 'T' + (oFine.value || '00:00')).getTime() - daDt(dInizio.value + 'T' + (oInizio.value || '00:00')).getTime(); };
  dInizio.onchange = inizioCambiato; oInizio.onchange = inizioCambiato;
  dFine.onchange = fineCambiata; oFine.onchange = fineCambiata;
  const zonaDate = h('div');
  function vistaDate(): void {
    svuota(zonaDate);
    zonaDate.appendChild(riga('Inizio', dInizio, tutto.checked ? null : oInizio));
    zonaDate.appendChild(riga('Fine', dFine, tutto.checked ? null : oFine));
  }
  vistaDate();

  const rip = campoRicorrenza(ev.rrule, () => daYmd(dInizio.value || ymd(new Date())));
  const luogo = h('input', { type: 'text', placeholder: 'Aggiungi luogo', value: ev.luogo || '' }) as HTMLInputElement;
  const cat = selettoreCategoria(ev.categoriaId);
  const note = h('textarea', { rows: 4, placeholder: 'Note (markdown: **grassetto**, - elenco, # titolo)', value: ev.note || '' }) as HTMLTextAreaElement;

  // Promemoria multipli
  const prom = new Set<number>(ev.promemoria || []);
  const zonaProm = h('div.chips');
  const selProm = selettore([['', '+ Aggiungi promemoria'] as [string, string]].concat(PROMEMORIA_OPZ.map(p => [String(p[0]), p[1]] as [string, string])), '', () => {
    if (selProm.value !== '') { prom.add(parseInt(selProm.value, 10)); selProm.value = ''; disegnaProm(); }
  });
  function disegnaProm(): void {
    svuota(zonaProm);
    Array.from(prom).sort((a, b) => a - b).forEach(m => zonaProm.appendChild(
      h('button.chip.attivo', { type: 'button', title: 'Tocca per togliere', onclick: () => { prom.delete(m); disegnaProm(); } }, testoPromemoria(m), ' ✕')));
  }
  disegnaProm();

  // Checklist interna
  const voci: VoceChecklist[] = (ev.checklist || []).map(v => ({ ...v }));
  const zonaCheck = h('div.checklist');
  const nuovaVoce = h('input', { type: 'text', placeholder: 'Aggiungi voce…', onkeydown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' && nuovaVoce.value.trim()) { voci.push({ id: uid(), testo: nuovaVoce.value.trim(), fatto: false }); nuovaVoce.value = ''; disegnaCheck(); e.preventDefault(); }
  } }) as HTMLInputElement;
  function disegnaCheck(): void {
    svuota(zonaCheck);
    voci.forEach((v, i) => zonaCheck.appendChild(h('div.voce', null,
      h('input', { type: 'checkbox', checked: v.fatto, onchange: (e: Event) => { v.fatto = (e.target as HTMLInputElement).checked; } }),
      h('input', { type: 'text', value: v.testo, oninput: (e: Event) => { v.testo = (e.target as HTMLInputElement).value; } }),
      h('button.btn-ico', { type: 'button', 'aria-label': 'Togli voce', onclick: () => { voci.splice(i, 1); disegnaCheck(); } }, icona('x', 18)),
    )));
  }
  disegnaCheck();

  // Allegati Drive: carico un file nella cartella dell'app oppure collego un file esistente col Picker.
  const allegati: Allegato[] = (ev.allegati || []).map(a => ({ ...a }));
  const zonaAll = h('div.allegati');
  function disegnaAll(): void {
    svuota(zonaAll);
    if (!allegati.length) zonaAll.appendChild(h('div.tenue.piccolo', null, Drive.collegato ? 'Nessun allegato.' : 'Collega Google Drive da Altro → Google Drive per usare gli allegati.'));
    allegati.forEach((a, i) => zonaAll.appendChild(h('div.voce', null,
      h('button.allegato', { type: 'button', onclick: () => apriAllegato(a) }, '📎 ', a.nome),
      h('button.btn-ico', { type: 'button', 'aria-label': 'Togli allegato', onclick: () => { allegati.splice(i, 1); disegnaAll(); } }, icona('x', 18)))));
  }
  disegnaAll();
  const fileInput = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async () => {
    const files = Array.from(fileInput.files || []); fileInput.value = '';
    for (const f of files) {
      avviso('Carico ' + f.name + '…', 2500);
      try { allegati.push(await Drive.caricaAllegato(f)); disegnaAll(); } catch (e: any) { avviso('Caricamento fallito: ' + (e.message || e), 6000); }
    }
  } }) as HTMLInputElement;
  const btnCarica = h('button.btn.neutro', { type: 'button', onclick: () => fileInput.click() }, 'Carica file');
  const btnCollega = h('button.btn.neutro', { type: 'button', onclick: async () => {
    if (!Drive.pronto) { Drive.login(); avviso('Accedi a Google, poi tocca di nuovo.'); return; }
    try {
      for (const d of await scegliFileDrive({ multi: true, titolo: 'Collega file dal Drive' })) allegati.push({ id: uid(), nome: d.name, driveId: d.id, mime: d.mimeType, url: d.url });
      disegnaAll();
    } catch (e: any) { avviso(String(e.message || e), 6000); }
  } }, 'Collega da Drive');

  const corpo = h('div.modulo', null,
    titolo,
    h('div.gruppo', null, riga('Tutto il giorno', tutto), zonaDate, rip.el),
    h('div.gruppo', null, riga('Categoria', cat), riga('Luogo', luogo)),
    h('div.gruppo', null, h('div.gruppo-titolo', null, 'Promemoria'), zonaProm, selProm),
    h('div.gruppo', null, h('div.gruppo-titolo', null, 'Checklist'), zonaCheck, nuovaVoce),
    h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), note),
    h('div.gruppo', null, h('div.gruppo-titolo', null, 'Allegati Drive'), zonaAll, h('div.bottoni', null, btnCarica, btnCollega), fileInput),
  );

  function raccogli(): Evento | null {
    const v = leggi();
    if (!dInizio.value || !dFine.value) { avviso('Indica le date'); return null; }
    if (v.f < v.i) { avviso('La fine è prima dell\'inizio'); return null; }
    if (nuovaVoce.value.trim()) voci.push({ id: uid(), testo: nuovaVoce.value.trim(), fatto: false });
    ev.titolo = titolo.value.trim() || '(senza titolo)';
    ev.tuttoIlGiorno = tutto.checked;
    ev.inizio = dtStr(v.i); ev.fine = dtStr(v.f);
    ev.luogo = luogo.value.trim() || undefined;
    ev.categoriaId = cat.value || undefined;
    ev.note = note.value;
    ev.promemoria = Array.from(prom).sort((a, b) => a - b);
    ev.checklist = voci.filter(x => x.testo.trim());
    ev.rrule = rip.valore();
    ev.allegati = allegati;
    return ev;
  }

  const serie = !!(esistente && esistente.rrule && occ);
  const f = foglio({
    titolo: nuovo ? 'Nuovo evento' : 'Evento',
    corpo,
    salva: () => {
      const r = raccogli();
      if (!r) return false;
      if (!serie) { Stato.salva(r); return; }
      // Evento ricorrente: solo questa occorrenza o tutta la serie?
      chiedi('Evento ricorrente', [{ testo: 'Solo questo evento', valore: 'uno' }, { testo: 'Tutta la serie', valore: 'tutti' }]).then(scelta => {
        if (!scelta) return;
        if (scelta === 'uno') {
          // escludo il giorno dalla serie e creo un evento singolo modificato
          const orig = Stato.prendi<Evento>(esistente!.id)!;
          orig.exdate = (orig.exdate || []).concat([occ!.chiave]);
          Stato.salva(orig);
          const singolo: Evento = { ...r, id: uid(), rrule: undefined, exdate: undefined, serieId: orig.id };
          Stato.salva(singolo);
        } else {
          // applico lo spostamento a tutta la serie mantenendo il giorno di partenza
          const delta = daDt(r.inizio).getTime() - occ!.inizio.getTime();
          const dur = daDt(r.fine).getTime() - daDt(r.inizio).getTime();
          const i0 = new Date(daDt(esistente!.inizio).getTime() + delta);
          r.inizio = dtStr(i0); r.fine = dtStr(new Date(i0.getTime() + dur));
          Stato.salva(r);
        }
        f.chiudi();
      });
      return false;
    },
    elimina: nuovo ? undefined : () => {
      const scelte = serie
        ? [{ testo: 'Solo questo evento', valore: 'uno', pericolo: true }, { testo: 'Tutta la serie', valore: 'tutti', pericolo: true }]
        : [{ testo: 'Elimina evento', valore: 'tutti', pericolo: true }];
      chiedi('Eliminare?', scelte, ev.titolo).then(scelta => {
        if (!scelta) return;
        if (scelta === 'uno') {
          const orig = Stato.prendi<Evento>(esistente!.id)!;
          orig.exdate = (orig.exdate || []).concat([occ!.chiave]);
          Stato.salva(orig);
        } else Stato.elimina(esistente!.id);
        f.chiudi();
      });
    },
  });
  if (nuovo) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) titolo.focus(); }, 50);
}

/** Editor promemoria/task. */
function apriTask(esistente?: Task, preset?: { scadenza?: string; titolo?: string }): void {
  const nuovo = !esistente;
  const t: Task = esistente ? JSON.parse(JSON.stringify(esistente)) : {
    id: uid(), type: 'task', updatedAt: 0, titolo: preset && preset.titolo || '', priorita: 0, fatto: false,
    scadenza: preset ? preset.scadenza : undefined,
  };
  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Cosa devi fare?', value: t.titolo, autocomplete: 'off' }) as HTMLInputElement;
  const data = h('input', { type: 'date', value: t.scadenza ? t.scadenza.slice(0, 10) : '' }) as HTMLInputElement;
  const ora = h('input', { type: 'time', value: t.scadenza && t.scadenza.length > 10 ? t.scadenza.slice(11) : '' }) as HTMLInputElement;
  const prio = selettore([['0', 'Nessuna'], ['1', 'Bassa'], ['2', 'Media'], ['3', 'Alta']], String(t.priorita));
  const cat = selettoreCategoria(t.categoriaId);
  const rip = campoRicorrenza(t.rrule, () => data.value ? daYmd(data.value) : new Date());
  const note = h('textarea', { rows: 3, placeholder: 'Note', value: t.note || '' }) as HTMLTextAreaElement;
  const svuotaData = h('button.btn-testo', { type: 'button', onclick: () => { data.value = ''; ora.value = ''; } }, 'Togli');

  const f = foglio({
    titolo: nuovo ? 'Nuovo promemoria' : 'Promemoria',
    corpo: h('div.modulo', null,
      titolo,
      h('div.gruppo', null, riga('Scadenza', data, ora, svuotaData), rip.el, h('div.tenue.piccolo', null, 'Senza data resta in Inbox.')),
      h('div.gruppo', null, riga('Priorità', prio), riga('Categoria', cat)),
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), note),
    ),
    salva: () => {
      t.titolo = titolo.value.trim();
      if (!t.titolo) { avviso('Scrivi un titolo'); return false; }
      t.scadenza = data.value ? (ora.value ? data.value + 'T' + ora.value : data.value) : undefined;
      t.priorita = parseInt(prio.value, 10) || 0;
      t.categoriaId = cat.value || undefined;
      t.rrule = t.scadenza ? rip.valore() : undefined;
      t.note = note.value;
      Stato.salva(t);
    },
    elimina: nuovo ? undefined : () => {
      chiedi('Eliminare il promemoria?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], t.titolo).then(s => { if (s) { Stato.elimina(t.id); f.chiudi(); } });
    },
  });
  if (nuovo) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) titolo.focus(); }, 50);
}

/** Editor nota (con anteprima markdown). */
function apriNota(esistente?: Nota, preset?: { giorno?: string }): void {
  const nuovo = !esistente;
  const n: Nota = esistente ? JSON.parse(JSON.stringify(esistente)) : {
    id: uid(), type: 'nota', updatedAt: 0, titolo: '', testo: '', tag: [], giorno: preset ? preset.giorno : undefined,
  };
  const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Titolo', value: n.titolo, autocomplete: 'off' }) as HTMLInputElement;
  const testo = h('textarea.nota-testo', { rows: 12, placeholder: 'Scrivi qui… (markdown)', value: n.testo }) as HTMLTextAreaElement;
  const tag = h('input', { type: 'text', placeholder: 'tag separati da virgola', value: n.tag.join(', '), autocapitalize: 'off' }) as HTMLInputElement;
  const anteprima = h('div.md');
  let mostra = false;
  const btnAnt = h('button.btn-testo', { type: 'button', onclick: () => {
    mostra = !mostra;
    anteprima.innerHTML = mostra ? md(testo.value) : '';
    testo.style.display = mostra ? 'none' : '';
    btnAnt.textContent = mostra ? 'Modifica' : 'Anteprima';
  } }, 'Anteprima');

  const f = foglio({
    titolo: n.giorno ? 'Nota del ' + fmt(daYmd(n.giorno), { day: 'numeric', month: 'long' }) : (nuovo ? 'Nuova nota' : 'Nota'),
    corpo: h('div.modulo', null,
      titolo,
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Testo', btnAnt), testo, anteprima),
      h('div.gruppo', null, riga('Tag', tag)),
    ),
    salva: () => {
      n.titolo = titolo.value.trim();
      n.testo = testo.value;
      n.tag = tag.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
      if (!n.titolo && !n.testo.trim()) { if (!nuovo) Stato.elimina(n.id); return; }
      if (!n.titolo) n.titolo = n.testo.trim().split('\n')[0].slice(0, 60);
      Stato.salva(n);
    },
    elimina: nuovo ? undefined : () => {
      chiedi('Eliminare la nota?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], n.titolo).then(s => { if (s) { Stato.elimina(n.id); f.chiudi(); } });
    },
  });
  if (nuovo) setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) testo.focus(); }, 50);
}

/** Menu del pulsante "+": cosa vuoi creare? */
function apriNuovo(giorno?: Date): void {
  const g = giorno || oggi();
  chiedi('Nuovo', [
    { testo: 'Evento', valore: 'evento' },
    { testo: 'Promemoria', valore: 'task' },
    { testo: 'Nota', valore: 'nota' },
  ], dataLunga(g)).then(s => {
    if (s === 'evento') apriEvento(undefined, undefined, { inizio: g });
    else if (s === 'task') apriTask(undefined, { scadenza: stessoGiorno(g, oggi()) && !giorno ? undefined : ymd(g) });
    else if (s === 'nota') apriNota();
  });
}
