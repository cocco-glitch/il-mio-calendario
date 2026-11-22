// ============================================================
// 07-codaquizqualita.ts - P0-C: qualita per domanda/pacchetto, deduplica e innesto.
// La validazione e' locale. Solo le domande bocciate vanno alla correzione AI, massimo tre volte.
// ============================================================

interface EsitoValidazioneDomandaQuiz {
  id: string;
  domanda: DomAI;
  stato: 'pronta' | StatoQualitaDomandaQuiz;
  tentativi: number;
  motivi: string[];
  pagine: number[];
}

const CodaQuizQualita = (() => {
  const STOP = new Set(['alla', 'alle', 'anche', 'come', 'con', 'cosa', 'dalla', 'delle', 'dello', 'dove', 'nella', 'nelle', 'oltre', 'pagina', 'perche', 'quale', 'sono', 'sulla', 'sulle', 'viene']);
  const testo = (v: unknown) => typeof v === 'string' ? v.trim() : '';
  const nomeNorm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const parole = (s: string) => (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{4,}/g) || []).filter(x => !STOP.has(x));
  const firma = (q: DomAI) => parole(testo(q.domanda)).join(' ');
  function pagineCitate(q: DomAI): number[] {
    const out = new Set<number>(), s = [q.fonte, q.sourceRef, q.spiegazione].map(testo).join(' '), re = /(?:pagina|p\.?)[\s:]*(\d+)/gi;
    let m: RegExpExecArray | null; while ((m = re.exec(s))) out.add(Number(m[1]));
    return [...out].filter(n => n > 0).sort((a, b) => a - b);
  }
  function motivi(q: DomAI, pagine: PaginaSorgenteQuiz[], firme: Set<string>, ids: Set<string>): { motivi: string[]; pagine: number[] } {
    const id = testo(q.id) || '(senza id)', out: string[] = [], v = Validatore.valida([q]);
    for (const x of v.bloccanti.get(id) || []) out.push('Formato: ' + x);
    for (const p of v.qualita.filter(p => p.sev === 'err')) out.push('Didattica: ' + p.msg);
    const f = firma(q);
    if (!f || firme.has(f)) out.push('Deduplica: domanda uguale o quasi uguale a una già presente');
    if (ids.has(id)) out.push('Deduplica: ID già presente');
    const cit = pagineCitate(q), disponibili = new Map(pagine.map(p => [p.n, p.testo])), valide = cit.filter(n => disponibili.has(n));
    if (!valide.length) out.push('Fonte: manca una pagina presente nel micro-batch');
    else {
      const base = new Set(valide.flatMap(n => parole(disponibili.get(n) || ''))), qpar = new Set(parole([q.domanda, q.spiegazione, ...(Array.isArray(q.opzioni) ? q.opzioni : [])].map(String).join(' ')));
      let comuni = 0; qpar.forEach(x => { if (base.has(x)) comuni++; });
      if (comuni < 2) out.push('Fonte: la domanda non ha riscontro testuale sufficiente nelle pagine citate');
    }
    return { motivi: [...new Set(out)], pagine: valide };
  }
  function validaDomande(qs: DomAI[], pagine: PaginaSorgenteQuiz[], esistenti: DomAI[] = [], tentativi = 0): EsitoValidazioneDomandaQuiz[] {
    const firme = new Set(esistenti.map(firma).filter(Boolean)), ids = new Set(esistenti.map(q => testo(q.id)).filter(Boolean)), out: EsitoValidazioneDomandaQuiz[] = [];
    for (const q0 of qs) {
      const base: DomAI = { sottoStep: '', categoria: 'prioritaria', tipoItem: '', coppiaGemellaId: '', ...q0 };
      const q = (Validatore.ripara([base]).qs[0] || base) as DomAI, id = testo(q.id) || 'senza-id-' + (out.length + 1), r = motivi(q, pagine, firme, ids);
      const stato: EsitoValidazioneDomandaQuiz['stato'] = r.motivi.length ? (tentativi >= 3 ? 'da_rivedere' : 'da_correggere') : 'pronta';
      out.push({ id, domanda: q, stato, tentativi, motivi: r.motivi, pagine: r.pagine.length ? r.pagine : pagine.map(p => p.n) });
      firme.add(firma(q)); ids.add(id);
    }
    return out;
  }
  function rapporto(pronte: DomAI[], revisioni: RevisioneDomandaQuiz[], ora = Date.now()): RapportoQualitaCodaQuiz {
    const tutte = [...pronte, ...revisioni.map(r => r.domanda)], v = Validatore.valida(tutte);
    return { pronte: pronte.length, daCorreggere: revisioni.filter(r => r.stato === 'da_correggere').length,
      daRivedere: revisioni.filter(r => r.stato === 'da_rivedere').length,
      problemiPacchetto: v.insieme.map(p => p.msg), aggiornatoIl: ora };
  }
  function promptCorrezione(rs: RevisioneDomandaQuiz[], pagine: PaginaSorgenteQuiz[]): Array<{ role: string; content: string }> {
    const qs = rs.map(r => r.domanda), v = Validatore.valida(qs), problemi = [...v.qualita.filter(p => p.sev === 'err')];
    for (const r of rs) for (const m of r.motivi) problemi.push({ sev: 'err', id: r.id, msg: m } as ProblemaQ);
    const base = Validatore.promptCorrezione(qs, problemi), fonte = pagine.map(p => '\n--- PAGINA ' + p.n + ' ---\n' + p.testo).join('');
    return [{ role: 'system', content: 'Correggi solo le domande elencate. Restituisci esclusivamente un array JSON di patch con id e soli campi modificati. Non riscrivere domande pronte, non contare e non fare riepiloghi.' },
      { role: 'user', content: base + '\n\nOgni fonte/sourceRef deve essere "Pagina N" e la spiegazione deve citare [[Fonte, p. N]], usando solo le pagine seguenti.' + fonte }];
  }
  function applicaCorrezioni(rs: RevisioneDomandaQuiz[], risposta: unknown, pagine: PaginaSorgenteQuiz[], esistenti: DomAI[]): EsitoValidazioneDomandaQuiz[] {
    const letto = DiagnosiQuiz.leggiPatch(JSON.stringify(risposta)), patch = 'patch' in letto ? letto.patch : [];
    const applicate = DiagnosiQuiz.applicaPatch(rs.map(r => r.domanda), patch).qs as DomAI[], idsPatch = new Set(patch.map(p => testo(p.id)).filter(Boolean));
    const out: EsitoValidazioneDomandaQuiz[] = [], gia = esistenti.slice();
    rs.forEach((r, i) => {
      const tentativi = r.tentativi + 1, e = validaDomande([applicate[i] || r.domanda], pagine, gia, tentativi)[0];
      if (!idsPatch.has(r.id) && e.stato !== 'pronta') e.motivi = [...new Set(['Correzione: nessuna patch ricevuta per questa domanda', ...e.motivi])];
      out.push(e); if (e.stato === 'pronta') gia.push(e.domanda);
    });
    return out;
  }
  function pacchetto(l: LavoroQuiz): PacchettoDrive {
    const step0 = testo(l.specifica.step), m = /(\d+(?:\.\d+)*)\s*$/.exec(step0), sotto = m ? m[1] : '';
    if (!sotto) throw new Error('indica uno step numerico (per esempio 3.3) prima dell’innesto');
    const materia = testo(l.specifica.materia) || 'Materia';
    const codiceDato = testo(l.specifica.codiceMateria).toUpperCase().replace(/[^A-Z]/g, '');
    const materiaCorso = typeof Studio !== 'undefined' ? Studio.pkStep().flatMap(p => p.materie).find(m => nomeNorm(m.nome) === nomeNorm(materia)) : undefined;
    const codice = codiceDato || (materiaCorso ? materiaCorso.m : typeof materiaPerNome === 'function' ? materiaPerNome(materia) : materia.charAt(0).toUpperCase());
    const micro = testo(l.specifica.microstep) || sotto + '.1';
    const stepId = /[a-z]/i.test(step0) ? step0.toLowerCase().replace(/\s+/g, '-') : materia.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + sotto;
    return { meta: { materia, codiceMateria: codice, stepId, sottoStep: sotto, titolo: testo(l.specifica.argomento) || materia },
      quiz: (l.risultati || []).map(q => ({ ...q, sottoStep: testo(q.sottoStep) || micro })) as QuizDrive[] };
  }
  function innesta(l: LavoroQuiz): InnestoRec {
    if (l.account !== CodaQuiz.accountAttuale()) throw new Error('il lavoro appartiene a un altro account');
    if (l.stato !== 'completato') throw new Error('completa prima validazione e correzioni');
    if (!(l.risultati || []).length) throw new Error('non ci sono domande pronte da innestare');
    const p = pacchetto(l), t = ImportaDrive.traduci(p), d = ImportaDrive.proponi(t), sc = { corso: d.corsi[0].id, piano: d.piani[0].id, data: d.piani[0].data || ymd(oggi()) };
    return ImportaDrive.salva(t, sc, 'coda:' + l.id, { accumula: true, rapporto: Validatore.rapporto(p, { completo: true }) });
  }
  return { firma, pagineCitate, validaDomande, rapporto, promptCorrezione, applicaCorrezioni, pacchetto, innesta };
})();
