// =====================================================================
// 07-sezionispiegazione.ts — v0.59.2: divide la spiegazione lunga dei quiz (master prompt per Gemini) nelle sue sezioni
// COSA CHIEDE / CONCETTO E MECCANISMO / FORMULA / RISPOSTA ESATTA / PERCHÉ GLI ALTRI NO / IN SINTESI.
// Sta nel pacchetto principale perché la usa la correzione del quiz in app; la diagnostica (su richiesta) la riusa.
// =====================================================================
const RE_SEZ_SPIEGAZIONE = /(COSA CHIEDE|CONCETTO(?: E MECCANISMO|\/MECCANISMO)?|FORMULA|RISPOSTA ESATTA|PERCH[ÉE] GLI ALTRI NO|IN SINTESI)\s*:/;
/** Sezioni della spiegazione; il testo prima della prima etichetta ha etichetta ''. */
function sezioniSpiegazione(sp: string): Array<{ etichetta: string; testo: string }> {
  const parti = String(sp || '').split(new RegExp(RE_SEZ_SPIEGAZIONE.source, 'g'));
  const out: Array<{ etichetta: string; testo: string }> = [];
  if (parti[0].trim()) out.push({ etichetta: '', testo: parti[0].trim() });
  for (let i = 1; i < parti.length; i += 2) out.push({ etichetta: parti[i], testo: (parti[i + 1] || '').trim() });
  return out;
}

/** v0.59.2: gli strumenti dei quiz si caricano solo al primo uso (budget peso di CONSTRAINTS.md); il service worker li tiene in cache.
 *  Divisione del chunk (motore unificato): motore-studio.js = percorso di studio (Studia ora, fine quiz, concetti, padronanza,
 *  IndicePagine, Copertura), ≈ 20 KB gzip; strumenti-quiz.js = creazione (Centro, coda, prompt, validatore) e richiede il motore. */
const chunkInArrivo: { [file: string]: Promise<void> | undefined } = {};
function caricaChunk(file: string, pronto: () => boolean): Promise<void> {
  if (pronto()) return Promise.resolve();
  return chunkInArrivo[file] || (chunkInArrivo[file] = new Promise<void>((ok, ko) => {
    const s = document.createElement('script'); s.src = file + '?v=' + encodeURIComponent(VERSIONE);
    s.onload = () => ok();
    s.onerror = () => { delete chunkInArrivo[file]; s.remove(); ko(new Error('serve la connessione la prima volta')); };
    document.head.appendChild(s);
  }));
}
function caricaMotoreStudio(): Promise<void> { return caricaChunk('motore-studio.js', () => typeof StudiaOraUI !== 'undefined'); }
/** v0.61: attendibile (ImportaDrive.apri usa il Validatore unico che sta lì). Carica prima il motore (IndicePagine). */
function caricaStrumentiQuiz(): Promise<void> {
  return caricaMotoreStudio().then(() => caricaChunk('strumenti-quiz.js', () => typeof StrumentiQuiz !== 'undefined'));
}
function conStrumentiQuiz(fn: () => void): void {
  caricaStrumentiQuiz().then(fn, (e: Error) => avviso('⚠️ Strumenti quiz non disponibili: ' + e.message, 6000));
}
function conMotoreStudio(fn: () => void): void {
  caricaMotoreStudio().then(fn, (e: Error) => avviso('⚠️ Strumenti di studio non disponibili: ' + e.message, 6000));
}
