// ============================================================
// 07-codaquizui.ts - P0-B: ingresso utente minimo per la generazione persistente in app.
// P0-C aggiungera' validazione/correzione e innesto; qui il risultato resta scaricabile e nella coda locale.
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
    const quantita = h('input', { type: 'number', min: '1', max: '200', value: '30', inputmode: 'numeric', 'aria-label': 'Numero di domande' }) as HTMLInputElement;
    const testo = h('textarea', { rows: '8', placeholder: 'Incolla appunti o testo del libro…', 'aria-label': 'Testo da cui generare il quiz' }) as HTMLTextAreaElement;
    const pdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', 'aria-label': 'PDF testuale da cui generare il quiz' }) as HTMLInputElement;
    const stato = h('p.piccolo', { role: 'status', 'aria-live': 'polite' }, 'La coda riprende quando riapri l’app. Non lavora a browser o dispositivo chiusi.');
    const elenco = h('div'); let occupato = false;
    const opzioni = (): SpecificaGenerazioneQuiz => ({ quantita: Number(quantita.value), materia: materia.value, argomento: argomento.value });

    async function esegui(l: LavoroQuiz): Promise<void> {
      if (occupato) return; occupato = true;
      try {
        if (l.stato === 'completato') { stato.textContent = 'Questo lavoro è già completo: puoi scaricare il JSON dalla coda.'; return; }
        if (l.stato === 'annullato') { stato.textContent = 'Questo lavoro è annullato: eliminalo dalla coda prima di ricrearlo con le stesse opzioni.'; return; }
        if (l.stato === 'in_pausa') l = await CodaQuiz.riprendi(account, l.id);
        stato.textContent = 'Generazione sequenziale in corso · quota gestita dal router AI (misurata dal provider quando disponibile, altrimenti stimata o sconosciuta).';
        while (elenco.isConnected) {
          const r = await CodaQuizRunner.avanza(account);
          await disegna();
          if (r.esito === 'checkpoint') { stato.textContent = 'Checkpoint salvato: ' + ((r.lavoro?.risultati || []).length) + ' domande. Continuo…'; continue; }
          if (r.esito === 'completato') stato.textContent = 'Completato: ' + ((r.lavoro?.risultati || []).length) + ' domande salvate sul dispositivo.';
          else if (r.esito === 'rimandato') stato.textContent = 'Coda conservata. Riprovo non prima delle ' + dataOra(r.prossimoTentativoIl || null) + ' · ' + (r.errore || 'provider non disponibile');
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
        const n = (l.risultati || []).length, tot = Number(l.specifica.quantita) || 0;
        const azioni: HTMLElement[] = [];
        if (l.stato === 'in_coda' || l.stato === 'in_pausa') azioni.push(h('button.chip', { type: 'button', onclick: () => esegui(l) }, l.stato === 'in_pausa' ? 'Riprendi' : 'Continua'));
        if (l.stato === 'in_coda' || l.stato === 'in_esecuzione') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.pausa(account, l.id); stato.textContent = 'Coda in pausa.'; await disegna(); } }, 'Pausa'));
        if (!['completato', 'annullato'].includes(l.stato)) azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.annulla(account, l.id); stato.textContent = 'Lavoro annullato; i checkpoint restano visibili finché non lo elimini.'; await disegna(); } }, 'Annulla'));
        if (l.stato === 'completato') azioni.push(h('button.chip', { type: 'button', onclick: () => scarica(l) }, 'Scarica JSON'));
        if (l.stato === 'completato' || l.stato === 'annullato') azioni.push(h('button.chip', { type: 'button', onclick: async () => { await CodaQuiz.elimina(account, l.id); await disegna(); } }, 'Elimina'));
        elenco.appendChild(h('section.card', null, h('p', null, h('b', null, etichettaStato[l.stato]), ' · ', String(l.specifica.materia || l.specifica.argomento || l.sorgente.id)),
          h('p.piccolo.tenue', null, n + '/' + tot + ' domande · ' + (l.checkpoint || []).length + ' checkpoint' + (l.ultimoErrore ? ' · ' + l.ultimoErrore : '') +
            (l.prossimoTentativoIl ? ' · non prima delle ' + dataOra(l.prossimoTentativoIl) : '')), h('div.chips', null, ...azioni)));
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
      h('div.chips', null, materia, argomento, quantita), testo, h('p.piccolo', null, 'oppure'), pdf,
      h('button.btn', { type: 'button', onclick: avvia }, 'Genera nella coda'), stato, h('h3', null, 'Coda locale'), elenco);
    foglio({ titolo: 'Genera quiz in app', corpo });
    CodaQuiz.recuperaInterrotti(account).then(disegna).catch(e => { stato.textContent = String(e); });
  }
  return { apri };
})();
