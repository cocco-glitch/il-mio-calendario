# Constraints — il-mio-calendario

Ultima revisione: 2026-11-26 (motore unificato blocco 7: Concetti 24/24 (era 20), nuova soglia Copertura 16/16; vista «Padronanza per concetto» in Statistiche, correzione del concetto nell'editor, avvisi di Copertura nei piani AI; misure del pilota in `test/pilota-pagine.mjs`, fuori dalla suite). Precedente: 2026-11-26 (motore unificato blocco 6: Logica 128/128, FineQuiz 36/36, nuova soglia Concetti 20/20 con la copertura ≥ 60% sulla banca reale; snapshot dei prompt di Medicina rigenerati con l'ok dell'utente per il campo `concetto`). Precedente: 2026-11-26 (blocco 5: nuova soglia FineQuiz 28/28 ed E2E `finequiz`; carte dai quiz per domanda secondo `carteAuto`, riquadro «Consolida» nel risultato, appunto Cornell con `origine`). Precedente: 2026-11-26 (blocco 4: nuova soglia Motore 32/32; Studia ora nel chunk su richiesta, app.js 310.705 B gzip; sessione come record 'sessioneora' sincronizzato). Precedente: 2026-11-24 (P0.67-D: Logica 99, Contratto 61, Centro 61; il calendario usa la banca pronta per sessioni da 5/6/8, conserva il microstep e mostra `pronte/richieste`; quantità totale, micro-batch provider e formato storico da 18 restano separati, tutto a zero token). Precedente: P0.67-C (proposta/override e un lavoro persistente per microstep). Prima: P0.67-A/B (calcolo puro e adapter `UnitaAI`/`PianoV1`). Revisione BP6: 2026-11-19 (v0.57.0): Logica 72, E4 chiusa, CSP e budget dei tempi verificati da test.
Dettaglio delle voci A1–A27 citate sotto: rapporto di audit pre-BP6 (sezione S5 · T10).

Scelte di partenza:
- Nessuna dipendenza nuova: il progetto ha solo `typescript`; tutto gira con tsc, node, Python+Playwright già presenti.
- Il floor **blocca**; le soglie numeriche **bloccano** dove oggi passano, il resto è a cricchetto («non peggiorare»).
- Controllo veloce < 90 s a fine task; `tutti.sh` completo prima di ogni pubblicazione e in CI quando possibile.

## Floor (sempre, nessuna eccezione senza riga in «Eccezioni»)
- Nessuna nuova soppressione: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable` (oggi: 0).
- Nessun `catch {}` vuoto nel codice TS nuovo: almeno un `console.warn` o un avviso all'utente
  (gli script iniettati negli iframe, `07-cattura.ts:31`, `07-simulazioni.ts:78`, `07-studio.ts:291`, sono esclusi: vedi E1).
- Nessun test saltato o tolto senza motivo nel messaggio di commit (oggi saltato: solo `spiegazioni.py`, vedi E2).
- Nessun segreto nel sorgente (chiavi AI, token). La chiave API Google pubblica del Picker è ammessa (E3).
- Nessun dato personale di terzi nel sito pubblico (email in chiaro: 0 da v0.57, confronto su hash SHA-256).
- Questo file non si indebolisce nello stesso commit della modifica che falliva.

## Vincoli inviolabili (da CLAUDE.md, con il controllo che li verifica)
| Vincolo | Controllo | Quando |
|---|---|---|
| `schemaVersion` retrocompatibile | `test/v049_versione.py` | prima di pubblicare |
| Mai DELETE su Drive | `test/sync.py:104`, `v049_versione.py:115` | prima di pubblicare |
| Calendar: lettura solo `primary`, scrittura solo specchio | `test/fase4.py` + grep statico nella suite Node | prima di pubblicare |
| Isolamento account (record **e** localStorage, chiavi AI, allegati) | `test/secondo.py` + `test/v057_bp6.py` (cambio account) | prima di pubblicare |
| Id schede stabili | suite Node | ogni task |

## Soglie con numero
| Dimensione | Regola | Comando | Quando | Perché questo numero |
|---|---|---|---|---|
| Tipi | 0 errori | `npx tsc --noEmit` | ogni modifica | oggi 0 |
| Logica | 128/128 (il numero può solo salire) | `node 07-SUITE-TEST-FUNZIONALI-E-REGRESSIONE.mjs` | ogni task + deploy (A5) | v0.63.0: 94/94 (era 92 a v0.62.0); v0.64.0: 95/95 (runner aperte/codice); v0.64.3: ingresso UI P0-B; v0.64.4: qualità e innesto P0-C; v0.64.5: onboarding ospite in tre domande; P0.67-D: sessioni 5/6/8 dalla banca pronta con microstep stabile; motore unificato blocchi 3/1/2: FSRS unico, TestoPdf, IndicePagine (τ tarato sul pilota); blocco 6: finestraFinale e criterio 0 L1/L2 in D−7…D−1 su 3 piani |
| Contratto AI | 61/61 (può solo salire) | `node test/contratto.mjs` (ultima riga «Contratto N/N») | ogni modifica a `src/su-richiesta/` o all'import | v0.61.0: lettore, adapter, validatore, mappa pagine, pacchetti; v0.62.0: +dossier nel master prompt; v0.63.0: +prompt Piano e Schede; v0.64.0: profili AI, parti k/N, tipi per archetipo; v0.64.2: coda P0-A; v0.64.3: runner P0-B; v0.64.4: qualità/correzione/innesto P0-C; quiz P1: prova immediata delle sole pronte; P0.66: alias provider, fonte atomica e riallineamento locale gratuito delle citazioni; P0.67-C: un lavoro per microstep e micro-batch senza confine artificiale da 18 |
| Dossier studente | 21/21 (può solo salire) | `node test/dossier.mjs` (ultima riga «Dossier N/N») | ogni modifica a `07-dossier.ts` o alla raccolta in `07-strumentiquiz.ts` | v0.62.0: segnali, regole, controllo privacy; v0.64.0: aperte e codice fuori da illusioni e distrattori |
| Centro di creazione | 66/66 (può solo salire) | `node test/centro.mjs` (ultima riga «Centro N/N») | ogni modifica a `07-centro.ts`, alla chiusura o all'import a parti | v0.63.0: piano → schede/id e chiusura; v0.63.1: pagine per microstep e verifica citazioni; P0.67-A: quantità manuale/auto, tetto, tempo e stabilità; P0.67-B: adapter `UnitaAI`/`PianoV1` senza contaminazioni numeriche; motore unificato blocco 2: IndicePagine nel Centro (pagine trovate, terzo segnale dalle citazioni) |
| Motore di studio | 32/32 (può solo salire) | `node test/motore.mjs` (ultima riga «Motore N/N») | ogni modifica a `07-motorestudio.ts`, `07-studiaoraui.ts` o agli agganci di Studia ora | blocco 4: livelli 1–6 e spareggio, obiettivi breve/ordinaria/consolidamento, preferenze globali e per sessione, totale ≤ minuti con margine ≥ 10% (pause e richiamo), esclusi col motivo, varietà, durate apprese (EMA α 0,3 in [0,5; 2]), agganci in app.js |
| Fine quiz | 36/36 (può solo salire) | `node test/finequiz.mjs` (ultima riga «FineQuiz N/N») | ogni modifica a `07-finequiz.ts`, `07-finequizui.ts`, agli agganci in `Cattura.salva`/`QuizApp` o a `Carte.daErrori` | blocco 5: candidati per domanda (illusione → comparativa, errore, fortunata), preferenze mai/proponi/auto e metodi spenti, «Lascia decidere all'app» a regole, modello Cornell senza carte implicite, guardie sugli agganci; blocco 6: una carta per concetto, `unisci` (comparativa solo se il testo è intatto) |
| Concetti | 24/24 (può solo salire) | `node test/concetti.mjs` (ultima riga «Concetti N/N») | ogni modifica a `07-concetti.ts`, all'assegnazione, alla padronanza in `07-finequizui.ts`, alla vista `07-padronanzaui.ts` o all'editor della domanda | blocco 6: etichette dal `focus`, BM25 con margine 30% e ripiego dichiarato, padronanza FSRS `con:` (un passo al giorno, stati dell'audit §14, affidabilità < 3 domande), copertura ≥ 60% sulla banca reale (oggi 67,3%), generalità su una materia mai vista, padronanza solo dalle verifiche; blocco 7: riepilogo «N di M» (non verificati mai 0%), vista in sola lettura, correzione manuale del concetto (modq) che prevale. Precisione dell'assegnazione a mano: 83/100 (IC 95% ~74–89%) |
| Copertura | 16/16 (può solo salire) | `node test/copertura.mjs` (ultima riga «Copertura N/N») | ogni modifica a `07-copertura.ts` o all'aggancio in `07-pianiai.ts` | blocco 7: doppioni (concetti ≥ 0,5 e pagine ≥ 50%), ripetizioni didattiche, argomenti mancanti; solo avvisi; 0 doppioni sulla banca reale (217 schede); generalità su una materia mai vista |
| Profili AI | 22/22 (può solo salire) | `node test/profiliai.mjs` (ultima riga «Profili N/N») | ogni modifica a `07-profiliai.ts` o al prompt per piattaforma | v0.64.0: preset delle 6 piattaforme, parti k/N, mix dei tipi per archetipo, tetto del testo PDF |
| End-to-end | 0 falliti, saltati ≤ quelli in «Eccezioni» | `bash test/tutti.sh 2>&1 \| tail -n 35` (include `csp`, `v057_bp6`, `prestazioni`) | prima di pubblicare | v0.57: 44 ok, 1 saltato; P0.67-A: 61 ok, 0 falliti, 1 saltato |
| Dipendenze (esterno) | 0 vulnerabilità high+ | `npm audit --audit-level=high` | prima di pubblicare | oggi 0; unico controllo non scritto da noi |
| Build | `dist/sw.js` senza `__VERSIONE__`; `VERSIONE` ≠ quella pubblicata | test nuovo (A3, A8) | prima di pubblicare | il bug del SW è passato inosservato da Fase 1 |
| Peso | `app.js` ≤ 306 KB gzip; `removeComments: true` in `tsconfig.json` | `test/prestazioni.py` + suite Node | prima di pubblicare | v0.58.4: 283 KB (era 338 con i commenti); v0.59.2: 287 KB; P0.65: 302 KB, `strumenti-quiz.js` 82 KB gzip fuori da `app.js`; blocco 4: 310.705 B (−2.069 B: Studia ora nel chunk), chunk 98,8 KB; blocco 6 (gzip 9): 309.731 B (+748 B), chunk 106,0 KB; blocco 7: 310.247 B (+516 B), chunk 108,8 KB (a 1,2 KB dal tetto proposto di 110 KB) |
| Tempi (CPU 4×, 4.655 record) | unione < 500 · Oggi < 130 · Agenda < 230 · Mese < 350 · Errori < 450 · Statistiche < 350 · salvataggio su Oggi < 80 ms · primo disegno di Mese ed Errori < 200 ms (INP) | `test/prestazioni.py` con `ok()` | prima di pubblicare | ~1,5× il peggiore misurato in T6; 200 ms = soglia INP «buono» |
| Sicurezza | ogni `innerHTML` nuovo passa da `esc`/`md`/`htmlCarta`/`svgSicuro`; `getDocument` sempre con `isEvalSupported:false`; CSP senza `unsafe-eval`, `object-src 'none'`, `connect-src` senza jolly | grep nella suite Node + `test/v057_bp6.py` (XSS) + `test/csp.py` (unico test senza `bypass_csp`) | ogni task | T3-1/T3-2, A13 |
| Accessibilità minima | ogni controllo con nome accessibile (oggi 0 senza nome su 60); dialoghi chiudibili con Esc; testo ≥ 4,5:1 nei due temi | `read_page` nel browser integrato + test Playwright nuovo | fine task UI | WCAG 2.1 AA, T8 |

## Misurati, a cricchetto (non devono peggiorare)
| Metrica | Oggi | Direzione |
|---|---|---|
| `any` in `src/` e `src/su-richiesta/` (`as any` + `: any`) | 406 (v0.57; era 407) | non sale |
| Righe > 400 caratteri in `src/` (`awk 'length>400' src/*.ts src/su-richiesta/*.ts \| wc -l`) | 29 (v0.61.0; era 30 a v0.59.1) | non sale |
| Colori hex fuori dai token in `style.css` | 99 | non sale |
| `font-size` distinti | 24 | non sale; i nuovi usano i token `--fs-*`/`--fw-xs` |
| Contrasto accento tema scuro | 3,72:1 | sale fino a ≥ 4,5 (A9) |

## Eccezioni
| ID | Regola | Dove | Motivo | Scadenza |
|---|---|---|---|---|
| E1 | `catch {}` vuoto | stringhe di script iniettati negli iframe dei quiz | toppa localStorage dentro sandbox | nessuna (non è codice dell'app) |
| E2 | test saltato | `test/spiegazioni.py` | manca la fixture del quiz | 2027-02-17 (fixture in BP6, A18) |
| E3 | segreto nel sorgente | chiave API Google (`06-drive.ts:19`) | pubblica per natura; limitata in Cloud Console (A27) | rivedere 2027-02-17 |
| ~~E4~~ | dati di terzi | email in `06-drive.ts` | **chiusa in v0.57**: confronto su hash SHA-256 | — |

## Come si controlla l'asticella
A ogni revisione: `git diff` di questo file rispetto al punto di partenza del ramo; cercare `.skip`/`SALTATO` nuovi, test tolti,
`ok()` rimossi, soppressioni, soglie abbassate, eccezioni nuove non discusse. Stringere è silenzioso, allentare va detto.
