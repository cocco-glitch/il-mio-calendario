// 07-dominio.ts — BP2 (v0.52): architettura multidominio universale e profili utente.
//
// 1. Profili cognitivi: 'owner' (il proprietario, Medicina → universita_concorsi) oppure 'ospite' (qualsiasi
//    altro account: cartella Drive pulita + Wizard di benvenuto). La modalità scelta è il record 'profilo'
//    (id fisso, porta `acc` come ogni record → mai unito tra account diversi; LWW tra dispositivi).
// 2. Sei archetipi disciplinari: ogni materia ne ha uno (record 'materia'.archetipo, oppure dedotto dal nome,
//    oppure la mappa storica F/C/B). Guidano catena AI, tono del tutor e diagnostica locale a zero token.
// 3. Pacchetti di scambio `.imcpack.json` (formato 'imcpack-v1'): programma + domande + flashcard, senza
//    alcun dato personale (niente statistiche, FSRS, chiavi, account). Le domande importate diventano
//    record 'bancaimc' (id 'bq-<id scheda>') letti da Banca.scheda; o[0] resta sempre la risposta giusta.
// 4. CreaPianoUniversale: indice del libro (testo, PDF o foto) + data d'esame → corso proprio con i
//    sotto-step distribuiti sui giorni entro il tetto giornaliero.
// 5. «100% senza AI»: senza alcuna chiave si nascondono solo i pulsanti AI; il resto funziona offline.
// Tutto additivo: nessun cambio di SCHEMA (record e campi nuovi facoltativi).

type RuoloAccount = 'owner' | 'ospite';
type ModalitaCognitiva = 'medie_biennio' | 'superiori_maturita' | 'universita_concorsi' | 'lifelong_pro';
interface ConfigProfiloUtente {
  ruolo: RuoloAccount;
  modalita: ModalitaCognitiva;
  ritenzioneTarget: number;
  dimensioneMicroLotto: number;
  mostraMetricheFSRS: boolean;
  attivaHypercorrection: boolean;
  tonoSpiegazioneAI: 'semplice_esempi' | 'didattico_chiaro' | 'tecnico_accademico';
}
const PRESET_COGNITIVI: Record<ModalitaCognitiva, Omit<ConfigProfiloUtente, 'ruolo'>> = {
  medie_biennio: { modalita: 'medie_biennio', ritenzioneTarget: 0.85, dimensioneMicroLotto: 5, mostraMetricheFSRS: false, attivaHypercorrection: false, tonoSpiegazioneAI: 'semplice_esempi' },
  superiori_maturita: { modalita: 'superiori_maturita', ritenzioneTarget: 0.88, dimensioneMicroLotto: 6, mostraMetricheFSRS: true, attivaHypercorrection: true, tonoSpiegazioneAI: 'didattico_chiaro' },
  universita_concorsi: { modalita: 'universita_concorsi', ritenzioneTarget: 0.90, dimensioneMicroLotto: 8, mostraMetricheFSRS: true, attivaHypercorrection: true, tonoSpiegazioneAI: 'tecnico_accademico' },
  lifelong_pro: { modalita: 'lifelong_pro', ritenzioneTarget: 0.86, dimensioneMicroLotto: 4, mostraMetricheFSRS: true, attivaHypercorrection: false, tonoSpiegazioneAI: 'didattico_chiaro' },
};
const NOMI_MODALITA: Record<ModalitaCognitiva, string> = {
  medie_biennio: '🎒 Medie / biennio (11-15 anni)', superiori_maturita: '📚 Superiori / maturità (16-19 anni)',
  universita_concorsi: '🎓 Università / concorsi', lifelong_pro: '💼 Adulti / professionisti',
};

type ArchetipoDisciplinare = 'stem_calcolo' | 'scienze_sperimentali' | 'umanistico_storico' | 'giuridico_economico' | 'lingue_letteratura' | 'informatica_coding';
type TipoDomandaUniversale = 'mcq' | 'fill' | 'sequenza' | 'abbinamento' | 'risposta_aperta_rubrica';
interface DefinizioneArchetipo {
  id: ArchetipoDisciplinare;
  etichetta: string;
  catenaProviderPreferita: string[];   // si usano solo i fornitori presenti nel gateway IA (gli altri si saltano)
  modelliConsigliati: string[];
  modalitaDomandaAbilitate: TipoDomandaUniversale[];
  pluginLocaleId: string;
}
const ARCHETIPI_DISCIPLINARI: Record<ArchetipoDisciplinare, DefinizioneArchetipo> = {
  stem_calcolo: { id: 'stem_calcolo', etichetta: 'STEM, Fisica & Calcolo', catenaProviderPreferita: ['groq', 'nvidia', 'gemini'],
    modelliConsigliati: ['openai/gpt-oss-120b', 'qwen/qwen3-32b', 'DeepSeek-R1-Distill-Llama-70B'], modalitaDomandaAbilitate: ['mcq', 'fill', 'sequenza'], pluginLocaleId: 'diagnosticaStemDimensionale' },
  scienze_sperimentali: { id: 'scienze_sperimentali', etichetta: 'Scienze Sperimentali & Mediche', catenaProviderPreferita: ['gemini', 'groq', 'cohere', 'github'],
    modelliConsigliati: ['gemini-2.5-flash', 'qwen/qwen3-32b', 'command-a-03-2025'], modalitaDomandaAbilitate: ['mcq', 'fill', 'abbinamento', 'sequenza'], pluginLocaleId: 'diagnosticaScienzeCompartimenti' },
  umanistico_storico: { id: 'umanistico_storico', etichetta: 'Storia, Filosofia & Scienze Umane', catenaProviderPreferita: ['cohere', 'gemini', 'github', 'groq', 'xkiro'],
    modelliConsigliati: ['command-a-03-2025', 'gemini-2.5-flash', 'gpt-4o'], modalitaDomandaAbilitate: ['mcq', 'sequenza', 'abbinamento', 'risposta_aperta_rubrica'], pluginLocaleId: 'diagnosticaCronologiaCausalita' },
  giuridico_economico: { id: 'giuridico_economico', etichetta: 'Diritto, Economia & Concorsi', catenaProviderPreferita: ['gemini', 'groq', 'xkiro', 'cohere', 'github'],
    modelliConsigliati: ['gemini-2.5-flash', 'moonshotai/kimi-k3-agent', 'command-a-03-2025'], modalitaDomandaAbilitate: ['mcq', 'fill', 'abbinamento'], pluginLocaleId: 'diagnosticaNormativaEccezioni' },
  lingue_letteratura: { id: 'lingue_letteratura', etichetta: 'Lingue Straniere & Letteratura', catenaProviderPreferita: ['groq', 'gemini', 'xkiro', 'cohere'],
    modelliConsigliati: ['moonshotai/kimi-k3-agent', 'llama-3.3-70b-versatile', 'gemini-2.5-flash'], modalitaDomandaAbilitate: ['fill', 'mcq', 'abbinamento', 'risposta_aperta_rubrica'], pluginLocaleId: 'diagnosticaMorfologiaLevenshtein' },
  informatica_coding: { id: 'informatica_coding', etichetta: 'Informatica, Coding & Sistemi', catenaProviderPreferita: ['groq', 'github', 'gemini'],
    modelliConsigliati: ['qwen/qwen3-32b', 'gpt-4o', 'gemini-2.5-flash'], modalitaDomandaAbilitate: ['mcq', 'fill', 'sequenza'], pluginLocaleId: 'diagnosticaSintassiAST' },
};
const ICONE_ARCHETIPO: Record<ArchetipoDisciplinare, string> = { stem_calcolo: '📐', scienze_sperimentali: '🧪', umanistico_storico: '🏛', giuridico_economico: '⚖️', lingue_letteratura: '🗣', informatica_coding: '💻' };
const eArchetipo = (x: any): x is ArchetipoDisciplinare => typeof x === 'string' && Object.prototype.hasOwnProperty.call(ARCHETIPI_DISCIPLINARI, x);

