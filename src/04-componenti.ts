// ============================================================
// 04-componenti.ts — Pezzi riusabili dell'interfaccia:
// foglio (modale), dialogo di scelta, avviso (toast), campo ricorrenza.
// ============================================================

const ICONE: Record<string, string> = {
  oggi: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  task: '<path d="M4 6.5l2 2 3.5-4M4 16.5l2 2 3.5-4M13 7h7M13 17h7"/>',
  note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M9 12h7M9 16h5"/>',
  altro: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  piu: '<path d="M12 5v14M5 12h14"/>',
  sx: '<path d="M14.5 5l-7 7 7 7"/>',
  dx: '<path d="M9.5 5l7 7-7 7"/>',
  ripeti: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
  luogo: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  campana: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
function icona(nome: string, dim = 22): HTMLElement {
  const s = h('span.ico');
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + dim + '" height="' + dim + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONE[nome] || '') + '</svg>';
  return s;
}

/** Foglio modale a tutta altezza su telefono, centrato su PC. */
function foglio(opz: {
  titolo: string;
  corpo: HTMLElement;
  salva?: () => boolean | void;       // ritorna false per non chiudere
  etichettaSalva?: string;
  elimina?: () => void;
}): { chiudi: () => void } {
  const chiudi = () => { sfondo.remove(); document.removeEventListener('keydown', tasto); };
  const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi(); };
  const sfondo = h('div.foglio-sfondo', { onclick: (e: Event) => { if (e.target === sfondo) chiudi(); } },
    h('div.foglio', { role: 'dialog', 'aria-label': opz.titolo },
      h('div.foglio-testa', null,
        h('button.btn-testo', { onclick: chiudi }, 'Annulla'),
        h('div.foglio-titolo', null, opz.titolo),
        opz.salva
          ? h('button.btn-testo.forte', { onclick: () => { if (opz.salva!() !== false) chiudi(); } }, opz.etichettaSalva || 'Salva')
          : h('span', { style: { width: '56px' } }),
      ),
      h('div.foglio-corpo', null, opz.corpo,
        opz.elimina ? h('button.btn.pericolo', { onclick: () => opz.elimina!() }, 'Elimina') : null,
      ),
    ),
  );
  document.body.appendChild(sfondo);
  document.addEventListener('keydown', tasto);
  return { chiudi };
}

/** Dialogo di scelta (al posto di confirm/alert, che su iOS in PWA danno problemi). */
function chiedi(titolo: string, scelte: { testo: string; valore: string; pericolo?: boolean }[], testo?: string): Promise<string | null> {
  return new Promise(ok => {
    const fine = (v: string | null) => { sfondo.remove(); ok(v); };
    const sfondo = h('div.dialogo-sfondo', { onclick: (e: Event) => { if (e.target === sfondo) fine(null); } },
      h('div.dialogo', { role: 'alertdialog' },
        h('div.dialogo-titolo', null, titolo),
        testo ? h('div.dialogo-testo', null, testo) : null,
        scelte.map(s => h('button.btn' + (s.pericolo ? '.pericolo' : ''), { onclick: () => fine(s.valore) }, s.testo)),
        h('button.btn.neutro', { onclick: () => fine(null) }, 'Annulla'),
      ),
    );
    document.body.appendChild(sfondo);
  });
}

/** Avviso temporaneo in alto. */
function avviso(testo: string, durataMs = 4000, alTocco?: () => void): void {
  let zona = document.getElementById('avvisi');
  if (!zona) { zona = h('div', { id: 'avvisi', 'aria-live': 'polite' }); document.body.appendChild(zona); }
  const el = h('div.avviso', { onclick: () => { el.remove(); if (alTocco) alTocco(); } }, testo);
  zona.appendChild(el);
  if (durataMs > 0) setTimeout(() => el.remove(), durataMs);
}

