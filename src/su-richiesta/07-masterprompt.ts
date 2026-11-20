// =====================================================================
// 07-masterprompt.ts — v0.59.2 (formato quiz-v3 da v0.61): generatore di MASTER PROMPT per far creare i quiz a un'AI esterna (Gemini) — MODULO PURO
// Universale: parte dal master prompt di riferimento (schede da 18 domande, L1–L4, spiegazioni lunghe, consegna a 2 schede)
// e lo riempie con ciò che l'app sa già: materia/step/archetipo/modalità, materiale trovato su Drive, leggibilità dei PDF
// (indice di lettura misurato con pdf.js), scostamento pagina PDF ↔ pagina stampata, ID già usati, punti deboli dello studente.
// v0.61 «Contratto AI»: l'AI scrive SOLO il contenuto (formato quiz-v3: giusta in opzioni[0], livelli dalla sequenza fissa, gemelle «G1»);
// ID, posizioni dell'esatta, conteggi e controlli li fa l'app. Niente più «ricavalo tu» per lo scostamento pagine.
// Nessun DOM e nessuna rete: la raccolta dei dati è in 07-strumentiquiz.ts. Testato nella suite Node.
// =====================================================================
interface LetturaPdfMP { campione: number; leggibili: number; pct: number; media: number; giudizio: 'testo pieno' | 'parziale' | 'scansione'; }
interface LibroMP { nome: string; pdf: string[]; lettura?: LetturaPdfMP | null; offset?: number | null; segmenti?: boolean; mappa?: MappaPag | null; }
/** Una scheda da chiedere all'AI nel passo «Quiz» (v0.63). */
interface SchedaPromptMP { n: number; sigla?: string; micro: string[]; categoria: 'prioritaria' | 'raffinamento'; blocco?: string; }
interface OpzMP {
  materia: string; codice: string; step: string; titolo?: string; unita?: string; data?: string;
  archetipo?: string; etichettaArchetipo?: string; tono?: string; intensita?: 'leggera' | 'standard' | 'intensa';
  perMessaggio?: 1 | 2; gem?: boolean;
  libri?: LibroMP[]; slide?: string[]; guide?: string[]; quizEsistenti?: string[]; vietati?: string[]; indici?: string[];
  idEsistenti?: string[]; puntiDeboli?: string[]; tabella?: string; note?: string;
  /** v0.62: regole già decise dal Dossier studente (07-dossier.ts); se presenti sostituiscono puntiDeboli. */
  dossier?: string[];
}