/** Regola di risoluzione: esplicito > mappa storica (F/C/B) > scienze_sperimentali. */
function risolviArchetipoMateria(codiceMateria: string, archetipoEsplicito?: ArchetipoDisciplinare): ArchetipoDisciplinare {
  if (archetipoEsplicito && eArchetipo(archetipoEsplicito)) return archetipoEsplicito;
  const mapStorica: Record<string, ArchetipoDisciplinare> = { F: 'stem_calcolo', C: 'scienze_sperimentali', B: 'scienze_sperimentali' };
  return mapStorica[String(codiceMateria || '').toUpperCase()] || 'scienze_sperimentali';
}

/** Schema universale di scambio (nei pacchetti): `t` = enunciato, `o[0]` = risposta corretta per mcq/fill. */
interface DomBUniversale {
  id: string; t: string; o: string[]; ew?: string[]; cl?: string; e?: string[]; cit?: string;
  diff?: 'Base' | 'Trabocchetto' | 'Problema';
  archetipo?: ArchetipoDisciplinare; tipoDomanda?: TipoDomandaUniversale;
  sequenzaOk?: string[]; coppieOk?: Array<[string, string]>; rubricaPunti?: string[]; linguaCodice?: string;
}
interface ImcPackExport {
  formato: 'imcpack-v1'; titolo: string; descrizione: string; archetipo: ArchetipoDisciplinare; livelloConsigliato: ModalitaCognitiva;
  autore?: string; dataCreazione: string;
  programma: Array<{ codiceStep: string; titolo: string; sottostep: Array<{ sk: string; titolo: string; oreStimate?: number }> }>;
  domande: Record<string, DomBUniversale[]>;
  flashcard: Array<{ sk: string; fronte: string; retro: string; tag?: string[] }>;
}
interface ProfiloRec extends Rec { type: 'profilo'; modalita: ModalitaCognitiva; benvenuto?: boolean; }
interface BancaImcRec extends Rec { type: 'bancaimc'; sk: string; pk: string; domande: DomB[]; }

