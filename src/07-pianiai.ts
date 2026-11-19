// ============================================================
// 07-pianiai.ts — v0.55 (BP4) Interfaccia del Pianificatore Neuro-Algoritmico Ibrido.
// Collega il modulo puro Pianificatore (07-pianificatore.ts) a: Google Calendar `primary` (sola lettura, opt-in),
// Drive (PDF delle fonti), IA (catena «genera», 1 chiamata JSON ≤1800 token), statq (ipercorrezioni), IndexedDB.
// Opt-in puro: un piano 'ai_neuro' nasce solo da «✨ Crea Piano Intelligente»; gli altri piani non vengono toccati.
// ============================================================

const PianiAI = (() => {
  const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const eAI = (p: any): p is PkPianoAI => !!p && p.origine === 'ai_neuro';
  const pianiAI = (): PkPianoAI[] => Studio.pkPiani().filter(eAI) as PkPianoAI[];

  function codiciMaterie(): string[] {
    const s = new Set<string>([...Object.keys(MATERIE_BASE), ...Stato.tutti<MateriaRec>('materia').map(m => m.codice), ...Studio.pkStep().flatMap(p => p.materie.map(m => m.m))]);
    return Array.from(s).filter(Boolean);
  }
  /** Minuti già occupati quel giorno dagli altri piani attivi (non AI): v.min se c'è, altrimenti 45 per voce. */
  function minutiAltriPiani(data: string): number {
    let tot = 0;
    for (const p of Studio.pianiAttivi()) {
      if (eAI(p)) continue;
      for (const g of p.giorni) for (const v of g.voci) if (!v.speciale && Studio.dataVoce(v, g, p.id) === data && !Studio.stepFatto(v.k, p)) tot += (v as any).min || 45;
    }
    return tot;
  }
  /** Prime 15 pagine di un PDF su Drive (lotti da 4, page.cleanup()). */
  async function leggiFonte(id: string): Promise<FonteTesto | null> {
    const blob = await Drive.scaricaBlob(id);
    const lib = await caricaPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const n = Math.min(15, pdf.numPages), pagine: string[] = [];
    for (let a = 1; a <= n; a += 4) {
      const lotto = await Promise.all(Array.from({ length: Math.min(4, n - a + 1) }, async (_, i) => {
        const pg = await pdf.getPage(a + i);
        try { const t = await pg.getTextContent(); return t.items.map((x: any) => x.str).join(' '); } finally { try { pg.cleanup(); } catch (_) { /* niente */ } }
      }));
      pagine.push(...lotto);
    }
    try { pdf.destroy(); } catch (_) { /* niente */ }
    return { fileId: id, nome: (blob as any).name || id, pagine };
  }
  const idDaLink = (s: string) => { const m = /[-\w]{25,}/.exec(s); return m ? m[0] : ''; };

  function dipendenze(o: { usaAI: boolean; testoIndice?: string; unita?: UnitaAI[]; pid?: string; titolo?: string }): DipPianificatore {
    return {
      oggi: ymd(new Date()),
      occupato: (da, a) => GCal.occupatoPrimary(da, a),
      minutiAltriPiani, statq: () => Stato.tutti('statq'), leggiFonte,
      ia: o.usaAI && !Dominio.senzaAI() ? (m, x) => IA.testo(m as any, 'genera', { maxOut: x.maxOut, archetipo: x.archetipo } as any).then(r => r.testo) : undefined,
      testoIndice: o.testoIndice, unita: o.unita, pid: o.pid, titolo: o.titolo,
    };
  }

  function salvaPiano(p: PkPianoAI): boolean { p.aggiornato = new Date().toISOString(); return Studio.importa(p); }

  // ---------- wizard «✨ Crea Piano Intelligente» ----------
  function apri(): void {
    const mats = codiciMaterie();
    const materia = selettore(mats.map(c => [c, nomeMateria(c)] as [string, string]), mats[0] || '');
    const data = h('input', { type: 'date', value: ymd(piuGiorni(new Date(), 21)), min: ymd(piuGiorni(new Date(), 2)) }) as HTMLInputElement;
    const partenza = selettore([['da_zero', 'Da zero'], ['ripasso', 'Ripasso'], ['raffinamento', 'Raffinamento']], 'da_zero');
    const obiettivo = selettore([['1', '1 · Comprensione'], ['2', '2 · Elaborazione'], ['3', '3 · Applicazione'], ['4', '4 · Transfer']], '4');
    const giorni = [1, 2, 3, 4, 5, 6, 0].map(g => { const c = h('input', { type: 'checkbox', checked: g !== 0 }) as HTMLInputElement; (c as any)._g = g; return c; });
    const oraDa = h('input', { type: 'time', value: '15:00' }) as HTMLInputElement, oraA = h('input', { type: 'time', value: '19:00' }) as HTMLInputElement;
    const oreMax = h('input', { type: 'number', min: '0.5', max: '10', step: '0.5', value: '3', inputMode: 'decimal' }) as HTMLInputElement;
    const primary = h('input', { type: 'checkbox', checked: !!imp().gcalLeggiPrimary }) as HTMLInputElement;
    const indice = h('textarea', { rows: 6, placeholder: 'Indice del libro (una riga per capitolo):\n1 Introduzione ..... 1\n2 La cellula ..... 15' }) as HTMLTextAreaElement;
    const fonti = h('input', { type: 'text', placeholder: 'Id o link dei PDF su Drive, separati da virgola' }) as HTMLInputElement;
    const senza = Dominio.senzaAI();
    const usaAI = h('input', { type: 'checkbox', checked: !senza, disabled: senza }) as HTMLInputElement;
    const esito = h('div.tenue.piccolo');

    const vincoli = (): VincoliPianoAI => {
      const m = materia.value;
      return {
        materiaCodice: m, archetipo: Dominio.archetipoMateria(m), sorgentiDriveIds: fonti.value.split(/[,\s]+/).map(idDaLink).filter(Boolean),
        dataTarget: data.value, livelloPartenza: partenza.value as LivelloPartenzaAI, livelloObiettivo: (+obiettivo.value || 4) as 1 | 2 | 3 | 4,
        finestreSettimanali: giorni.filter(c => c.checked).map(c => ({ giornoSettimana: (c as any)._g, oraInizio: oraDa.value || '15:00', oraFine: oraA.value || '19:00' })),
        maxOreGiorno: parseFloat(oreMax.value) || 3,
      };
    };
    const mostraRimedi = (f: FattibilitaAI) => {
      svuota(esito);
      esito.append(h('div', null, '⛔ Piano critico: servono ' + f.oreNecessarie + ' h, disponibili ' + f.oreDisponibili + ' h. Nessuna chiamata AI fatta.'));
      for (const r of f.rimedi) esito.append(h('button.btn.neutro', { onclick: () => {
        if (r.livelloObiettivo) obiettivo.value = String(r.livelloObiettivo);
        if (r.minutiExtra) oreMax.value = String(Math.min(10, (parseFloat(oreMax.value) || 3) + r.minutiExtra / 60));
        if (r.nuovaData) data.value = r.nuovaData;
        avviso('Rimedio applicato: premi di nuovo «Crea».');
      } }, r.testo));
    };
    let inCorso = false;
    const crea = async (sh: { chiudi: () => void }) => {
      if (inCorso) return; inCorso = true;
      try {
        const v = vincoli();
        if (!v.materiaCodice || !v.dataTarget || !v.finestreSettimanali.length) { avviso('Scegli materia, data e almeno un giorno.'); return; }
        if (!!imp().gcalLeggiPrimary !== primary.checked) { const i = imp(); i.gcalLeggiPrimary = primary.checked || undefined; Stato.salva(i); }
        esito.textContent = 'Calcolo la fattibilità (0 token)…';
        const r = await Pianificatore.creaPiano(v, dipendenze({ usaAI: usaAI.checked, testoIndice: indice.value, titolo: '🧠 ' + nomeMateria(v.materiaCodice) + ' entro ' + v.dataTarget }));
        if (!r.piano) { if (r.fatt.stato === 'critico') mostraRimedi(r.fatt); else esito.textContent = 'Nessun argomento trovato: incolla l\'indice o indica un PDF.'; return; }
        salvaPiano(r.piano);
        avviso('🧠 Piano creato (' + r.fatt.stato + ', fonte ' + (r.fonte === 'ai' ? 'AI · ' + r.chiamate + ' chiamata' : 'indice locale · 0 token') + ')' + (r.segnali.attiva ? ' · +20% per le ipercorrezioni' : '') + (r.errore ? ' · AI non disponibile: ' + r.errore : ''), 8000);
        sh.chiudi(); if (typeof disegna === 'function') disegna();
      } catch (e: any) { esito.textContent = 'Errore: ' + (e && e.message || e); }
      finally { inCorso = false; }
    };
    const stima = h('div.tenue.piccolo', null, senza ? 'Modalità 100% senza AI: mappa dall\'indice locale, 0 token.' : 'Con l\'AI: ~3.200 tok · 1 chiamata (catena genera). Se fallisce: indice locale, 0 token.');
    const sh = foglio({ titolo: '✨ Crea Piano Intelligente', etichettaSalva: 'Crea',
      corpo: h('div.modulo', null,
        h('div.gruppo', null, riga('Materia', materia), riga('Data obiettivo', data), riga('Partenza', partenza), riga('Obiettivo', obiettivo)),
        h('div.gruppo', null, riga('Giorni', h('span', null, ...giorni.map(c => h('label', { style: { marginRight: '6px' } }, c, GIORNI[(c as any)._g])))),
          riga('Dalle', oraDa), riga('Alle', oraA), riga('Ore max/giorno', oreMax),
          riga('Leggi Google Calendar', h('label', null, primary, ' impegni di «primary» (solo lettura)'))),
        indice, fonti,
        h('label', null, usaAI, ' Mappa gli argomenti con l\'AI'), stima, esito,
        h('div.tenue.piccolo', null, 'Prima si calcola la fattibilità senza AI; se il piano è critico ti propongo 3 rimedi e non spendo token.')),
      salva: () => { crea(sh); return false; } });
  }

  // ---------- hook post-quiz (Stadio 5, 0 token) ----------
  function dopoQuiz(sk: string, caso: string): void {
    const oggi = ymd(new Date());
    for (const p of pianiAI()) {
      if (Studio.nascosto(p.id)) continue;
      const r = Pianificatore.hookIpercorrezione(p, { oggi, sk, caso });
      if (!r) continue;
      salvaPiano(r.piano);
      avviso('🧠 ' + (caso === 'illusione_competenza' ? 'Illusione di competenza' : 'Risposta fortunata') + ': anticipo l\'applicazione dal ' + r.da.slice(8, 10) + '/' + r.da.slice(5, 7) + ' al ' + r.a.slice(8, 10) + '/' + r.a.slice(5, 7) + '.', 6000);
    }
  }

  // ---------- azioni sul piano ----------
  function bottoni(p?: PkPiano): HTMLElement | null {
    const crea = h('button.btn.neutro', { onclick: () => apri() }, '✨ Crea Piano Intelligente');
    if (!eAI(p)) return crea;
    const nas = Studio.nascosto(p.id);
    return h('span', null, crea,
      h('button.btn.neutro', { onclick: () => { Studio.nascondiPiano(p.id, !nas); disegna(); } }, nas ? '▶ Riprendi' : '⏸ Pausa'),
      h('button.btn.neutro', { onclick: async () => {
        const r = await Pianificatore.creaPiano(p.vincoliAI, dipendenze({ usaAI: false, unita: p.unita, pid: p.id, titolo: p.titolo }));
        if (!r.piano) { avviso('⛔ Da oggi il piano è critico: ' + r.fatt.rimedi.map(x => x.testo).join(' · '), 9000); return; }
        salvaPiano(r.piano); avviso('Piano ricalcolato da oggi (0 token).'); disegna();
      } }, '↻ Ricalcola da oggi'),
      h('button.btn.neutro', { onclick: async () => {
        if (await chiedi('Eliminare «' + p.titolo + '»?', [{ testo: 'Elimina il piano', valore: 'si', pericolo: true }], 'Le schede fatte e i punteggi restano: sparisce solo questo piano intelligente.') === 'si') { Stato.elimina('pk-' + p.id); disegna(); }
      } }, '🗑 Elimina'));
  }

  return { apri, dopoQuiz, bottoni, minutiAltriPiani, eAI };
})();