const MasterPrompt = (() => {
  // ---------- leggibilità dei PDF ----------
  /** Una pagina è «leggibile» se ha almeno 200 caratteri e soprattutto lettere (non solo simboli da OCR sporco). */
  function paginaLeggibile(t: string): boolean {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (s.length < 200) return false;
    const lettere = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return lettere / s.replace(/ /g, '').length >= 0.6;
  }
  /** Indice di lettura su un campione di pagine: % leggibili e giudizio. */
  function indiceLettura(testi: string[]): LetturaPdfMP {
    const campione = testi.length, leggibili = testi.filter(paginaLeggibile).length;
    const pct = campione ? Math.round(100 * leggibili / campione) : 0;
    const media = campione ? Math.round(testi.reduce((a, t) => a + String(t || '').trim().length, 0) / campione) : 0;
    return { campione, leggibili, pct, media, giudizio: pct >= 85 ? 'testo pieno' : pct >= 50 ? 'parziale' : 'scansione' };
  }
  /** Pagine da campionare (1-based), distribuite uniformemente, al massimo k. */
  function pagineCampione(totale: number, k = 24): number[] {
    if (totale <= k) return Array.from({ length: totale }, (_, i) => i + 1);
    const out = new Set<number>();
    for (let i = 0; i < k; i++) out.add(1 + Math.round(i * (totale - 1) / (k - 1)));
    return [...out];
  }
  /** «Fasano 301-350.pdf» → 301 (inizio del segmento), altrimenti null. */
  function segmentoDa(nome: string): number | null {
    const m = /(\d{1,4})\s*[-–_]\s*(\d{1,4})(?!.*\d{1,4}\s*[-–_]\s*\d)/.exec(String(nome || '').replace(/\.pdf$/i, ''));
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    return b > a ? a : null;
  }
  /** Nome del libro senza estensione, segmento e numeri di contorno: raggruppa i PDF a segmenti. */
  function nomeLibro(nome: string): string {
    return String(nome || '').replace(/\.pdf$/i, '').replace(/\d{1,4}\s*[-–_]\s*\d{1,4}/g, ' ').replace(/[\s_\-–()]+/g, ' ').trim() || String(nome || '');
  }
  /** Numero di pagina stampato in testa o in coda alla pagina (righe brevi), se c'è. */
  function numeroStampato(t: string): number[] {
    const righe = String(t || '').split(/\n+/).map(r => r.trim()).filter(Boolean);
    const bordi = righe.slice(0, 3).concat(righe.slice(-3)).filter(r => r.length <= 60);
    const out: number[] = [];
    for (const r of bordi) {
      const m = /^(\d{1,4})(?:\s|$)/.exec(r) || /(?:^|\s)(\d{1,4})$/.exec(r);
      if (m) out.push(Number(m[1]));
    }
    return out;
  }
  /** Scostamento costante «pagina PDF assoluta − pagina stampata» (moda dei voti); null se non è affidabile. */
  function stimaOffset(campioni: Array<{ pdf: number; testo: string }>): number | null {
    const voti = new Map<number, number>();
    for (const c of campioni) {
      const visti = new Set<number>();
      for (const n of numeroStampato(c.testo)) { const d = c.pdf - n; if (d >= 0 && d <= 60 && !visti.has(d)) { visti.add(d); voti.set(d, (voti.get(d) || 0) + 1); } }
    }
    let best: number | null = null, nb = 0;
    voti.forEach((v, d) => { if (v > nb || (v === nb && best !== null && d < best)) { best = d; nb = v; } });
    return best !== null && nb >= 3 && nb >= 0.3 * campioni.length ? best : null;
  }

  // ---------- ID e schede già esistenti ----------
  const slug = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '');
  /** Primo numero di domanda libero e prima scheda libera, dagli ID già usati (anche con prefisso q-drv-). */
  function prossimo(ids: string[], prefisso: string): { primo: number; scheda: number } {
    const re = new RegExp('(?:^|-)' + prefisso.replace(/[.]/g, '\\.') + '-(\\d{3})$');
    let max = 0;
    for (const id of ids) { const m = re.exec(String(id)); if (m) max = Math.max(max, Number(m[1])); }
    return { primo: max + 1, scheda: Math.ceil(max / 18) + 1 };
  }
  const RANGE_SCHEDE = { leggera: [10, 14], standard: [18, 25], intensa: [24, 30] } as const;
  /** Sequenza fissa dei livelli delle 18 domande di una scheda (5 L1, 6 L2, 4 L3, 3 L4 = quote 25/35/25/15): l'AI la segue, non conta. */
  const SEQUENZA_LIVELLI = [1, 1, 2, 1, 2, 2, 3, 1, 2, 3, 2, 4, 1, 3, 2, 4, 3, 4];
  /** Campi di una domanda quiz-v3 (tutto il resto lo aggiunge l'app). */
  const CHIAVI_V3 = ['livello', 'gemella', 'tipoItem', 'erroreTipico', 'domanda', 'opzioni', 'spiegazione', 'spiegazioneDistrattori', 'distractorTypes', 'fonte'];

  // ---------- regole per archetipo ----------
  function regolaArchetipo(arch: string, materia: string): string {
    const m = slug(materia);
    if (arch === 'stem_calcolo') return 'Q-E. Materia di calcolo: ogni scheda "Problemi su …" ha numeri che tornano; grafici (P–V, v–t, s–t, funzioni) descritti a parole; formula inversa e unità SI sempre esplicite.';
    if (arch === 'umanistico_storico') return 'Q-E. Materia umanistica: niente nozionismo di sole date; usa cause → eventi → conseguenze, confronti tra autori/correnti, passi di fonti da interpretare, cronologie relative.';
    if (arch === 'giuridico_economico') return 'Q-E. Materia giuridico-economica: regola + eccezione, casi pratici, articoli/norme citati con precisione; distrattori da norme vicine o eccezioni dimenticate.';
    if (arch === 'lingue_letteratura') return 'Q-E. Lingue/letteratura: grammatica e lessico SEMPRE in contesto (frasi intere), analisi di brevi passi; distrattori da falsi amici, accordi, tempi verbali.';
    if (arch === 'informatica_coding') return 'Q-E. Informatica: frammenti di codice brevi inline, «cosa stampa», complessità, casi limite; distrattori da off-by-one, tipi, precedenza degli operatori.';
    if (m.startsWith('biolog')) return 'Q-E. BIOLOGIA: niente domande su tabelle; usa strutture, processi, fasi, meccanismi, casi clinici.';
    if (m.startsWith('chimic') || m.startsWith('fisic')) return 'Q-E. ' + materia.toUpperCase() + ': dove serve, domande su grafici (P–V, v–t, curve di riscaldamento, energia di reazione) descritti a parole; problemi con numeri che tornano.';
    return 'Q-E. Scienze sperimentali: meccanismi, processi, esperimenti e casi clinici/applicativi; niente domande su tabelle da memorizzare.';
  }
  const conCalcoli = (arch: string, materia: string) => arch === 'stem_calcolo' || arch === 'informatica_coding' || /^(chimic|fisic)/.test(slug(materia));
  function registro(tono: string): string {
    if (tono === 'semplice_esempi') return 'Registro delle spiegazioni: semplice, frasi brevi, un esempio concreto per concetto.';
    if (tono === 'didattico_chiaro') return 'Registro delle spiegazioni: didattico e chiaro, termini tecnici spiegati alla prima occorrenza.';
    return 'Registro delle spiegazioni: tecnico-accademico, terminologia del manuale.';
  }

  // ---------- leggibilità → istruzioni ----------
  function rigaLibro(l: LibroMP): string {
    const segs = l.segmenti || l.pdf.some(p => segmentoDa(p) !== null);
    const parti = [' - ' + l.nome + ' (' + l.pdf.length + ' PDF' + (segs ? ' a segmenti: il numero nel nome è la pagina PDF assoluta di inizio' : '') + ').'];
    const tratti = l.mappa && l.mappa.tratti.length ? l.mappa.tratti : typeof l.offset === 'number' ? [{ pdfDa: l.offset + 1, pdfA: MappaPagine.APERTO, stampDa: 1 }] : [];
    if (tratti.length) parti.push('Pagine (misurate dall\'app): ' + tratti.map(t => {
      const fine = t.pdfA >= MappaPagine.APERTO ? '' : '–' + MappaPagine.aStampata({ fonte: 'mano', tratti: [t], affidabilita: 'esatta' }, t.pdfA);
      return 'stampate ' + t.stampDa + fine + ' = PDF ' + t.pdfDa + (fine ? '–' + t.pdfA : ' in poi');
    }).join('; ') + (segs ? '; dentro un segmento: pagina = PDF assoluta − inizio segmento + 1' : '') + '. Cita SEMPRE la pagina stampata.');
    else parti.push('Pagine stampate non misurate: nella citazione scrivi capitolo e paragrafo (es. [[Manuale, cap. 3, par. 3.2]]), senza numero di pagina.');
    const r = l.lettura;
    if (r) {
      parti.push('Indice di lettura ' + r.pct + '% (' + r.leggibili + '/' + r.campione + ' pagine campione con testo).');
      if (r.giudizio === 'parziale') parti.push('Alcune pagine sono immagini: cita SOLO pagine di cui hai letto un passaggio chiaro; per il resto usa slide o un\'altra pagina dello stesso argomento.');
      if (r.giudizio === 'scansione') parti.push('È una SCANSIONE senza testo: leggi le pagine come immagini e verifica a vista ogni pagina citata; se non ci riesci scrivi «BLOCCO: <libro, pagine>» invece di inventare.');
    }
    return parti.join(' ');
  }

  // ---------- costruzione: sezioni in comune ----------
  const SBARRA = '==========================================================';
  const sezione = (S: string[], t: string) => S.push('', SBARRA, t, SBARRA);
  const elenco = (xs: string[], max = 12) => xs.slice(0, max).map(x => '«' + x + '»').join(', ') + (xs.length > max ? ' e altri ' + (xs.length - max) : '');
  /** Dati di base comuni ai tre prompt. */
  function base(o: OpzMP) {
    const mat = String(o.materia || 'Materia').trim(), ms = slug(mat) || 'materia', cod = String(o.codice || mat.charAt(0)).toUpperCase();
    const step = String(o.step || '1.1').trim(), arch = o.archetipo || 'scienze_sperimentali';
    return { mat, ms, cod, step, pref: ms + '-' + step, ud: o.unita || 'UD' + step.split('.')[0], arch };
  }
  const RUOLO = 'Sei l\'architetto didattico e neuroscientifico dell\'app di studio «il-mio-calendario». Lavori in AUTONOMIA: nessuno allungherà o correggerà il tuo output a mano (un controllo automatico scarta ciò che non rispetta il formato). Quantità e qualità qui sotto sono obbligatorie. Tutto in italiano, niente chiacchiere.';
  const rigaMateria = (o: OpzMP) => { const b = base(o); return ' - Materia: ' + b.mat + ' (codice ' + b.cod + ', id in minuscolo «' + b.ms + '») · archetipo: ' + (o.etichettaArchetipo || b.arch) + '.'; };
  /** Dossier (o, in mancanza, punti deboli) e richieste dello studente, dentro il TARGET. */
  function righeStudente(o: OpzMP, classico = false): string[] {
    const S: string[] = [];
    if (o.dossier && o.dossier.length) S.push(' - Dossier dello studente (calcolato dall\'app sui suoi quiz, già deciso: ' + (classico ? 'applica queste regole senza ricalcolare nulla' : 'applica queste regole così come sono') + '):', ...o.dossier.map(r => '   • ' + r));
    else if (o.puntiDeboli && o.puntiDeboli.length) S.push(' - Punti deboli misurati dall\'app (risposte corrette < 60%): ' + o.puntiDeboli.join('; ') + '. Dedica a questi argomenti almeno una scheda in più, con più L3 (trabocchetti) e confutazioni molto esplicite.');
    if (o.note) S.push(' - Richieste dello studente: ' + o.note);
    return S;
  }
  const COMPATIBILITA = [
    ' - «📥 Importa quiz da Drive» legge i .json nelle cartelle che finiscono in «quiz»: domanda → testo, opzioni → 4 risposte (la corretta la scrivi SEMPRE in `opzioni[0]`, l\'app la sposta in una posizione bilanciata), ' +
      'spiegazione → correzione passo-passo divisa nelle sezioni COSA CHIEDE / CONCETTO E MECCANISMO / IN SINTESI, fonte → riferimento, livello (NUMERO 1–4) → livello di Bloom.',
    ' - L\'app MESCOLA le opzioni: per questo le confutazioni vanno in `spiegazioneDistrattori` (l\'app le mostra accanto all\'opzione scelta) e le lettere dentro `spiegazione` le riscrive l\'app dopo aver mescolato.',
    ' - «Allenamento Neuro»: certezza 1/2/3 dopo ogni risposta; sicuro+sbagliato = illusione di competenza → la domanda torna oggi in «Quiz da rifare» con la confutazione del distrattore scelto e il tuo `erroreTipico`.',
    ' - Interleaving per step e livello; coppie gemelle (`gemella`) e `distractorTypes` alimentano trabocchetti e statistiche.',
    ' - ID, step, sotto-step, posizione dell\'esatta, conteggi e controlli li fa l\'app: tu scrivi SOLO il contenuto. Reimportare aggiorna, non duplica.'];
  /** Le fonti da leggere (Fase 0), gli esclusi (da opz.vietati, lista modificabile) e la mappa delle pagine. */
  function fonti(o: OpzMP, intro: string): string[] {
    const { mat } = base(o), quiz = o.quizEsistenti || [], slide = o.slide || [], vietati = o.vietati || [], libri = o.libri || [];
    const S = [intro];
    let k = 1;
    if (quiz.length) S.push(' ' + (k++) + '. Quiz già esistenti (non duplicare argomenti già coperti): ' + elenco(quiz) + '.');
    else S.push(' ' + (k++) + '. La cartella «' + mat + ' quiz», se esiste, per sapere cosa è già coperto.');
    if (o.guide && o.guide.length) S.push(' ' + (k++) + '. Syllabus, programma e appelli d\'esame come MODELLO di stile, difficoltà e trabocchetti: ' + elenco(o.guide) + '.');
    if (slide.length) S.push(' ' + (k++) + '. Slide e dispense dei docenti: ' + elenco(slide) + '.');
    if (o.indici && o.indici.length) S.push(' ' + (k++) + '. Indici dei libri (per trovare capitoli e pagine): ' + elenco(o.indici) + '.');
    S.push(' ' + (k++) + '. Il libro di testo, solo le pagine dello step (le trovi dall\'indice).');
    if (vietati.length) S.push('VIETATO usare come fonte: ' + elenco(vietati) + ' (eserciziari commerciali).');
    S.push('Se un file non è apribile o un PDF è troncato: NON inventare. Scrivi «BLOCCO: <file/capitolo non leggibile>» e fermati.');
    if (libri.length) { S.push('', 'MAPPA LIBRI E PAGINE — misurata dall\'app:'); libri.forEach(l => S.push(rigaLibro(l))); }
    return S;
  }
  /** Regole di generazione di una scheda (Fase 2). `calcoli` = riga Q-G. */
  function regoleScheda(o: OpzMP, calcoli: string): string[] {
    const { mat, arch } = base(o);
    return [' - 1 SCHEDA = 18 domande a risposta multipla con ESATTAMENTE 4 opzioni; ogni scheda copre un solo microstep e contiene tutti e 4 i livelli.',
      ' - NON scrivere id, stepId, sottoStep, esatta, livelloCognitivo, sourceRef: li aggiunge l\'app.',
      '', 'LIVELLI — segui questa SEQUENZA per le 18 domande di ogni scheda (1ª, 2ª, … 18ª): ' + SEQUENZA_LIVELLI.join(', ') + '.',
      ' - 1 richiamo attivo · 2 applicazione · 3 trabocchetto (illusione di competenza) · 4 sintesi trasversale / caso.',
      ' - Coppie gemelle: due domande su concetti speculari, in schede diverse, con la stessa etichetta `"gemella": "G1"` (poi G2, G3…); circa 1 coppia ogni 3 schede.',
      ' - `erroreTipico` sempre valorizzato: l\'errore di ragionamento dietro il distrattore principale.',
      '', 'REGOLE DI QUALITÀ (il controllo automatico le verifica)',
      ' Q-A. La risposta corretta va SEMPRE in `opzioni[0]`: la posizione la sceglie l\'app.',
      ' Q-B. La corretta NON deve essere la più lunga: scrivila breve e allunga i distrattori.',
      ' Q-C. Distrattori plausibili, ognuno nato da un errore preciso; il testo della corretta non deve stare dentro un distrattore. Mai «tutte/nessuna delle precedenti».',
      ' Q-D. Nessun duplicato o quasi-duplicato, né nello step né rispetto a ciò che esiste già. Stile = appello vero.',
      ' ' + regolaArchetipo(arch, mat),
      ' Q-F. Italiano corretto; pedici/apici come `_{2}` e `^{2}`; risultati numerici semplici con unità SI.',
      calcoli,
      '', 'CAMPO `spiegazione` (lunga e completa, almeno un paragrafo pieno; nei calcoli tutti i passaggi), con queste etichette ESATTE in maiuscolo:',
      ' COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «testo» … PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]',
      ' Scrivi le lettere come se la corretta fosse A (cioè `opzioni[0]`): l\'app le riscrive dopo aver mescolato. La citazione [[…]] è uguale a `fonte`.',
      ' VIETATO «p. da verificare» o pagine inventate: se non hai letto la pagina, «BLOCCO: …» e non consegnare quella scheda.'];
  }
  const ESEMPIO = '{"scheda":"S01","categoria":"prioritaria","livello":1,"tipoItem":"richiamo_attivo_…","erroreTipico":"Scambiare … con …",' +
    '"domanda":"…?","opzioni":["risposta corretta, non la più lunga","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato"],' +
    '"spiegazione":"COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «…». PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]",' +
    '"spiegazioneDistrattori":["perché B è sbagliata …","perché C è sbagliata …","perché D è sbagliata …"],"distractorTypes":["confusione_…","inversione_…","caso_limite_…"],"fonte":"[[Manuale, p. X]]"}';
  const AUTOVERIFICA = [' [ ] Livelli nell\'ordine della sequenza; la corretta in opzioni[0], breve, non contenuta in un distrattore.',
    ' [ ] Ogni spiegazione ha le 5 etichette, è completa, ha RISPOSTA ESATTA: A) e la citazione [[…]] uguale a `fonte`.',
    ' [ ] JSON valido: doppi apici, nessuna virgola finale; nessuna pagina «da verificare».'];

  // ---------- prompt classico (tutto in una chat, con il file finale scritto dall'AI): resta così fino alla v0.64 ----------
  function costruisci(o: OpzMP): string {
    const { mat, ms, cod, step, pref, ud, arch } = base(o), [smin, smax] = RANGE_SCHEDE[o.intensita || 'standard'];
    const pm = o.perMessaggio === 1 ? 1 : 2, nx = prossimo(o.idEsistenti || [], pref);
    const blocchi = smax <= 14 ? '2–3' : '3–4', durata = smax <= 14 ? '~95–140' : '~185–190';
    const S: string[] = [];
    const sez = (t: string) => sezione(S, t);
    S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)',
      'Il TUO UNICO PRODOTTO sono blocchi ```json scritti qui in chat: le SCHEDE DI QUIZ e, alla fine dello step, il blocco di CHIUSURA (sotto-schede BRAC, ripassi, righe calendario). L\'app ricostruisce tutto da sola quando il file viene importato.',
      'NON PRODURRE MAI: teoria, riassunti, dispense, mappe, formulari, file (.docx/.pdf/.html…), mini-app. Se stai per scriverne, fermati e torna alle schede.',
      'Prima risposta: esegui subito la Fase 1 (tabella + righe calendario) e poi la prima consegna di schede, senza introduzioni.');
    S.push('', 'RUOLO', RUOLO, registro(o.tono || 'tecnico_accademico'));
    sez('TARGET (già compilato dall\'app)');
    S.push(rigaMateria(o),
      ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + ' · unità ' + ud + ' · data: ' + (o.data || 'da definire') + '.',
      ' - Schede: ' + smin + '–' + smax + ' (1 scheda = 18 domande) raggruppate in ' + blocchi + ' sotto-schede BRAC da 45–50 min (' + durata + ' min in tutto).',
      ' - Prima scheda: S' + String(nx.scheda).padStart(2, '0') + (nx.primo > 1 ? ' (le schede precedenti esistono già: non riscriverle)' : '') + '.');
    S.push(...righeStudente(o, true));
    sez('COMPATIBILITÀ CON L\'APP — COSA FA L\'APP DEI TUOI QUIZ');
    S.push(...COMPATIBILITA);
    sez('FASE 0 — ALLINEAMENTO (a ogni nuova chat)');
    S.push(...fonti(o, 'Leggi sul Drive collegato, in quest\'ordine:'));
    sez('FASE 1 — ANALISI AUTONOMA DELLO STEP (senza chiedere approvazione)');
    S.push(' P1. Analizza l\'argomento da syllabus, libro, slide e appelli.',
      ' P2. Stabilisci i MICROSTEP (' + step + '.1, ' + step + '.2, …) che coprono tutto lo step senza sovrapposizioni e senza duplicare ciò che esiste già.',
      ' P3. Per OGNI microstep decidi quante schede servono in base ai suoi ambiti: numero NON uniforme, minimo 2, 3–4 se ha molti ambiti.');
    if (conCalcoli(arch, mat)) S.push(' P4. Dove compare una formula, un rapporto o un calcolo: schede dedicate «Problemi su …» OLTRE a quelle teoriche.');
    S.push(' P5. Verifica la copertura di ogni microstep e riempi i buchi.',
      ' P6. Dividi le schede in PRIORITARIE (~70%) e RAFFINAMENTO (~30%).',
      ' Soglia obbligatoria: ' + smin + '–' + smax + ' schede in tutto. Raggruppa i microstep in ' + blocchi + ' SOTTOSCHEDE = blocchi BRAC da 45–50 min.',
      ' Output della Fase 1 (primo messaggio, poi procedi): a) righe calendario `' + cod + '|' + ud + '|ARGOMENTO|N|' + step + '|' + (o.data || 'da definire') + '`; b) tabella microstep → n. schede → prioritarie/raffinamento → pagine del libro → sotto-scheda; c) totale schede e domande.');
    sez('FASE 2 — GENERAZIONE A SCHEDE');
    S.push(...regoleScheda(o, ' Q-G. Ogni calcolo deve tornare: ricalcola e verifica l\'ordine di grandezza prima di consegnare.'));
    sez('FASE 3 — CONSEGNA (niente troncamenti)');
    S.push(' - Un messaggio = ' + (pm === 2 ? '2 schede (36 domande); se il limite di output tronca il JSON, scendi a 1 scheda' : '1 scheda (18 domande)') + '. MAI accorciare spiegazioni o ridurre domande.',
      ' - Formato di ogni messaggio:',
      '   1. `STEP ' + ms + ' ' + step + ' · SCHEDA <n>' + (pm === 2 ? ' e <n+1>' : '') + ' di <N> · microstep <x.y.z>`',
      '   2. UN SOLO blocco ```json valido (doppi apici, zero virgole finali, nessun commento): { "formato": "quiz-v3", "parte": "' + pref + '-s<n>' + (pm === 2 ? '-<n+1>' : '') + '", "quiz": [ … ] } con `"scheda": "S<n>"` e `"categoria": "prioritaria"|"raffinamento"` in ogni domanda',
      '      Campi di ogni domanda: ' + CHIAVI_V3.join(', ') + ' (gemella solo se fa parte di una coppia).',
      '      livello = NUMERO 1–4 dalla sequenza; spiegazioneDistrattori e distractorTypes = 3 stringhe ciascuno, per opzioni[1], [2], [3].',
      '   3. `STATO: schede consegnate X/N — prossimo: <microstep>. Scrivi "avanti".`',
      ' - Dopo «avanti» consegni le schede successive: niente riassunti né conferme.',
      ' - Ultimo messaggio dello step: blocco ```json di CHIUSURA:',
      '   { "meta": { "schemaVersion": 2, "materia": "' + mat + '", "codiceMateria": "' + cod + '", "unita": "' + ud + '", "stepId": "' + pref + '", "sottoStep": "' + step + '", "titolo": "…", "archetipo": "' + arch + '", "fonti": [ … ] },',
      '     "programmaCalendario": { "formatoGeneraMjs": [ "' + cod + '|' + ud + '|…|N|' + step + '|…" ], "pianoStrutturato": { "materiaCodice": "' + cod + '", "step": "' + step + '", "origine": "ai_neuro", "durataTotaleMin": N, "blocchiBRAC": N,',
      '       "sottoSchede": [ { "codice": "' + step + '.<k>", "titolo": "…", "microstep": ["…"], "durataMin": 45|50, "wakefulRestMin": 12, "schedePrioritarie": ["' + pref + '-S01"], "schedeRaffinamento": ["…"], "fonte": "[[Manuale, pp. …]]" } ],',
      '       "ancoraggiRipassoFSRS": [ { "intervallo": "+1g", "target": [ID scheda], "livello": "L3" }, { "intervallo": "+3g", "target": [ID scheda], "livello": "L3-L4" }, { "intervallo": "+7g", "target": [ID scheda], "livello": "Raffinamento" } ] } } }',
      '   Ogni scheda compare in esattamente una sotto-scheda. Il file si chiama `' + ms + '_' + step.replace(/\./g, '_') + '_quiz_e_calendario.json` e va nella cartella «' + mat + ' quiz».');
    if (o.tabella) { S.push(''); S.push(o.tabella); }
    if (o.gem) S.push('', 'Se le istruzioni del Gem chiedono id, esatta o conteggi (regole vecchie), valgono QUESTE: formato quiz-v3, giusta in opzioni[0].');
    sez('ESEMPIO DI FORMATO (non copiarne il contenuto: imita struttura e livello di dettaglio)');
    S.push(ESEMPIO);
    sez('AUTOVERIFICA PRIMA DI OGNI CONSEGNA');
    S.push(...AUTOVERIFICA, 'Non contare e non riepilogare: i conteggi e i controlli li fa l\'app. Parti ora dalla FASE 0.');
    return S.join('\n');
  }

  // ---------- v0.63 Centro di creazione: due prompt, l'AI scrive solo contenuto ----------
  /** Passo 2 «Piano»: Fase 0 + Fase 1. L'AI decide microstep e schede; numerazione, durata, ripassi e file finale li fa l'app. */
  function costruisciPiano(o: OpzMP): string {
    const { mat, step, arch } = base(o), [smin, smax] = RANGE_SCHEDE[o.intensita || 'standard'];
    const blocchi = smax <= 14 ? '2–3' : '3–4';
    const S: string[] = [];
    S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)',
      'Il TUO UNICO PRODOTTO è il PIANO dello step: UN SOLO blocco ```json in formato piano-v1 (oppure le righe @B / COPRE descritte sotto). Niente domande in questo messaggio: le schede le chiederà l\'app dopo, una alla volta.',
      'NON PRODURRE MAI: teoria, riassunti, tabelle di ore, date, righe di calendario, file. Rispondi subito con il piano, senza introduzioni.');
    S.push('', 'RUOLO', RUOLO);
    sezione(S, 'TARGET (già compilato dall\'app)');
    S.push(rigaMateria(o),
      ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + '.',
      ' - Schede: ' + smin + '–' + smax + ' in tutto (1 scheda = 18 domande, scritte dopo), raggruppate in ' + blocchi + ' blocchi di studio da 45–50 min.');
    S.push(...righeStudente(o));
    sezione(S, 'FASE 0 — ALLINEAMENTO');
    S.push(...fonti(o, 'Leggi sul Drive collegato, in quest\'ordine:'));
    sezione(S, 'FASE 1 — PIANO DELLO STEP (senza chiedere approvazione)');
    S.push(' P1. Analizza l\'argomento da syllabus, libro, slide e appelli.',
      ' P2. Stabilisci i MICROSTEP (' + step + '.1, ' + step + '.2, …) che coprono tutto lo step senza sovrapposizioni e senza duplicare ciò che esiste già.',
      ' P3. Per OGNI microstep decidi quante schede servono in base ai suoi ambiti: numero NON uniforme, minimo 2, 3–4 se ha molti ambiti.');
    if (conCalcoli(arch, mat)) S.push(' P4. Dove compare una formula, un rapporto o un calcolo: schede dedicate «Problemi su …» OLTRE a quelle teoriche.');
    S.push(' P5. Verifica la copertura di ogni microstep e riempi i buchi.',
      ' P6. Circa il 70% delle schede sono PRIORITARIE, il 30% di RAFFINAMENTO: metti quelle di raffinamento in un blocco a parte il cui titolo inizia con «Raffinamento».',
      ' P7. Raggruppa le schede in ' + blocchi + ' BLOCCHI da 45–50 min; numera le schede S1, S2, … nell\'ordine di studio (l\'app controlla e sistema la numerazione).');
    sezione(S, 'FORMATO DEL PIANO');
    S.push('JSON (preferito):',
      '{ "formato": "piano-v1", "blocchi": [ { "codice": "' + step + '", "titolo": "<argomento del blocco>", "copre": [ { "schede": ["S1", "S2"], "micro": ["' + step + '.1"] }, { "schede": ["S3"], "micro": ["' + step + '.2", "' + step + '.3"] } ] },',
      '  { "codice": "' + step + '", "titolo": "Raffinamento – <argomento>", "copre": [ { "schede": ["S9"], "micro": ["' + step + '.1"] } ] } ] }',
      'Oppure a righe (una riga @B per blocco, una COPRE per gruppo di schede):',
      '@B ' + step + ' | <argomento del blocco>',
      'COPRE S1 S2 | ' + step + '.1',
      'COPRE S3 | ' + step + '.2 ' + step + '.3',
      ' - Ogni scheda copre un solo microstep principale (il primo elencato) e compare una sola volta.',
      ' - Durata, ripassi, date e file finale li calcola l\'app dal piano: non scriverli.');
    return S.join('\n');
  }

  /** Passo 3 «Quiz»: le schede indicate (una o due), con sigle e nome della parte già decisi dall'app. */
  function costruisciSchede(o: OpzMP, schede: SchedaPromptMP[], pagine?: Record<string, PagineMicro | null>): string {
    const { ms, step, pref } = base(o), l = schede.slice().sort((a, b) => a.n - b.n);
    /** Pagine del microstep principale, calcolate dall'app (Centro.pagineMicrostep): l'AI non le ricava. */
    const pag = (x: SchedaPromptMP) => {
      const p = pagine && pagine[x.micro[0]];
      if (!p) return '';
      const pdf = p.pdfDa !== null ? ' (PDF ' + p.pdfDa + (p.pdfA !== null ? '–' + p.pdfA : ' in poi') + ')' : '';
      return ' · ' + (p.stampA !== null ? 'pagine ' + p.stampDa + '–' + p.stampA : 'pagine dalla ' + p.stampDa) + ' del libro' + pdf;
    };
    const conPagine = l.some(x => pag(x));
    const da = l.length ? l[0].n : 1, a = l.length ? l[l.length - 1].n : da;
    const parte = pref + '-s' + da + (a !== da ? '-' + a : ''), sigla = (x: SchedaPromptMP) => x.sigla || 'S' + String(x.n).padStart(2, '0');
    const S: string[] = [];
    S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)',
      'Il TUO UNICO PRODOTTO è UN SOLO blocco ```json con le SCHEDE DI QUIZ elencate qui sotto, e nient\'altro: niente piano, niente riepiloghi, niente file.',
      'NON PRODURRE MAI: teoria, riassunti, dispense, mappe, formulari, file (.docx/.pdf/.html…), mini-app.');
    S.push('', 'RUOLO', RUOLO, registro(o.tono || 'tecnico_accademico'));
    sezione(S, 'TARGET (già compilato dall\'app)');
    S.push(rigaMateria(o), ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + '.', ' - Schede da scrivere ora (' + l.length + ' × 18 domande):',
      ...l.map(x => '   • ' + sigla(x) + ' · microstep ' + x.micro.join(', ') + ' · ' + x.categoria + (x.blocco ? ' · blocco «' + x.blocco + '»' : '') + pag(x)));
    if (conPagine) S.push(' - Cita solo le pagine indicate per la scheda (numero stampato del libro); il PDF serve a trovarle.');
    S.push(...righeStudente(o));
    sezione(S, 'COMPATIBILITÀ CON L\'APP — COSA FA L\'APP DEI TUOI QUIZ');
    S.push(...COMPATIBILITA);
    sezione(S, 'FONTI');
    S.push(...fonti(o, 'Usa solo il materiale dello step, in quest\'ordine:'));
    sezione(S, 'FASE 2 — GENERAZIONE DELLE SCHEDE');
    S.push(...regoleScheda(o, ' Q-G. Ogni calcolo deve tornare: verifica risultato e ordine di grandezza prima di consegnare.'));
    sezione(S, 'CONSEGNA');
    S.push(' - Prima riga: `STEP ' + ms + ' ' + step + ' · ' + l.map(sigla).join(' e ') + '`.',
      ' - Poi UN SOLO blocco ```json valido (doppi apici, zero virgole finali, nessun commento):',
      '   { "formato": "quiz-v3", "parte": "' + parte + '", "quiz": [ … ] }',
      '   Ogni domanda ha `"scheda"` (' + l.map(x => '"' + sigla(x) + '"').join(' o ') + ') e `"categoria"` come nell\'elenco sopra.',
      '   Campi di ogni domanda: ' + CHIAVI_V3.join(', ') + ' (gemella solo se fa parte di una coppia).',
      '   livello = NUMERO 1–4 dalla sequenza; spiegazioneDistrattori e distractorTypes = 3 stringhe ciascuno, per opzioni[1], [2], [3].',
      ' - MAI accorciare spiegazioni o ridurre domande. Se il limite di output ti ferma, fermati dopo una domanda completa: l\'app ti chiederà il resto.');
    if (o.gem) S.push('', 'Se le istruzioni del Gem chiedono id, esatta o conteggi (regole vecchie), valgono QUESTE: formato quiz-v3, giusta in opzioni[0].');
    sezione(S, 'ESEMPIO DI FORMATO (non copiarne il contenuto: imita struttura e livello di dettaglio)');
    S.push(ESEMPIO);
    sezione(S, 'AUTOVERIFICA PRIMA DI CONSEGNARE');
    S.push(...AUTOVERIFICA, 'Numeri, posizioni e controlli li fa l\'app: non riepilogare. Parti ora con ' + sigla(l[0] || { n: 1, micro: [], categoria: 'prioritaria' }) + '.');
    return S.join('\n');
  }

  return { paginaLeggibile, indiceLettura, pagineCampione, segmentoDa, nomeLibro, numeroStampato, stimaOffset, slug, prossimo, RANGE_SCHEDE, SEQUENZA_LIVELLI, CHIAVI_V3, regolaArchetipo, costruisci, costruisciPiano, costruisciSchede };
})();
