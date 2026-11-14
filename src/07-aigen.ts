// =====================================================================
// 07-aigen.ts — Quiz Studio Q5: domande nuove generate dall'AI (Groq)
// 1) l'AI scrive domande SOLO dalle citazioni del libro presenti nella scheda;
// 2) un secondo passaggio le risolve "alla cieca" (opzioni mescolate, senza
//    sapere la giusta): se sbaglia o le trova ambigue, la domanda è scartata;
// 3) controlli automatici (formato, doppioni, lunghezza della corretta);
// 4) le superstiti vanno nella coda «Da approvare»: entrano nella banca
//    (record 'modq' nuova) solo quando l'utente le approva.
// =====================================================================

interface PropQ extends Rec { type: 'propq'; sk: string; titolo: string; campi: Partial<DomB>; quando: string; avviso?: string; }

const AIGen = (() => {
  const N = 5;
  const parole = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  function simile(a: string, b: string): number {
    const A = parole(a), B = parole(b); if (!A.size || !B.size) return 0;
    let c = 0; A.forEach(w => { if (B.has(w)) c++; });
    return c / (A.size + B.size - c);
  }
  function hash(s: string): string { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  const proposte = (sk?: string) => Stato.tutti<PropQ>('propq').filter(r => !r.deleted && (!sk || r.sk === sk));

  /** Controlli automatici: null se va bene, altrimenti il motivo dello scarto. */
  function controlla(d: any, esistenti: string[]): string | null {
    if (!d || typeof d.q !== 'string' || d.q.trim().length < 15) return 'testo mancante';
    if (!Array.isArray(d.o) || d.o.length !== 5 || d.o.some((x: any) => typeof x !== 'string' || !x.trim())) return 'servono 5 opzioni';
    if (new Set(d.o.map((x: string) => x.trim().toLowerCase())).size < 5) return 'opzioni uguali';
    if (!Array.isArray(d.ew) || d.ew.length !== 4 || d.ew.some((x: any) => typeof x !== 'string' || !x.trim())) return 'manca un «perché è sbagliata»';
    if (!Array.isArray(d.e) || d.e.length < 2) return 'correzione troppo corta';
    if (esistenti.some(q => simile(q, d.q) >= 0.6)) return 'quasi uguale a una domanda già presente';
    return null;
  }

  function promptGenera(titolo: string, mat: string, cit: string, gia: string[], cat: string, n: number) {
    const sys = 'Sei un docente che scrive quiz di ' + mat + ' per il semestre filtro di Medicina (stile dei test di ammissione italiani). '
      + 'Scrivi in italiano corretto. Usa SOLO le informazioni del TESTO DI RIFERIMENTO: non inventare dati, numeri o fatti che non ci sono. '
      + 'Rispondi solo con JSON valido.';
    const u = 'Scheda: ' + titolo + '\n\nTESTO DI RIFERIMENTO (citazioni dal libro del corso):\n' + cit
      + '\n\nDomande già presenti (NON ripeterle né riformularle):\n- ' + gia.slice(0, 40).join('\n- ')
      + '\n\nTipi di errore tipici degli studenti (usali per costruire i distrattori):\n' + cat
      + '\n\nScrivi ' + n + ' domande NUOVE a risposta multipla, diverse tra loro, che verifichino la comprensione (non la memoria di una frase). Regole:\n'
      + '- 5 opzioni; la corretta è SEMPRE la prima (o[0]); una sola opzione corretta, senza ambiguità;\n'
      + '- ogni distrattore nasce da un errore preciso e plausibile; la corretta NON deve essere più lunga dei distrattori;\n'
      + '- niente «tutte le precedenti», «nessuna delle precedenti», niente doppie negazioni;\n'
      + '- ew: 4 testi, uno per distrattore nello stesso ordine di o[1..4], che spiegano perché è sbagliato;\n'
      + '- e: correzione passo-passo di 3-4 righe (cosa chiede; il concetto e dove si trova nel testo; il ragionamento; in sintesi la regola da ricordare);\n'
      + '- cit: la frase del testo di riferimento su cui si basa, copiata parola per parola;\n'
      + '- lv: uno tra Sbarramento, Applicativo, Trabocchetto.\n'
      + 'Formato: {"domande":[{"lv":"…","q":"…","o":["corretta","d1","d2","d3","d4"],"ew":["…","…","…","…"],"e":["…","…","…"],"cit":"…"}]}';
    return [{ role: 'system', content: sys }, { role: 'user', content: u }];
  }

  /** Esame alla cieca: restituisce per ogni domanda se il risolutore ha trovato la corretta senza ambiguità. */
  async function esame(dom: any[], mat: string, cit: string): Promise<{ ok: boolean; motivo: string }[]> {
    const L = 'ABCDE';
    const mesc = dom.map(d => { const ord = mescolaU([0, 1, 2, 3, 4]); return { ord, testo: d.q + '\n' + ord.map((k, i) => L[i] + ') ' + d.o[k]).join('\n') }; });
    const msgs = [
      { role: 'system', content: 'Sei un esperto di ' + mat + ' che controlla la qualità dei quiz. Rispondi solo con JSON valido.' },
      { role: 'user', content: 'Testo di riferimento:\n' + cit + '\n\nRisolvi ogni domanda. Per ciascuna indica la lettera giusta e se è ambigua (più di una opzione accettabile, nessuna corretta, o un dato sbagliato rispetto al testo).\n\n'
        + mesc.map((m, i) => 'DOMANDA ' + (i + 1) + '\n' + m.testo).join('\n\n')
        + '\n\nFormato: {"risposte":[{"n":1,"lettera":"A","ambigua":false,"motivo":"breve"}]}' },
    ];
    const j = await Spiega.chat(msgs, 0);
    const r: any[] = (j && j.risposte) || [];
    return mesc.map((m, i) => {
      const x = r.find(y => +y.n === i + 1) || r[i];
      if (!x) return { ok: false, motivo: 'non verificata' };
      const k = L.indexOf(String(x.lettera || '').trim().toUpperCase().charAt(0));
      if (x.ambigua) return { ok: false, motivo: 'ambigua: ' + (x.motivo || '') };
      if (k < 0 || m.ord[k] !== 0) return { ok: false, motivo: 'il controllo ha dato un\'altra risposta' };
      return { ok: true, motivo: '' };
    });
  }

  /** Genera e mette in coda le domande per una scheda. Ritorna quante sono entrate in coda e gli scarti. */
  async function genera(pk: PkStep, m: string, micro: string, s: SchedaS, passo: (t: string) => void = () => { /* niente */ }): Promise<{ inCoda: number; scarti: string[] }> {
    passo('Leggo la scheda…');
    const B = await Banca.scheda(pk, m, micro, s);
    const viste = new Set<string>(); const pezzi: string[] = [];
    for (const d of B.domande) for (const c of d.cit || []) { const t = (c.t || '').trim(); if (t && !viste.has(t)) { viste.add(t); pezzi.push('«' + t + '»' + (c.f ? ' (' + c.f + ')' : '')); } }
    let cit = ''; for (const p of pezzi) { if ((cit + p).length > 6000) break; cit += p + '\n'; }
    if (!cit) throw new Error('Questa scheda non ha citazioni del libro: non posso generare domande sicure.');
    const esistenti = B.domande.map(d => d.q).concat(proposte(s.id).map(p => p.campi.q || ''));
    const R = Regole.get();
    const cat = Object.values(R.categorie).map(c => '- ' + c.etichetta).join('\n');
    const mat = Spiega.materia(nomeMateria(m));
    passo('L\'AI scrive ' + N + ' domande…');
    const j = await Spiega.chat(promptGenera(s.titolo, mat, cit, esistenti, cat, N), 0.6);
    const grezze: any[] = (j && Array.isArray(j.domande)) ? j.domande : [];
    const scarti: string[] = []; const buone: any[] = [];
    for (const d of grezze) {
      if (d && typeof d.e === 'string') d.e = d.e.split('\n').filter(Boolean);
      const no = controlla(d, esistenti.concat(buone.map(b => b.q)));
      if (no) scarti.push(no); else buone.push(d);
    }
    if (buone.length) {
      passo('Controllo alla cieca…');
      const es = await esame(buone, mat, cit);
      let inCoda = 0;
      buone.forEach((d, i) => {
        if (!es[i].ok) { scarti.push(es[i].motivo); return; }
        const lunga = d.o[0].trim().length > Math.max(...d.o.slice(1).map((x: string) => x.trim().length));
        const campi: Partial<DomB> = { t: 'mcq', lv: ['Sbarramento', 'Applicativo', 'Trabocchetto'].includes(d.lv) ? d.lv : 'Applicativo', q: d.q.trim(), o: d.o.map((x: string) => x.trim()), ew: d.ew.map((x: string) => x.trim()), e: d.e.map((x: string) => String(x).trim()), cit: d.cit ? [{ t: String(d.cit).trim(), f: 'testo citato nella scheda' }] : [] };
        Stato.salva({ id: 'pq-' + hash(s.id + d.q), type: 'propq', updatedAt: 0, sk: s.id, titolo: s.titolo, campi, quando: new Date().toISOString(), avviso: lunga ? 'La risposta corretta è la più lunga: accorciala o allunga un distrattore.' : undefined } as PropQ, true);
        inCoda++;
      });
      return { inCoda, scarti };
    }
    return { inCoda: 0, scarti };
  }

  /** Scheda con il peggior rapporto errori (dai quiz nell'app; poi punteggio basso). */
  function piuDebole(): ReturnType<typeof tutteLeSchede>[number] | null {
    const agg = new Map<string, { n: number; ok: number }>();
    for (const r of QuizApp.stat()) { if (r.deleted || r.sk.startsWith('gen-')) continue; const a = agg.get(r.sk) || { n: 0, ok: 0 }; a.n += r.n; a.ok += r.ok; agg.set(r.sk, a); }
    let best: any = null, peggio = -1;
    for (const x of tutteLeSchede()) {
      if (x.pk.proprio) continue;
      const a = agg.get(x.s.id), p = Studio.prog(x.s.id);
      const err = a && a.n ? 1 - a.ok / a.n : p && p.punteggio != null ? 1 - p.punteggio / 100 : -1;
      if (err > peggio) { peggio = err; best = x; }
    }
    return peggio >= 0 ? best : null;
  }

  /** Avvia la generazione con avvisi e apre la coda. */
  async function avvia(pk: PkStep, m: string, micro: string, s: SchedaS): Promise<void> {
    if (!navigator.onLine) { avviso('Serve la connessione.'); return; }
    avviso('🤖 Genero domande nuove per «' + s.titolo + '»: ci vuole circa un minuto.', 6000);
    try {
      const r = await genera(pk, m, micro, s);
      const sc = r.scarti.length ? ' (' + r.scarti.length + ' scartate dai controlli)' : '';
      avviso(r.inCoda ? '✅ ' + r.inCoda + ' domande da approvare' + sc + '. Tocca per vederle.' : 'Nessuna domanda ha superato i controlli' + sc + '. Riprova.', 8000, r.inCoda ? () => coda(s.id) : undefined);
      disegna();
    } catch (e: any) { avviso(e.message || 'Errore', 7000); }
  }

  /** Coda «Da approvare». */
  function coda(sk?: string): void {
    const corpo = h('div.modulo');
    const f = foglio({ titolo: 'Domande AI da approvare', corpo });
    const disegnaCoda = () => {
      svuota(corpo);
      const xs = proposte(sk).sort((a, b) => a.quando.localeCompare(b.quando));
      if (!xs.length) { corpo.appendChild(h('div.tenue', null, 'Nessuna domanda in attesa.')); return; }
      corpo.appendChild(h('div.tenue.piccolo', null, xs.length + ' in attesa. La prima opzione è quella corretta. Approva solo quelle che ti sembrano giuste: entrano nella banca della scheda.'));
      for (const p of xs) {
        const d = p.campi;
        const qid = 'q-ai-' + p.id.slice(3);
        const approva = (campi: Partial<DomB>) => { Stato.salva({ id: 'mq-' + qid, type: 'modq', updatedAt: 0, qid, sk: p.sk, nuova: true, campi } as ModQ, true); Stato.elimina(p.id); };
        corpo.appendChild(h('div.gruppo.aig-voce', null,
          h('div.tenue.piccolo', null, p.titolo + ' · ' + (d.lv || '')),
          h('div.aig-q', null, d.q || ''),
          h('ol.aig-opz', null, (d.o || []).map((o, k) => h(k ? 'li' : 'li.aig-giusta', null, h('div', null, (k ? '' : '✓ ') + o), k && d.ew ? h('div.tenue.piccolo', null, d.ew[k - 1]) : null))),
          h('div.tenue.piccolo', null, (Array.isArray(d.e) ? d.e : [d.e]).join(' · ')),
          d.cit && d.cit[0] ? h('div.tenue.piccolo', null, 'Fonte: «' + d.cit[0].t + '»') : null,
          p.avviso ? h('div.qz-avviso', null, '⚠️ ' + p.avviso) : null,
          h('div.bottoni', null,
            h('button.btn', { onclick: () => { approva(d); avviso('Aggiunta alla scheda.'); disegnaCoda(); } }, '✅ Approva'),
            h('button.btn.neutro', { onclick: () => Editor.apri({ ...(d as DomB), id: qid, sk: p.sk, nuova: true }, p.sk, n => { if (n) { Stato.elimina(p.id); disegnaCoda(); } }) }, '✏️ Modifica'),
            h('button.btn.neutro', { onclick: () => { Stato.elimina(p.id); disegnaCoda(); } }, '🗑 Scarta'))));
      }
    };
    disegnaCoda();
    void f;
  }

  /** Riquadro in Studio → Errori. */
  function sezione(): HTMLElement {
    const n = proposte().length, x = piuDebole();
    return h('section.card', null, h('h2.card-titolo', null, '🤖 Domande nuove con l\'AI'),
      h('div.tenue.piccolo', null, 'L\'AI scrive domande dalle citazioni del libro, le controlla risolvendole alla cieca e le mette qui: entrano nei quiz solo se le approvi.'),
      h('div.bottoni', null,
        n ? h('button.btn', { onclick: () => coda() }, 'Da approvare (' + n + ')') : null,
        x ? h('button.btn.neutro', { onclick: () => avvia(x.pk, x.mat.m, x.mi.n, x.s) }, 'Genera per il punto più debole') : null),
      x ? h('div.tenue.piccolo', null, 'Punto più debole ora: ' + x.mi.n + ' · ' + x.s.titolo) : null);
  }

  return { genera, avvia, coda, sezione, controlla, esame, piuDebole, proposte };
})();