const Dominio = (() => {
  const ID_PROFILO = 'profilo';
  const TIPI: TipoDomandaUniversale[] = ['mcq', 'fill', 'sequenza', 'abbinamento', 'risposta_aperta_rubrica'];
  const hash = (s: string) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };

  // ---------- §1 Ruolo e profilo cognitivo ----------
  const ruolo = (): RuoloAccount => Drive.eProprietario() ? 'owner' : 'ospite';
  /** Profilo attivo: preset della modalità scelta (record 'profilo'); senza scelta, owner → universita_concorsi. */
  function profilo(r: RuoloAccount = ruolo()): ConfigProfiloUtente {
    const rec = Stato.prendi<ProfiloRec>(ID_PROFILO);
    const mod: ModalitaCognitiva = rec && PRESET_COGNITIVI[rec.modalita] ? rec.modalita : r === 'owner' ? 'universita_concorsi' : 'superiori_maturita';
    return { ruolo: r, ...PRESET_COGNITIVI[mod] };
  }
  function impostaModalita(m: ModalitaCognitiva): void {
    if (!PRESET_COGNITIVI[m]) return;
    const r = Stato.prendi<ProfiloRec>(ID_PROFILO);
    Stato.salva({ ...(r || { id: ID_PROFILO, type: 'profilo', updatedAt: 0 }), modalita: m, benvenuto: true } as ProfiloRec);
  }
  /** Ritenzione FSRS desiderata: quella scelta a mano nelle impostazioni, altrimenti quella del profilo. */
  const ritenzioneProfilo = () => profilo().ritenzioneTarget;

  // ---------- §2 Archetipi ----------
  const REGOLE: [ArchetipoDisciplinare, RegExp][] = [
    ['informatica_coding', /informat|programm|coding|javascript|typescript|python|\bjava\b|\bsql\b|database|basi di dati|sistemi operativi|algoritm|software|reti di calc|sviluppo web/],
    ['lingue_letteratura', /ingles|frances|spagnol|tedesc|latin|grec[oa]|letteratur|italiano|lingu|grammatic|russo|cinese|giappones|portoghes|english|deutsch|espanol/],
    ['giuridico_economico', /diritt|legge|leggi|giurisp|economi|ragioner|aziend|contabil|finanz|concors|marketing|costituz|tribut|amministrativ/],
    ['umanistico_storico', /stori|filosof|pedagog|psicolog|sociolog|\barte\b|antropolog|geograf|religion|epica|musica/],
    ['stem_calcolo', /fisic|matemat|analisi|calcolo|geometr|algebra|statist|ingegner|meccanic|elettro|termodin|trigonom/],
    ['scienze_sperimentali', /chimic|biolog|anatom|fisiolog|biochim|genetic|medic|farmac|scienz|microbio|istolog|patolog|botanic|ecolog|infermier/],
  ];
  /** Deduce l'archetipo dal nome della materia (null se non si capisce). */
  function indovinaArchetipo(nome: string): ArchetipoDisciplinare | null {
    const t = norm(nome || '');
    for (const [a, re] of REGOLE) if (re.test(t)) return a;
    return null;
  }
  /** Archetipo di una materia: scelto nel record, altrimenti dedotto dal suo nome, infine predefinito. */
  function archetipoMateria(codice: string): ArchetipoDisciplinare {
    const r = Stato.prendi<MateriaRec>('mat-' + codice);
    if (r && eArchetipo(r.archetipo)) return r.archetipo;
    const ind = indovinaArchetipo(r ? r.nome : nomeMateria(codice));
    return ind || 'scienze_sperimentali';
  }
  function impostaArchetipo(codice: string, a: ArchetipoDisciplinare): void {
    const r = Stato.prendi<MateriaRec>('mat-' + codice), inf = infoMateria(codice);
    Stato.salva({ ...(r || { id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome: inf.nome, colore: inf.colore }), archetipo: a } as MateriaRec);
  }
  /** Ordine dei fornitori preferito dall'archetipo (solo nomi; il gateway tiene quelli che conosce). */
  const catenaPreferita = (a?: string): string[] => eArchetipo(a) ? ARCHETIPI_DISCIPLINARI[a].catenaProviderPreferita : [];

  const TONI: Record<ConfigProfiloUtente['tonoSpiegazioneAI'], string> = {
    semplice_esempi: 'Usa parole semplici, frasi brevi ed esempi della vita quotidiana, come per uno studente di 12-15 anni.',
    didattico_chiaro: 'Spiega in modo chiaro e ordinato, passo dopo passo, come un buon insegnante.',
    tecnico_accademico: 'Usa il lessico tecnico della disciplina con rigore accademico.',
  };
  const STILE_ARCH: Record<ArchetipoDisciplinare, string> = {
    stem_calcolo: 'Mostra i passaggi di calcolo con le unità di misura e controlla l\'ordine di grandezza.',
    scienze_sperimentali: 'Collega i concetti ai meccanismi (strutture, compartimenti, reazioni).',
    umanistico_storico: 'Contestualizza nel tempo (date, cause, conseguenze) e collega autori e correnti.',
    giuridico_economico: 'Cita la norma o il principio e segnala eccezioni e termini (salvo che, entro N giorni).',
    lingue_letteratura: 'Spiega la regola grammaticale o lessicale e dai un esempio d\'uso corretto.',
    informatica_coding: 'Ragiona sul codice riga per riga; segnala casi limite e errori off-by-one.',
  };
  /** Prompt del tutor: per il proprietario (Medicina) resta identico a prima; per gli altri dipende da archetipo e tono. */
  function promptTutor(materia: string, archetipo?: string): string {
    const p = profilo(), a = eArchetipo(archetipo) ? archetipo : null;
    if (p.ruolo === 'owner' && p.modalita === 'universita_concorsi' && (!a || a === 'stem_calcolo' || a === 'scienze_sperimentali'))
      return 'Sei un tutor di ' + materia + ' per il semestre filtro di Medicina. Rispondi in italiano corretto e semplice, rivolgendoti allo studente con il tu. ';
    return 'Sei un tutor di ' + materia + (a ? ' (' + ARCHETIPI_DISCIPLINARI[a].etichetta + ')' : '') + '. Rispondi in italiano corretto, rivolgendoti allo studente con il tu. '
      + TONI[p.tonoSpiegazioneAI] + ' ' + (a ? STILE_ARCH[a] + ' ' : '');
  }

  // ---------- §5 «100% senza AI» ----------
  function senzaAI(): boolean {
    try { const k = IA.tutteChiavi() as Record<string, string>; return !Object.keys(k).some(p => !!k[p]); } catch (_) { return true; }
  }

  // ---------- §4 Pacchetti .imcpack.json ----------
  const LV_DIFF: Record<string, string> = { Base: 'Sbarramento', Trabocchetto: 'Trabocchetto', Problema: 'Problema' };
  const DIFF_LV: Record<string, 'Base' | 'Trabocchetto' | 'Problema'> = { Sbarramento: 'Base', Trabocchetto: 'Trabocchetto', Problema: 'Problema' };
  const str = (x: any) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  const lista = (x: any): string[] => Array.isArray(x) ? x.map(str).filter(Boolean) : [];

  /** Converte una domanda del pacchetto (schema universale o DomB dell'app) in DomB; null se non è valida. */
  function normalizzaDomanda(x: any, sk: string, arch: ArchetipoDisciplinare, i = 0): DomB | null {
    if (!x || typeof x !== 'object') return null;
    const tipoT = TIPI.includes(x.t) ? x.t as TipoDomandaUniversale : null;
    const testo = str(x.q != null ? x.q : tipoT ? '' : x.t);
    let tipo: TipoDomandaUniversale = TIPI.includes(x.tipoDomanda) ? x.tipoDomanda : tipoT || (Array.isArray(x.a) && x.a.length ? 'fill' : Array.isArray(x.sequenzaOk) ? 'sequenza' : Array.isArray(x.coppieOk) ? 'abbinamento' : Array.isArray(x.rubricaPunti) ? 'risposta_aperta_rubrica' : 'mcq');
    if (!testo) return null;
    const d: DomB = { id: str(x.id) ? 'q-imc-' + hash(sk + '|' + str(x.id)) : 'q-imc-' + hash(sk + '|' + testo + '|' + i), sk, t: tipo, lv: LV_DIFF[x.diff] || str(x.lv) || 'Applicativo', q: testo,
      e: Array.isArray(x.e) ? lista(x.e) : str(x.e), archetipo: eArchetipo(x.archetipo) ? x.archetipo : arch };
    let o = lista(x.o);
    if (tipo === 'mcq') {
      // invariante: o[0] è la risposta corretta (se il pacchetto indica `c` = indice giusto, la sposto in testa)
      const c = Number.isInteger(x.c) && x.c > 0 && x.c < o.length ? x.c : 0;
      if (c) o = [o[c]].concat(o.filter((_, k) => k !== c));
      if (o.length < 2) return null;
      d.o = o; const ew = lista(x.ew); if (ew.length) d.ew = ew;
    } else if (tipo === 'fill') {
      const a = lista(x.a).length ? lista(x.a) : o.slice(0, 1); if (!a.length) return null;
      d.a = a; d.show = str(x.show) || a[0]; const ew = lista(x.ew); if (ew.length) d.ew = ew;
    } else if (tipo === 'sequenza') {
      const s = lista(x.sequenzaOk).length ? lista(x.sequenzaOk) : o; if (s.length < 2) return null;
      d.sequenzaOk = s; d.show = s.join(' → ');
    } else if (tipo === 'abbinamento') {
      const cp = (Array.isArray(x.coppieOk) ? x.coppieOk : []).filter((p: any) => Array.isArray(p) && str(p[0]) && str(p[1])).map((p: any) => [str(p[0]), str(p[1])] as [string, string]);
      if (cp.length < 2) return null;
      d.coppieOk = cp; d.show = cp.map((p: [string, string]) => p[0] + ' → ' + p[1]).join('; ');
    } else {
      const rp = lista(x.rubricaPunti); if (!rp.length) return null;
      d.rubricaPunti = rp; d.show = o[0] || 'Punti chiave: ' + rp.join(', ');
    }
    if (str(x.cl)) d.cl = str(x.cl);
    if (typeof x.cit === 'string' && x.cit.trim()) d.r = x.cit.trim();
    else if (Array.isArray(x.cit)) d.cit = x.cit.filter((c: any) => c && c.t).map((c: any) => ({ t: str(c.t), f: str(c.f), l: c.l ? str(c.l) : undefined }));
    if (str(x.r)) d.r = str(x.r);
    if (/^[A-Za-z][\w+#.-]{0,19}$/.test(str(x.linguaCodice))) d.linguaCodice = str(x.linguaCodice);   // v0.64: lingua («it», «en-GB») o linguaggio («python», «c++»)
    return d;
  }
  /** Controlla il formato; restituisce '' se va bene, altrimenti il motivo. */
  function valida(j: any): string {
    if (!j || typeof j !== 'object') return 'File non valido.';
    if (j.formato !== 'imcpack-v1') return 'Non è un pacchetto .imcpack (formato atteso: imcpack-v1).';
    if (!str(j.titolo)) return 'Il pacchetto non ha un titolo.';
    if (!j.domande || typeof j.domande !== 'object') return 'Il pacchetto non contiene domande.';
    if (j.programma != null && !Array.isArray(j.programma)) return 'Programma non valido.';
    return '';
  }
  /** Importa un pacchetto: corso proprio (materia con archetipo) + domande + flashcard. */
  function importa(j: any): { pk: PkStep; domande: number; scartate: number; carte: number } {
    const err = valida(j); if (err) throw new Error(err);
    const titolo = str(j.titolo), arch = eArchetipo(j.archetipo) ? j.archetipo as ArchetipoDisciplinare : indovinaArchetipo(titolo) || 'scienze_sperimentali';
    const idPk = 'imc-' + hash(norm(titolo));
    const vecchio = Studio.pkStep().find(p => p.id === idPk);
    const codice = vecchio && vecchio.materie[0] ? vecchio.materie[0].m : nuovoCodice(titolo);
    if (!Stato.prendi<MateriaRec>('mat-' + codice)) Stato.salva({ id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome: titolo, colore: coloreMateria(codice), archetipo: arch } as MateriaRec, true);
    // programma: dal pacchetto; le domande con sk fuori programma finiscono in un gruppo «Altro»
    const prog: { titolo: string; sottostep: { sk: string; titolo: string }[] }[] = (Array.isArray(j.programma) ? j.programma : []).map((g: any) => ({ titolo: str(g && g.titolo) || 'Parte', sottostep: (g && Array.isArray(g.sottostep) ? g.sottostep : []).filter((s: any) => s && str(s.sk)).map((s: any) => ({ sk: str(s.sk), titolo: str(s.titolo) || str(s.sk) })) }));
    const noti = new Set(prog.flatMap(g => g.sottostep.map(s => s.sk)));
    const extra = Object.keys(j.domande).filter(sk => !noti.has(sk));
    if (extra.length) prog.push({ titolo: 'Altro', sottostep: extra.map(sk => ({ sk, titolo: sk })) });
    const mat: MateriaS = { m: codice, nome: titolo, libro: '', sottostep: [] };
    let nd = 0, scart = 0;
    const nuoveSchede = new Set<string>();
    prog.forEach((g, i) => g.sottostep.forEach((s, k) => {
      const n = (i + 1) + '.' + (k + 1), micro = n + '.1', id = codice + '-' + micro + '-1';
      const vecchioSub = vecchio ? vecchio.materie[0] && vecchio.materie[0].sottostep.find(x => x.k === codice + n) : undefined;
      mat.sottostep.push({ k: codice + n, n, titolo: (g.titolo !== 'Altro' && g.sottostep.length > 1 ? g.titolo + ' · ' : '') + s.titolo, posizione: '', data: vecchioSub ? vecchioSub.data : undefined, svolto: vecchioSub ? vecchioSub.svolto : undefined,
        microstep: [{ n: micro, schede: [{ id, k: 1, n: 1, titolo: s.titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' }] }] });
      const grezze: any[] = Array.isArray(j.domande[s.sk]) ? j.domande[s.sk] : [];
      const dom = grezze.map((x, q) => normalizzaDomanda(x, id, arch, q)).filter(Boolean) as DomB[];
      scart += grezze.length - dom.length;
      if (dom.length) { Stato.salva({ id: 'bq-' + id, type: 'bancaimc', updatedAt: 0, sk: id, pk: idPk, domande: dom } as BancaImcRec, true); nd += dom.length; nuoveSchede.add(id); }
    }));
    // banche di una versione precedente del pacchetto non più presenti
    for (const r of Stato.tutti<BancaImcRec>('bancaimc')) if (r.pk === idPk && !nuoveSchede.has(r.sk)) Stato.elimina(r.id);
    const pk: PkStep = { tipo: 'step', id: idPk, step: vecchio ? vecchio.step : 1000 + Studio.pkStep().filter(p => p.proprio).length, titolo, aggiornato: ymd(new Date()), proprio: true,
      descrizione: str(j.descrizione) || undefined, risorse: { libri: {}, quiz: {} }, materie: [mat] };
    (pk as any).imc = { archetipo: arch, livello: PRESET_COGNITIVI[j.livelloConsigliato as ModalitaCognitiva] ? j.livelloConsigliato : undefined };
    salvaPacchetto(pk);
    // flashcard → un mazzo col nome del pacchetto (reimportare aggiorna le stesse carte, i ripassi restano)
    let nc = 0;
    const fc = (Array.isArray(j.flashcard) ? j.flashcard : []).filter((c: any) => c && str(c.fronte) && str(c.retro));
    if (fc.length) {
      const mz = Carte.mazzi().find(m => m.nome === titolo && !m.padre) || Carte.nuovoMazzo(titolo);
      nc = Carte.riempi(mz.id, fc.map((c: any) => ({ f: str(c.fronte), r: str(c.retro), tag: Array.isArray(c.tag) ? lista(c.tag).join(' ') : undefined })));
    }
    Stato.notifica();
    return { pk, domande: nd, scartate: scart, carte: nc };
  }
  /** Esporta un corso proprio come .imcpack: SOLO contenuti didattici (niente statistiche, FSRS, chiavi, account). */
  function esporta(pk: PkStep): ImcPackExport {
    const arch = ((pk as any).imc && eArchetipo((pk as any).imc.archetipo)) ? (pk as any).imc.archetipo : archetipoMateria(pk.materie[0] ? pk.materie[0].m : '');
    const out: ImcPackExport = { formato: 'imcpack-v1', titolo: pk.titolo, descrizione: pk.descrizione || '', archetipo: arch, livelloConsigliato: profilo().modalita, dataCreazione: ymd(new Date()), programma: [], domande: {}, flashcard: [] };
    for (const m of pk.materie) {
      const gruppi = new Map<string, { sk: string; titolo: string }[]>();
      for (const s of m.sottostep) {
        const g = s.n.split('.')[0] || '1'; if (!gruppi.has(g)) gruppi.set(g, []);
        for (const mi of s.microstep) for (const sc of mi.schede) {
          gruppi.get(g)!.push({ sk: sc.id, titolo: sc.titolo || s.titolo });
          const dom = domandeDi(sc.id); if (dom && dom.length) out.domande[sc.id] = dom.map(universale);
        }
      }
      for (const [g, ss] of gruppi) out.programma.push({ codiceStep: (pk.materie.length > 1 ? m.m : '') + g, titolo: m.nome + ' · ' + g, sottostep: ss });
    }
    const mz = Carte.mazzi().find(x => x.nome === pk.titolo && !x.padre);
    if (mz) out.flashcard = Carte.carteDi(mz.id).map(c => ({ sk: '', fronte: c.f, retro: c.r, tag: c.tag ? c.tag.split(/\s+/) : undefined }));
    return out;
  }
  /** DomB dell'app → schema universale (o[0] corretta; per fill o[0] = risposta). */
  function universale(d: DomB): DomBUniversale {
    const tipo = (d.t || 'mcq') as TipoDomandaUniversale;
    const u: DomBUniversale = { id: d.id, t: d.q, o: tipo === 'mcq' ? (d.o || []).slice() : tipo === 'fill' ? (d.a || []).slice() : tipo === 'sequenza' ? (d.sequenzaOk || []).slice() : [], tipoDomanda: tipo };
    if (d.ew) u.ew = d.ew.slice(); if (d.cl) u.cl = d.cl;
    const e = Array.isArray(d.e) ? d.e : d.e ? [d.e] : []; if (e.length) u.e = e;
    if (d.r) u.cit = d.r; if (DIFF_LV[d.lv]) u.diff = DIFF_LV[d.lv];
    if (d.archetipo && eArchetipo(d.archetipo)) u.archetipo = d.archetipo;
    if (d.sequenzaOk) u.sequenzaOk = d.sequenzaOk.slice(); if (d.coppieOk) u.coppieOk = d.coppieOk.map(p => [p[0], p[1]] as [string, string]);
    if (d.rubricaPunti) u.rubricaPunti = d.rubricaPunti.slice(); if (d.linguaCodice) u.linguaCodice = d.linguaCodice;
    return u;
  }
  /** Domande importate di una scheda (null se non ce ne sono). */
  function domandeDi(sk: string): DomB[] | null { const r = Stato.prendi<BancaImcRec>('bq-' + sk); return r && Array.isArray(r.domande) && r.domande.length ? r.domande : null; }
  const haDomande = (sk: string) => !!domandeDi(sk);

  function scegliFile(accetta: string): Promise<File | null> {
    return new Promise(ok => {
      const i = h('input', { type: 'file', accept: accetta, style: { display: 'none' } }) as HTMLInputElement;
      i.onchange = () => { ok(i.files && i.files[0] ? i.files[0] : null); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  async function importaDaFile(): Promise<void> {
    const f = await scegliFile('.json,.imcpack,application/json'); if (!f) return;
    try {
      const r = importa(JsonAI.leggiFile(await f.text()));
      avviso('📦 «' + r.pk.titolo + '» importato: ' + r.domande + ' domande' + (r.carte ? ', ' + r.carte + ' flashcard' : '') + (r.scartate ? ' (' + r.scartate + ' scartate perché incomplete)' : '') + '. Lo trovi in Studio.', 7000);
    } catch (e: any) { avviso('Pacchetto: ' + (e.message || e), 6000); }
  }
  function scaricaPacchetto(pk: PkStep): void {
    const j = esporta(pk);
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' })), download: (pk.titolo || 'pacchetto').replace(/[\\/:*?"<>|]+/g, '_') + '.imcpack.json' }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- §5 CreaPianoUniversale ----------
  interface Capitolo { num: string; titolo: string; pagina?: number; ore: number; data?: string; }
  /** Estrae i capitoli da un indice (righe «1.2 Titolo ..... 34», «Capitolo 3 – Titolo 51», «Titolo 12»). */
  function estraiCapitoli(testo: string): Capitolo[] {
    const out: Capitolo[] = [];
    for (const r0 of String(testo || '').split(/\r?\n/)) {
      const r = r0.replace(/\s+/g, ' ').trim(); if (r.length < 3 || r.length > 160) continue;
      if (/^(indice|sommario|contents|index)$/i.test(r)) continue;
      const m = /^(?:(?:cap(?:itolo)?|chapter|unit[àa]|modulo|lezione|parte)\.?\s*)?(\d{1,2}(?:\.\d{1,2}){0,2}|[IVXLC]{1,6})[.)]?\s*[-–—:]?\s+(.+?)(?:\s*\.{2,}\s*|\s+)?(\d{1,4})?$/i.exec(r);
      if (m && m[2] && /[a-zà-ü]/i.test(m[2])) { out.push({ num: m[1], titolo: m[2].replace(/[\s.·…_-]+$/, '').trim(), pagina: m[3] ? parseInt(m[3], 10) : undefined, ore: 0 }); continue; }
      const p = /^([A-Za-zÀ-ÿ][^\d]{2,}?)(?:\s*\.{2,}\s*|\s+)(\d{1,4})$/.exec(r);
      if (p) out.push({ num: String(out.length + 1), titolo: p[1].replace(/[\s.·…_-]+$/, '').trim(), pagina: parseInt(p[2], 10), ore: 0 });
    }
    // solo il livello più fine se ci sono sia capitoli che paragrafi (1, 1.1, 1.2 → 1.1, 1.2)
    const foglie = out.filter((c, i) => !(out[i + 1] && out[i + 1].num.startsWith(c.num + '.')));
    // ore stimate dalle pagine (circa 8 pagine all'ora, tra 0,5 e 6 ore), altrimenti 1,5 ore
    foglie.forEach((c, i) => {
      const succ = foglie.slice(i + 1).find(x => x.pagina != null), pp = c.pagina != null && succ && succ.pagina! > c.pagina ? succ.pagina! - c.pagina : 0;
      c.ore = pp ? Math.max(0.5, Math.min(6, Math.round(pp / 8 * 2) / 2)) : 1.5;
    });
    return foglie;
  }
  /** Distribuisce i capitoli da `inizio` al giorno prima dell'esame (lasciando gli ultimi giorni al ripasso),
   *  senza superare `oreGiorno` ore né il tetto di argomenti al giorno (come il generatore di piani: max 4). */
  function distribuisci(cap: Capitolo[], inizio: string, esame: string, oreGiorno: number, maxArg = 4): { capitoli: Capitolo[]; avvisi: string[] } {
    const avvisi: string[] = [];
    const g0 = daYmd(inizio), gE = daYmd(esame);
    const giorni = Math.round((gE.getTime() - g0.getTime()) / 864e5);
    if (giorni < 1) return { capitoli: cap, avvisi: ['La data dell\'esame deve essere dopo oggi.'] };
    const ripasso = giorni >= 7 ? Math.max(1, Math.floor(giorni * 0.15)) : 0, utili = Math.max(1, giorni - ripasso);
    const tot = cap.reduce((s, c) => s + c.ore, 0), capienza = utili * oreGiorno;
    const fatt = tot > capienza ? capienza / tot : 1;
    if (fatt < 1) avvisi.push('Il programma (' + Math.round(tot) + ' h) supera il tempo disponibile (' + Math.round(capienza) + ' h): ritmo compresso, valuta più ore al giorno.');
    let g = 0, usate = 0, n = 0;
    for (const c of cap) {
      const o = c.ore * fatt;
      if (n && (usate + o > oreGiorno + 1e-9 || n >= maxArg) && g < utili - 1) { g++; usate = 0; n = 0; }
      c.data = ymd(piuGiorni(g0, g)); usate += o; n++;
      if (usate >= oreGiorno - 1e-9 && g < utili - 1) { g++; usate = 0; n = 0; }
    }
    if (ripasso) avvisi.push('Ultimi ' + ripasso + (ripasso === 1 ? ' giorno lasciato' : ' giorni lasciati') + ' al ripasso.');
    return { capitoli: cap, avvisi };
  }
  /** Crea il corso proprio con i sotto-step datati (compaiono nel calendario, in Oggi e nei ritardi) e l'esame. */
  function creaPiano(o: { nome: string; testo: string; esame: string; oreGiorno: number; archetipo?: ArchetipoDisciplinare; inizio?: string }): { pk: PkStep; capitoli: Capitolo[]; avvisi: string[] } {
    const cap = estraiCapitoli(o.testo); if (!cap.length) throw new Error('Non trovo capitoli nell\'indice: una riga per capitolo, es. «1.2 Titolo .... 34».');
    const d = distribuisci(cap, o.inizio || ymd(new Date()), o.esame, Math.max(0.5, o.oreGiorno || 2));
    const nome = o.nome.trim() || 'Nuova materia';
    // v0.57 (A17): stesso nome di un corso proprio già creato → lo aggiorno invece di crearne un doppione
    const esiste = Studio.pkStep().find(p => p.proprio && p.titolo.trim().toLowerCase() === nome.toLowerCase() && p.materie.length === 1);
    const codice = esiste ? esiste.materie[0].m : nuovoCodice(nome);
    const arch = o.archetipo || indovinaArchetipo(nome) || 'scienze_sperimentali';
    Stato.salva({ id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome, colore: coloreMateria(codice), archetipo: arch } as MateriaRec, true);
    const mat: MateriaS = { m: codice, nome, libro: '', sottostep: d.capitoli.map((c, i) => {
      const n = '1.' + (i + 1);
      return { k: codice + n, n, titolo: c.titolo, posizione: c.pagina != null ? 'p. ' + c.pagina : '', data: c.data, microstep: [{ n: n + '.1', schede: [] }] } as SottoS;
    }) };
    const pk: PkStep = { tipo: 'step', id: esiste ? esiste.id : 'corso-' + uid().slice(0, 8), step: esiste ? esiste.step : 1000 + Studio.pkStep().filter(p => p.proprio).length, titolo: nome, aggiornato: ymd(new Date()), proprio: true,
      descrizione: 'Piano creato dall\'indice del libro (' + d.capitoli.length + ' argomenti, esame il ' + o.esame + ').', risorse: { libri: {}, quiz: {} }, materie: [mat] };
    (pk as any).imc = { archetipo: arch };
    salvaPacchetto(pk);
    const esameVecchio = Stato.tutti<any>('esame').find(e => e.nome === 'Esame di ' + nome);
    if (esameVecchio) { esameVecchio.data = o.esame; Stato.salva(esameVecchio); }
    else Stato.salva({ id: 'esame-' + uid().slice(0, 8), type: 'esame', updatedAt: 0, nome: 'Esame di ' + nome, data: o.esame } as Esame);
    return { pk, capitoli: d.capitoli, avvisi: d.avvisi };
  }
  async function testoDaPdf(f: File): Promise<string> {
    const L = await caricaPdfJs();
    const doc = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise, righe: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, 12); p++) {
      const c = await (await doc.getPage(p)).getTextContent(); let y: number | null = null, r = '';
      for (const it of c.items as any[]) { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { righe.push(r); r = ''; } r += (r && !r.endsWith(' ') ? ' ' : '') + it.str; y = yy; }
      if (r) righe.push(r);
    }
    return righe.join('\n');
  }
  const leggiImmagine = (f: File) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(new Error('immagine illeggibile')); r.readAsDataURL(f); });

  function wizardPiano(nomeIniziale = ''): void {
    const nome = h('input', { type: 'text', placeholder: 'Es. Storia contemporanea, Diritto privato…', value: nomeIniziale }) as HTMLInputElement;
    const arch = selettore([['', '✨ Deduci dal nome'] as [string, string]].concat(Object.values(ARCHETIPI_DISCIPLINARI).map(a => [a.id, ICONE_ARCHETIPO[a.id] + ' ' + a.etichetta] as [string, string])), '');
    const esame = h('input', { type: 'date', value: ymd(piuGiorni(new Date(), 30)) }) as HTMLInputElement;
    const ore = h('input', { type: 'number', min: '0.5', max: '10', step: '0.5', value: '2', inputMode: 'decimal' }) as HTMLInputElement;
    const indice = h('textarea', { rows: 8, placeholder: 'Incolla l\'indice del libro, una riga per capitolo:\n1 Introduzione ..... 1\n2 La cellula ..... 15\n2.1 Membrane ..... 18' }) as HTMLTextAreaElement;
    const anteprima = h('div.tenue.piccolo');
    const aggiorna = () => { const c = estraiCapitoli(indice.value); anteprima.textContent = c.length ? c.length + ' argomenti trovati · circa ' + c.reduce((s, x) => s + x.ore, 0) + ' h di studio' : 'Nessun capitolo riconosciuto per ora.'; };
    indice.addEventListener('input', aggiorna);
    const daPdf = h('button.btn.neutro', { onclick: async () => {
      const f = await scegliFile('application/pdf'); if (!f) return;
      try { indice.value = await testoDaPdf(f); aggiorna(); } catch (e: any) { avviso('PDF: ' + (e.message || e), 6000); }
    } }, '📄 Indice da PDF');
    const daFoto = senzaAI() ? null : h('button.btn.neutro', { onclick: async () => {
      const f = await scegliFile('image/*'); if (!f) return;
      avviso('Leggo la foto dell\'indice…');
      try { indice.value = await Spiega.vede('Trascrivi l\'indice del libro in questa foto: una riga per voce, nel formato «numero titolo pagina». Solo il testo, niente commenti.', await leggiImmagine(f)); aggiorna(); }
      catch (e: any) { avviso('Foto: ' + (e.message || e), 6000); }
    } }, '📷 Indice da foto (AI)');
    foglio({ titolo: '🗓 Crea piano dal libro', etichettaSalva: 'Crea',
      corpo: h('div.modulo', null,
        h('div.gruppo', null, riga('Materia', nome), riga('Tipo', arch), riga('Data esame', esame), riga('Ore al giorno', ore)),
        h('div.bottoni', null, daPdf, daFoto), indice, anteprima,
        h('div.tenue.piccolo', null, 'Gli argomenti vengono distribuiti fino al giorno prima dell\'esame (gli ultimi giorni restano per il ripasso), senza superare le ore al giorno né 4 argomenti al giorno.')),
      salva: () => {
        try {
          const r = creaPiano({ nome: nome.value, testo: indice.value, esame: esame.value, oreGiorno: parseFloat(ore.value) || 2, archetipo: eArchetipo(arch.value) ? arch.value : undefined });
          avviso('🗓 Piano «' + r.pk.titolo + '» creato: ' + r.capitoli.length + ' argomenti fino al ' + dataLunga(daYmd(esame.value)) + '. ' + r.avvisi.join(' '), 8000);
        } catch (e: any) { avviso(String(e.message || e), 6000); return false; }
      } });
  }

  // ---------- §1 Onboarding in 3 domande (solo ospiti, una volta) ----------
  let wizardAperto = false;
  const CHIAVE_ONBOARDING_SALTATO = 'imc-onboarding-saltato';
  const onboardingSaltato = (): boolean => { try { return localStorage.getItem(CHIAVE_ONBOARDING_SALTATO) === '1'; } catch (_) { return false; } };
  const segnaOnboardingSaltato = (v: boolean): void => { try { if (v) localStorage.setItem(CHIAVE_ONBOARDING_SALTATO, '1'); else localStorage.removeItem(CHIAVE_ONBOARDING_SALTATO); } catch (e) { console.warn('Onboarding: preferenza locale non disponibile', e); } };
  function serveBenvenuto(): boolean {
    if (navigator.webdriver || wizardAperto || ruolo() !== 'ospite' || onboardingSaltato()) return false;
    return !Stato.prendi<ProfiloRec>(ID_PROFILO);
  }
  async function benvenuto(forza = false): Promise<void> {
    if (ruolo() !== 'ospite' || (!forza && !serveBenvenuto())) return;
    if (forza) segnaOnboardingSaltato(false);
    wizardAperto = true;
    let passo = 0, completato = false, archetipoManuale = false;
    const modalita = selettore((Object.keys(NOMI_MODALITA) as ModalitaCognitiva[]).map(k => [k, NOMI_MODALITA[k]] as [string, string]), 'superiori_maturita');
    modalita.setAttribute('aria-label', 'Profilo di studio iniziale');
    const materia = h('input', { type: 'text', placeholder: 'Es. Diritto privato', autocomplete: 'off', 'aria-label': 'Prima materia' }) as HTMLInputElement;
    const data = h('input', { type: 'date', 'aria-label': 'Data esame facoltativa' }) as HTMLInputElement;
    const archetipo = selettore(Object.values(ARCHETIPI_DISCIPLINARI).map(a => [a.id, ICONE_ARCHETIPO[a.id] + ' ' + a.etichetta] as [string, string]), 'scienze_sperimentali');
    archetipo.setAttribute('aria-label', 'Tipo della materia');
    archetipo.addEventListener('change', () => { archetipoManuale = true; });
    materia.addEventListener('input', () => { const a = indovinaArchetipo(materia.value); if (a && !archetipoManuale) archetipo.value = a; });
    const ai = selettore([['', 'Nessuna per ora'], ['gemini', 'Gemini'], ['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['copilot', 'Copilot'], ['locale', 'AI locale']], '');
    ai.setAttribute('aria-label', 'AI usata per creare quiz');
    const progresso = h('p.piccolo.tenue', { 'aria-live': 'polite' });
    const zona = h('div.modulo');
    const indietro = h('button.btn.neutro', { type: 'button' }, 'Indietro') as HTMLButtonElement;
    const avanti = h('button.btn', { type: 'button' }, 'Avanti') as HTMLButtonElement;
    const salta = h('button.btn-testo', { type: 'button' }, 'Salta per ora') as HTMLButtonElement;
    const corpo = h('div', null, progresso, zona, h('div.bottoni', null, indietro, avanti), salta);
    let pannello: { chiudi: () => void };
    const mostra = () => {
      svuota(zona); progresso.textContent = 'Domanda ' + (passo + 1) + ' di 3'; indietro.style.visibility = passo ? 'visible' : 'hidden';
      if (passo === 0) zona.append(h('h3', null, 'Come studi?'), h('p.piccolo.tenue', null, 'Adatto ripassi, gruppi di domande e tono delle spiegazioni.'), riga('Livello', modalita));
      else if (passo === 1) zona.append(h('h3', null, 'Cosa studi?'), h('p.piccolo.tenue', null, 'La data è facoltativa. Potrai cambiare tutto in Altro → Studio e AI.'), riga('Materia', materia), riga('Tipo', archetipo), riga('Data esame', data));
      else zona.append(h('h3', null, 'Quale AI usi?'), h('p.piccolo.tenue', null, 'Serve solo per preparare prompt adatti alla piattaforma. Puoi scegliere “Nessuna”.'), riga('AI', ai));
      avanti.textContent = passo === 2 ? 'Completa' : 'Avanti';
      (passo === 0 ? modalita : passo === 1 ? materia : ai).focus();
    };
    indietro.onclick = () => { if (passo > 0) { passo--; mostra(); } };
    avanti.onclick = () => {
      if (passo === 1 && !materia.value.trim()) { avviso('Scrivi la materia che vuoi studiare.'); materia.focus(); return; }
      if (passo < 2) { passo++; mostra(); return; }
      const nome = materia.value.trim(), codice = materiaPerNome(nome), m = Stato.prendi<MateriaRec>('mat-' + codice);
      impostaModalita(modalita.value as ModalitaCognitiva);
      Stato.salva({ ...(m || { id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome, colore: coloreMateria(codice) }), nome, archetipo: archetipo.value } as MateriaRec);
      if (data.value) Stato.salva({ id: 'esame-onboarding-' + codice, type: 'esame', updatedAt: 0, nome: 'Esame di ' + nome, data: data.value, materie: [codice] } as Esame);
      if (ai.value) {
        const grandi = ['gemini', 'chatgpt', 'claude'].includes(ai.value), locale = ai.value === 'locale';
        Stato.salva({ id: 'profiloai', type: 'profiloai', updatedAt: 0, profilo: { id: ai.value, nome: ai.options[ai.selectedIndex].text,
          contesto: grandi ? 'grande' : locale ? 'piccolo' : 'medio', file: grandi, json: grandi ? 'alta' : locale ? 'bassa' : 'media',
          perRisposta: grandi ? 18 : locale ? 6 : 10, maxCaratteri: grandi ? 0 : locale ? 12000 : 40000 } } as ProfiloAIRec, true);
      }
      completato = true; segnaOnboardingSaltato(false); pannello.chiudi(); avviso('Configurazione completata. Ora puoi creare il primo quiz.');
      conStrumentiQuiz(() => CentroUI.apri());
    };
    salta.onclick = () => { segnaOnboardingSaltato(true); pannello.chiudi(); };
    pannello = foglio({ titolo: '👋 Configurazione iniziale', corpo, allaChiusura: () => { wizardAperto = false; if (!completato) segnaOnboardingSaltato(true); } });
    mostra();
  }

  // ---------- Impostazioni (Altro → Studio) ----------
  function codiciMaterie(): string[] {
    const s = new Set<string>([...Stato.tutti<MateriaRec>('materia').map(m => m.codice), ...Studio.pkStep().flatMap(p => p.materie.map(m => m.m))]);
    return Array.from(s).filter(Boolean);
  }
  function sezione(): HTMLElement {
    const p = profilo();
    const mod = selettore((Object.keys(NOMI_MODALITA) as ModalitaCognitiva[]).map(k => [k, NOMI_MODALITA[k]] as [string, string]), p.modalita, function () { impostaModalita(this.value as ModalitaCognitiva); avviso('Profilo aggiornato.'); });
    const opzArch = Object.values(ARCHETIPI_DISCIPLINARI).map(a => [a.id, ICONE_ARCHETIPO[a.id] + ' ' + a.etichetta] as [string, string]);
    const materie = codiciMaterie().map(c => riga(nomeMateria(c), selettore(opzArch, archetipoMateria(c), function () { impostaArchetipo(c, this.value as ArchetipoDisciplinare); })));
    const propri = Studio.pkStep().filter(x => x.proprio);
    return scheda('Profilo e materie',
      h('div.tenue.piccolo', null, p.ruolo === 'owner' ? '👑 Account proprietario: programma di Medicina e cartelle Chimica, Biologia, Fisica.' : '👤 Account personale: dati e cartella Drive separati.'),
      riga('Profilo di studio', mod),
      h('div.tenue.piccolo', null, 'Ritenzione FSRS ' + Math.round(p.ritenzioneTarget * 100) + '% · gruppi da ' + p.dimensioneMicroLotto + ' domande · spiegazioni ' + p.tonoSpiegazioneAI.replace('_', ' ')),
      materie.length ? h('div.gruppo', null, h('div.gruppo-titolo', null, 'Tipo di materia (guida AI e controlli senza AI)'), ...materie) : null,
      h('div.bottoni', null,
        h('button.btn.neutro', { onclick: () => scegliPiano() }, '＋ Crea piano'),
        h('button.btn.neutro', { onclick: () => importaDaFile() }, '📦 Importa .imcpack'),
        p.ruolo === 'ospite' ? h('button.btn.neutro', { onclick: () => benvenuto(true) }, 'Riapri configurazione iniziale') : null),
      propri.length ? h('div.chips', null, ...propri.map(x => h('button.chip', { onclick: () => scaricaPacchetto(x) }, '⬇ ' + x.titolo))) : null,
      senzaAI() ? h('div.tenue.piccolo', null, '🔌 Modalità 100% senza AI: calendario, ripassi FSRS, flashcard, pacchetti e controlli delle risposte funzionano senza chiavi.') : null);
  }

  return { ruolo, profilo, impostaModalita, ritenzioneProfilo, indovinaArchetipo, archetipoMateria, impostaArchetipo, catenaPreferita, promptTutor, senzaAI,
    normalizzaDomanda, valida, importa, esporta, universale, domandeDi, haDomande, importaDaFile, scaricaPacchetto,
    estraiCapitoli, distribuisci, creaPiano, wizardPiano, serveBenvenuto, benvenuto, sezione, NOMI_MODALITA };
})();