/** Riga di modulo con etichetta. */
function riga(etichetta: string, ...campo: Figlio[]): HTMLElement {
  return h('label.riga', null, h('span.riga-eti', null, etichetta), h('span.riga-campo', null, campo));
}
function selettore(opzioni: [string, string][], valore: string, onchange?: (this: HTMLSelectElement, e: Event) => void): HTMLSelectElement {
  const s = h('select', { onchange }) as HTMLSelectElement;
  for (const [v, t] of opzioni) s.appendChild(h('option', { value: v }, t));
  s.value = valore;
  return s;
}

/** Campo ricorrenza completo (frequenza, intervallo, giorni, fine). */
function campoRicorrenza(iniziale: Ricorrenza | undefined, giornoBase: () => Date): { el: HTMLElement; valore: () => Ricorrenza | undefined } {
  const rr: Ricorrenza | null = iniziale ? JSON.parse(JSON.stringify(iniziale)) : null;
  const freq = selettore([['', 'Mai'], ['D', 'Ogni giorno'], ['W', 'Ogni settimana'], ['M', 'Ogni mese'], ['Y', 'Ogni anno']], rr ? rr.freq : '', () => aggiorna());
  const interv = h('input', { type: 'number', min: '1', max: '99', value: String(rr ? rr.interval || 1 : 1), inputMode: 'numeric' }) as HTMLInputElement;
  const giorni = new Set<number>(rr && rr.byday ? rr.byday : []);
  const fineTipo = selettore([['', 'Mai'], ['data', 'Fino al'], ['num', 'Dopo N volte']], rr ? (rr.until ? 'data' : rr.count ? 'num' : '') : '', () => aggiorna());
  const fineData = h('input', { type: 'date', value: rr && rr.until ? rr.until : '' }) as HTMLInputElement;
  const fineNum = h('input', { type: 'number', min: '1', max: '999', value: String(rr && rr.count ? rr.count : 10), inputMode: 'numeric' }) as HTMLInputElement;
  const dettagli = h('div.rip-dettagli');
  const el = h('div', null, riga('Ripeti', freq), dettagli);

  function aggiorna(): void {
    svuota(dettagli);
    if (!freq.value) return;
    const unita = { D: 'giorni', W: 'settimane', M: 'mesi', Y: 'anni' }[freq.value as 'D'];
    dettagli.appendChild(riga('Ogni', interv, h('span.dopo', null, unita)));
    if (freq.value === 'W') {
      if (!giorni.size) giorni.add((giornoBase().getDay() + 6) % 7);
      dettagli.appendChild(h('div.giorni-sett', null, GIORNI_BREVI.map((n, i) => {
        const b = h('button.chip' + (giorni.has(i) ? '.attivo' : ''), { type: 'button', onclick: () => {
          if (giorni.has(i)) { if (giorni.size > 1) giorni.delete(i); } else giorni.add(i);
          b.classList.toggle('attivo', giorni.has(i));
        } }, n);
        return b;
      })));
    }
    dettagli.appendChild(riga('Termina', fineTipo, fineTipo.value === 'data' ? fineData : fineTipo.value === 'num' ? fineNum : null));
  }
  aggiorna();

  return {
    el,
    valore() {
      if (!freq.value) return undefined;
      const out: Ricorrenza = { freq: freq.value as Ricorrenza['freq'], interval: Math.max(1, parseInt(interv.value, 10) || 1) };
      if (out.freq === 'W' && giorni.size) out.byday = Array.from(giorni).sort((a, b) => a - b);
      if (fineTipo.value === 'data' && fineData.value) out.until = fineData.value;
      if (fineTipo.value === 'num') out.count = Math.max(1, parseInt(fineNum.value, 10) || 1);
      return out;
    },
  };
}

function selettoreCategoria(valore?: string): HTMLSelectElement {
  return selettore([['', 'Nessuna'] as [string, string]].concat(categorie().map(c => [c.id, c.nome] as [string, string])), valore || '');
}
