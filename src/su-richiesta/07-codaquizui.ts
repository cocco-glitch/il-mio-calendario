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
    const microstep = h('input', { type: 'text', placeholder: 'Microstep (es. 3.3.1)', 'aria-label': 'Microstep di destinazione del quiz' }) as HTMLInputElement;
    const quantita = h('input', { type: 'number', min: '1', max: '200', value: '30', inputmode: 'numeric', 'aria-label': 'Numero di domande' }) as HTMLInputElement;
    const testo = h('textarea', { rows: '8', placeholder: 'Incolla appunti o testo del libro…', 'aria-label': 'Testo da cui generare il quiz' }) as HTMLTextAreaElement;
    const pdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', 'aria-label': 'PDF testuale da cui generare il quiz' }) as HTMLInputElement;
    const stato = h('p.piccolo', { role: 'status', 'aria-live': 'polite' }, 'La coda riprende quando riapri l’app. Non lavora a browser o dispositivo chiusi.');
    const elenco = h('div'), quote = QuoteUI.pannello(); let occupato = false;
    const opzioni = (): SpecificaGenerazioneQuiz => ({ quantita: Number(quantita.value), materia: materia.value, argomento: argomento.value, step: step.value, microstep: microstep.value });

    function dettagliQualita(l: LavoroQuiz): HTMLElement | null {
      const q = l.rapportoQualita, revisioni = l.revisioni || [];
      if (!q && !revisioni.length) return null;
      const problemi = q?.problemiPacchetto || [];
      return h('details', null,
        h('summary.piccolo', null, 'Dettagli qualità · ' + (q ? q.pronte + ' pronte · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere' : revisioni.length + ' da controllare')),
        problemi.length ? h('div', null, h('p.piccolo', null, h('b', null, 'Controlli del pacchetto')), h('ul.piccolo', null, ...problemi.map(x => h('li', null, x)))) : h('p.piccolo.tenue', null, 'Nessun problema complessivo rilevato.'),
        revisioni.length ? h('div', null, h('p.piccolo', null, h('b', null, 'Domande non pronte')), ...revisioni.map(r => h('details', null, h('summary.piccolo', null, (r.stato === 'da_rivedere' ? 'Da rivedere' : 'Da correggere') + ' · ' + String(r.domanda.domanda || r.id).slice(0, 120)),
          h('p.piccolo.tenue', null, 'Tentativi: ' + r.tentativi + (r.pagine.length ? ' · pagine: ' + r.pagine.join(', ') : '')), h('ul.piccolo', null, ...r.motivi.map(x => h('li', null, x))),
          r.cronologia?.length ? h('details', null, h('summary.piccolo', null, 'Cronologia'), h('ul.piccolo', null, ...r.cronologia.map(x => h('li', null, 'Tentativo ' + x.tentativo + ' · ' + x.esito + ' · ' + x.campi.join(', '))))) : null,
          r.stato === 'da_rivedere' ? h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.rigeneraDomanda(account, l.id, r.id); stato.textContent = 'Rigenerazione individuale accodata: la domanda precedente resta nella cronologia e non conta nella copertura.'; await disegna(); } }, 'Rigenera questa domanda') : null))) : null);
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
        const azioni: HTMLElement[] = [];
        if (l.stato === 'in_coda' || l.stato === 'in_pausa') azioni.push(h('button.chip', { type: 'button', onclick: () => esegui(l) }, l.stato === 'in_pausa' ? 'Riprendi' : 'Continua'));
        if (l.stato === 'in_coda' || l.stato === 'in_esecuzione') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.pausa(account, l.id); stato.textContent = 'Coda in pausa.'; QuoteUI.aggiorna(quote.querySelector('[data-quote-ai]') as HTMLElement); await disegna(); } }, 'Pausa'));
        if (!['completato', 'annullato'].includes(l.stato)) azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.annulla(account, l.id); stato.textContent = 'Lavoro annullato; i checkpoint restano visibili finché non lo elimini.'; await disegna(); } }, 'Annulla'));
        if (l.stato === 'completato') azioni.push(h('button.chip', { type: 'button', onclick: () => scarica(l) }, 'Scarica JSON'));
        if (l.stato === 'completato' && !l.innestoId) azioni.push(h('button.chip', { type: 'button', onclick: async () => {
          try {
            const inn = CodaQuizQualita.innesta(l); await CodaQuiz.segnaInnesto(account, l.id, inn.id);
            stato.textContent = 'Quiz innestato in modo idempotente nel corso e nel piano: ' + inn.k + '.'; await disegna();
          } catch (e) { stato.textContent = String(e instanceof Error ? e.message : e); }
        } }, 'Innestalo nel piano'));
        if (l.stato === 'completato' || l.stato === 'annullato') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.elimina(account, l.id); await disegna(); } }, 'Elimina'));
        elenco.appendChild(h('section.card', null, h('p', null, h('b', null, etichettaStato[l.stato]), ' · ', String(l.specifica.materia || l.specifica.argomento || l.sorgente.id)),
          h('p.piccolo.tenue', null, n + '/' + tot + ' pronte' + (q ? ' · ' + q.daCorreggere + ' da correggere · ' + q.daRivedere + ' da rivedere' : '') + ' · ' + (l.checkpoint || []).length + ' checkpoint' + (l.innestoId ? ' · innestato' : '') + (l.ultimoErrore ? ' · ' + l.ultimoErrore : '') +
            (l.prossimoTentativoIl ? ' · non prima delle ' + dataOra(l.prossimoTentativoIl) : '')), dettagliQualita(l), h('div.chips', null, ...azioni)));
      }
    }
    const avvia = async () => {
      if (occupato) return;
      try {
        stato.textContent = pdf.files && pdf.files[0] ? 'Estraggo il testo del PDF (senza OCR)…' : 'Preparo il testo…';
        const l = pdf.files && pdf.files[0] ? await CodaQuizRunner.creaDaPdf(account, pdf.files[0], opzioni()) : await CodaQuizRunner.creaDaTesto(account, testo.value, opzioni());
        await disegna(); await esegui(l);
      } catch (e) { stato.textContent = String(e instanceof Error ? e.message : e); }
    };
    const corpo = h('div', null, h('p.piccolo.tenue', null, 'Genera in micro-batch con il router AI già configurato. Il PDF deve contenere testo: OCR e richieste parallele non sono inclusi.'),
      h('div.chips', null, materia, argomento, step, microstep, quantita), h('p.piccolo.tenue', null, 'Step e microstep collegano le sole domande pronte al corso e al piano esistente.'), testo, h('p.piccolo', null, 'oppure'), pdf,
      h('button.btn', { type: 'button', onclick: avvia }, 'Genera nella coda'), quote, stato, h('h3', null, 'Coda locale'), elenco);
    foglio({ titolo: 'Genera quiz in app', corpo });
    CodaQuiz.recuperaInterrotti(account).then(disegna).catch(e => { stato.textContent = String(e); });
  }
  return { apri };
})();
