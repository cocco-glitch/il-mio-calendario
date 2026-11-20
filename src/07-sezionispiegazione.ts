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

/** v0.59.2: «🧠 Prompt quiz per Gemini» e «🩺 Diagnostica quiz» stanno in strumenti-quiz.js, caricato solo al primo uso
 *  (≈ 22 KB gzip in meno per tutti, budget peso di CONSTRAINTS.md). Il service worker lo tiene in cache per l'offline. */
let strumentiQuizInArrivo: Promise<void> | null = null;
/** v0.61: attendibile (ImportaDrive.apri usa il Validatore unico che sta lì). */
function caricaStrumentiQuiz(): Promise<void> {
  if (typeof StrumentiQuiz !== 'undefined') return Promise.resolve();
  if (!strumentiQuizInArrivo) strumentiQuizInArrivo = new Promise<void>((ok, ko) => {
    const s = document.createElement('script'); s.src = 'strumenti-quiz.js?v=' + encodeURIComponent(VERSIONE);
    s.onload = () => ok();
    s.onerror = () => { strumentiQuizInArrivo = null; s.remove(); ko(new Error('serve la connessione la prima volta')); };
    document.head.appendChild(s);
  });
  return strumentiQuizInArrivo;
}
function conStrumentiQuiz(fn: () => void): void {
  caricaStrumentiQuiz().then(fn, (e: Error) => avviso('⚠️ Strumenti quiz non disponibili: ' + e.message, 6000));
}
