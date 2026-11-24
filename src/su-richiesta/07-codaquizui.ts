// ============================================================
// 07-codaquizui.ts - P0-C: generazione, qualita, correzione chirurgica e innesto.
// ============================================================

const CodaQuizUI = (() => {
  const etichettaStato: Record<StatoLavoroQuiz, string> = { in_coda: 'In coda', in_esecuzione: 'In esecuzione', in_pausa: 'In pausa', completato: 'Completato', annullato: 'Annullato' };
  const dataOra = (n: number | null) => n ? new Date(n).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
  function scarica(l: LavoroQuiz): void {
    const a = document.createElement('a'), blob = new Blob([JSON.stringify({ formato: 'quiz-v2', quiz: l.risultati || [] }, null, 2)], { type: 'application/json' });
    a.href = URL.createObjectURL(blob); a.download = 'quiz-generato-' + l.id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function apri(): void {
    const account = CodaQuiz.accountAttuale(), materia = h('input', { type: 'text', placeholder: 'Materia', 'aria-label': 'Materia del quiz' }) as HTMLInputElement;
    const argomento = h('input', { type: 'text', placeholder: 'Argomento', 'aria-label': 'Argomento del quiz' }) as HTMLInputElement;
    const step = h('input', { type: 'text', placeholder: 'Step (es. 3.3)', 'aria-label': 'Step di destinazione del quiz' }) as HTMLInputElement;
    const microstep = h('input', { type: 'text', placeholder: 'Microstep, anche più di uno (es. 3.3.1, 3.3.2)', 'aria-label': 'Microstep di destinazione del quiz' }) as HTMLInputElement;
    const quantita = h('input', { type: 'number', min: '1', max: '200', value: '30', inputmode: 'numeric', 'aria-label': 'Numero di domande' }) as HTMLInputElement;
    const modalita = h('select', { 'aria-label': 'Modalità quantità quiz' }, h('option', { value: 'auto' }, 'Automatica'), h('option', { value: 'manuale' }, 'Totale manuale')) as HTMLSelectElement;
    const intensita = h('select', { 'aria-label': 'Intensità quantità quiz' }, h('option', { value: '1' }, 'Leggera'), h('option', { value: '2' }, 'Normale'), h('option', { value: '3' }, 'Intensa')) as HTMLSelectElement;
    intensita.value = '2';
    const proposta = h('div.centro-nota', { role: 'status', 'aria-live': 'polite', 'data-piano-quantita': '' }, 'Indica uno o più microstep e calcola la proposta.') as HTMLElement;
    const testo = h('textarea', { rows: '8', placeholder: 'Incolla appunti o testo del libro…', 'aria-label': 'Testo da cui generare il quiz' }) as HTMLTextAreaElement;
    const pdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, 'aria-label': 'Uno o più PDF testuali da cui generare il quiz' }) as HTMLInputElement;
    const stato = h('p.piccolo', { role: 'status', 'aria-live': 'polite' }, 'La coda riprende quando riapri l’app. Non lavora a browser o dispositivo chiusi.');
    const elenco = h('div'), quote = QuoteUI.pannello(); let occupato = false;
    let chiudiFoglio = () => { /* assegnata dopo la costruzione del foglio */ };
    let pianoQuantita: PianoQuantitaQuiz | null = null;
    const idsMicrostep = () => [...new Set(microstep.value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
    function calcolaProposta(): PianoQuantitaQuiz | null {
      const ids = idsMicrostep();
      if (!ids.length) { pianoQuantita = null; proposta.textContent = 'Indica uno o più microstep per calcolare la copertura.'; return null; }
      pianoQuantita = PianificazioneQuiz.calcola({ modalita: modalita.value === 'manuale' ? 'manuale' : 'auto', totaleManuale: Number(quantita.value), massimoTotale: 200,
        intensita: Number(intensita.value) as 1 | 2 | 3, microstep: ids.map(id => ({ id })) });
      proposta.textContent = 'Proposta: ' + pianoQuantita.totale + ' domande totali · ' + pianoQuantita.perMicrostep.map(x => x.id + ': ' + x.quantita).join(' · ') +
        (pianoQuantita.avvisi.length ? ' · ' + pianoQuantita.avvisi.join(' ') : '');
      return pianoQuantita;
    }
    const calcolaBtn = h('button.chip', { type: 'button', 'aria-label': 'Calcola proposta quantità', onclick: calcolaProposta }, 'Calcola proposta') as HTMLButtonElement;
    const opzioni = (): SpecificaGenerazioneQuiz => ({ quantita: Number(quantita.value), materia: materia.value, argomento: argomento.value, step: step.value, microstep: idsMicrostep()[0] || microstep.value });

    function dettagliQualita(l: LavoroQuiz): HTMLElement | null {
      const q = l.rapportoQualita, revisioni = l.revisioni || [];
      if (!q && !revisioni.length) return null;
      const problemi = q?.problemiPacchetto || [];
      return h('details', null,
        h('summary.piccolo', null, 'Dettagli qualità · ' + (q ? q.pronte + ' pronte · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere' : revisioni.length + ' da controllare')),
        problemi.length ? h('div', null, h('p.piccolo', null, h('b', null, 'Controlli del pacchetto')), h('ul.piccolo', null, ...problemi.map(x => h('li', null, x))))
          : h('p.piccolo.tenue', null, 'Nessun problema complessivo rilevato.'),
        revisioni.length ? h('div', null, h('p.piccolo', null, h('b', null, 'Domande non pronte')),
          ...revisioni.map(r => h('details', null, h('summary.piccolo', null, (r.stato === 'da_rivedere' ? 'Da rivedere' : 'Da correggere') + ' · ' + String(r.domanda.domanda || r.id).slice(0, 120)),
            h('p.piccolo.tenue', null, 'Tentativi: ' + r.tentativi + (r.pagine.length ? ' · pagine: ' + r.pagine.join(', ') : '')),
            h('ul.piccolo', null, ...r.motivi.map(x => h('li', null, x))), r.cronologia?.length ? h('details', null, h('summary.piccolo', null, 'Cronologia'), h('ul.piccolo', null, ...r.cronologia.map(x => h('li', null, 'Tentativo ' + x.tentativo + ' · ' + x.esito + ' · ' + x.campi.join(', '))))) : null,
            r.stato === 'da_rivedere' ? h('div.chips', null,
              h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.riprovaCorrezione(account, l.id, r.id); stato.textContent = 'Correzione riaperta senza rigenerare la domanda; cronologia conservata.'; await disegna(); } }, 'Riprova correzione'),
              h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.rigeneraDomanda(account, l.id, r.id); stato.textContent = 'Rigenerazione individuale accodata: la domanda precedente resta nella cronologia e non conta nella copertura.'; await disegna(); } }, 'Rigenera questa domanda')) : null))) : null);
    }

    function prova(l: LavoroQuiz): void {
      const lista = CodaQuizQualita.domandeProva(l);
      if (!lista.length) { stato.textContent = 'Nessuna domanda pronta da provare.'; return; }
      const materiaQ = String(l.specifica.materia || 'Quiz generato'), micro = String(l.specifica.microstep || l.specifica.step || 'Quiz generato');
      const titolo = String(l.specifica.argomento || materiaQ), sk = 'prova-coda-' + l.id;
      const pk = { tipo: 'step', id: 'prova-coda', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] } as unknown as PkStep;
      const s = { id: sk, k: 1, n: 1, titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
      chiudiFoglio();
      void QuizApp.apri(pk, materiaQ, micro, s, () => lista, { occh: 'Prova · coda quiz · senza statistiche', titolo, prova: true, chiudi: () => apri() });
    }

    async function esegui(l: LavoroQuiz): Promise<void> {
      if (occupato) return; occupato = true;
      try {
        QuoteUI.aggiorna(quote.querySelector('[data-quote-ai]') as HTMLElement);
        if (l.stato === 'completato') { stato.textContent = 'Questo lavoro è già completo: puoi scaricare il JSON dalla coda.'; return; }
        if (l.stato === 'annullato') { stato.textContent = 'Questo lavoro è annullato: eliminalo dalla coda prima di ricrearlo con le stesse opzioni.'; return; }
        if (l.stato === 'in_pausa') { l = await CodaQuiz.riprendi(account, l.id); QuoteUI.aggiorna(quote.querySelector('[data-quote-ai]') as HTMLElement); }
        stato.textContent = 'Generazione sequenziale in corso · quota gestita dal router AI (misurata dal provider quando disponibile, altrimenti stimata o sconosciuta).';
        while (elenco.isConnected) {
          const r = await CodaQuizRunner.avanza(account);
          await disegna();
          if (r.esito === 'checkpoint') { const q = r.lavoro?.rapportoQualita; stato.textContent = 'Checkpoint salvato: ' + (q ? q.pronte + ' pronte · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere' : (r.lavoro?.risultati || []).length + ' domande') + '. Continuo…'; continue; }
          if (r.esito === 'completato') { const q = r.lavoro?.rapportoQualita; stato.textContent = 'Completato: ' + ((r.lavoro?.risultati || []).length) + ' pronte' + (q && q.daRivedere ? ' · ' + q.daRivedere + ' da rivedere' : '') + '. Solo le pronte contano nella copertura.'; }
          else if (r.esito === 'rimandato') stato.textContent = 'Coda conservata. Riprovo non prima delle ' + dataOra(r.prossimoTentativoIl || null) + ' · ' + (r.errore || 'provider non disponibile');
          else if (r.esito === 'pausa_incerta') stato.textContent = 'Coda in pausa: il provider potrebbe avere elaborato la richiesta. Controlla la diagnostica prima di riprendere, per evitare doppio consumo. · ' + (r.errore || 'esito incerto');
          else if (r.esito === 'occupato') stato.textContent = 'Un’altra scheda sta eseguendo questa coda.';
          break;
        }
      } catch (e) { stato.textContent = 'Generazione interrotta: ' + String(e instanceof Error ? e.message : e); }
      finally { occupato = false; await disegna(); }
    }
    async function disegna(): Promise<void> {
      const lavori = await CodaQuiz.lista(account); elenco.textContent = '';
      if (!lavori.length) { elenco.appendChild(h('p.piccolo.tenue', null, 'Nessun lavoro in coda su questo account.')); return; }
      for (const l of lavori.slice().reverse()) {
        const n = (l.risultati || []).length, tot = Number(l.specifica.quantita) || 0, q = l.rapportoQualita;
        const fonti = l.input?.fonti || [], origine = fonti.length ? ' · libro virtuale: ' + fonti.length + ' file, ' + l.input!.pagine.length + ' pagine' : '';
        const azioni: HTMLElement[] = [];
        if (l.stato === 'in_coda' || l.stato === 'in_pausa') azioni.push(h('button.chip', { type: 'button', onclick: () => esegui(l) }, l.stato === 'in_pausa' ? 'Riprendi' : 'Continua'));
        if (l.stato === 'in_coda' || l.stato === 'in_esecuzione') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.pausa(account, l.id); stato.textContent = 'Coda in pausa.'; QuoteUI.aggiorna(quote.querySelector('[data-quote-ai]') as HTMLElement); await disegna(); } }, 'Pausa'));
        if (!['completato', 'annullato'].includes(l.stato)) azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.annulla(account, l.id); stato.textContent = 'Lavoro annullato; i checkpoint restano visibili finché non lo elimini.'; await disegna(); } }, 'Annulla'));
        if (n) azioni.push(h('button.chip', { type: 'button', onclick: () => prova(l), 'aria-label': 'Prova ' + n + (n === 1 ? ' domanda pronta' : ' domande pronte') }, '▶ Prova le pronte'));
        if ((l.revisioni || []).length) azioni.push(h('button.chip', { type: 'button', onclick: async () => {
          const r = await CodaQuiz.rivalidaLocale(account, l.id); const q = r.rapportoQualita;
          stato.textContent = 'Rivalidazione locale completata senza usare crediti: ' + (r.risultati || []).length + ' pronte' + (q ? ' · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere.' : '.');
          await disegna();
        } }, 'Rivalida gratis'));
        if (l.stato === 'completato') azioni.push(h('button.chip', { type: 'button', onclick: () => scarica(l) }, 'Scarica JSON'));
        if (l.stato === 'completato' && !l.innestoId) azioni.push(h('button.chip', { type: 'button', onclick: async () => {
          try {
            const inn = CodaQuizQualita.innesta(l); await CodaQuiz.segnaInnesto(account, l.id, inn.id);
            stato.textContent = 'Quiz innestato in modo idempotente nel corso e nel piano: ' + inn.k + '.'; await disegna();
          } catch (e) { stato.textContent = String(e instanceof Error ? e.message : e); }
        } }, 'Innestalo nel piano'));
        if (l.stato === 'completato' || l.stato === 'annullato') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.elimina(account, l.id); await disegna(); } }, 'Elimina'));
        elenco.appendChild(h('section.card', { 'data-coda-id': l.id }, h('p', null, h('b', null, etichettaStato[l.stato]), ' · ', String(l.specifica.materia || l.specifica.argomento || l.sorgente.id)),
          h('p.piccolo.tenue', null, n + '/' + tot + ' pronte' + origine + (q ? ' · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere' : '') + ' · ' + (l.checkpoint || []).length + ' checkpoint' + (l.innestoId ? ' · innestato' : '') + (l.ultimoErrore ? ' · ' + l.ultimoErrore : '') +
            (l.prossimoTentativoIl ? ' · non prima delle ' + dataOra(l.prossimoTentativoIl) : '')), dettagliQualita(l), h('div.chips', null, ...azioni)));
      }
    }
    const avvia = async () => {
      if (occupato) return;
      try {
        const files = Array.from(pdf.files || []);
        stato.textContent = files.length > 1 ? 'Costruisco il libro virtuale dai PDF (senza OCR)…' : files.length ? 'Estraggo il testo del PDF (senza OCR)…' : 'Preparo il testo…';
        const piano = calcolaProposta();
        if (!piano) throw new Error('indica almeno un microstep prima di creare la coda');
        const lavori = files.length > 1 ? await CodaQuizRunner.creaPianoDaPdfs(account, files, opzioni(), piano)
          : files.length ? await CodaQuizRunner.creaPianoDaPdf(account, files[0], opzioni(), piano) : await CodaQuizRunner.creaPianoDaTesto(account, testo.value, opzioni(), piano);
        await disegna(); await esegui(lavori[0]);
      } catch (e) { stato.textContent = String(e instanceof Error ? e.message : e); }
    };
    const corpo = h('div', null, h('p.piccolo.tenue', null, 'Genera in micro-batch con il router AI già configurato. Puoi scegliere più PDF: diventano un solo libro virtuale con checkpoint condivisi. OCR e richieste parallele non sono inclusi.'),
      h('div.chips', null, materia, argomento, step, microstep),
      h('div.chips', null, modalita, quantita, intensita, calcolaBtn), proposta,
      h('p.piccolo.tenue', null, 'La proposta è la copertura totale. Ogni microstep avrà un lavoro distinto; i batch del provider non cambiano queste quantità.'), testo, h('p.piccolo', null, 'oppure'), pdf,
      h('button.btn', { type: 'button', onclick: avvia }, 'Genera nella coda'), quote, stato, h('h3', null, 'Coda locale'), elenco);
    const fg = foglio({ titolo: 'Genera quiz in app', corpo }); chiudiFoglio = fg.chiudi;
    CodaQuiz.recuperaInterrotti(account).then(disegna).catch(e => { stato.textContent = String(e); });
  }
  return { apri };
})();
