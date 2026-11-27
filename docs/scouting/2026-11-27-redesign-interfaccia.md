# Scouting — ristrutturazione grafica (HUD e frontend) (27/11/2026)

## Domanda
Richiesta dell'utente (27/11, dopo il rilascio v0.68.0): look moderno, interattivo e animato; pulsanti con animazioni; sfondo animato a pattern; transizioni tra pagine; tutto intuibile, con tutorial utili vicino ai pulsanti quando servono; togliere dall'interfaccia ciò che non serve (il codice resta, per riusarlo).
Per chi: uno studente in preparazione a un esame (oggi BIO/CHI/FIS, prima prova a D−13), sul telefono, spesso in sessioni lunghe.
Come capiremo che funziona: (1) ogni azione principale in ≤ 2 tocchi da Oggi; (2) nessun calo nei tempi di `test/prestazioni.py` (Oggi < 130 ms, INP < 200 ms); (3) contrasto ≥ 4,5:1 nei due temi (oggi l'accento scuro è 3,72:1); (4) colori fuori token 99 → ≤ 20 e `font-size` distinti 24 → ≤ 8 (cricchetti di CONSTRAINTS); (5) con «riduci movimento» nessuna animazione decorativa.

## Già nel progetto (critica degli screenshot a 375 px, due temi)
- **Aspetto da kit generico**: carte bianche identiche con lo stesso raggio e la stessa ombra, accento blu #6c8cff, font di sistema, etichette tutte maiuscole («VENERDÌ 27 NOVEMBRE», «IMPOSTAZIONI»). Il tema scuro è il chiaro invertito: nessuna identità.
- **Gerarchia**: in Studio ci sono 3 livelli di navigazione (5 schede + 4 chip + chip degli step) prima del contenuto; l'avviso «In ritardo di 29 step» è un muro di 29 codici dentro una macchia beige che domina la pagina.
- **Oggi**: la card «Adesso» ha una riga di stato densa («−13 giorni a Primo appello · indietro di 29 step»), il pulsante principale va a capo; i 3 riquadri «numero grande + etichetta» sono il trattamento predefinito.
- **Doppioni**: «+» in alto e pulsante tondo «+» in basso; Promemoria/Note sia in Altro sia altrove; «Drive non collegato» ripetuto.
- **Già pronto da riusare**: token di colore e tipografia (`--fs-*`), tema scuro con `data-tema`, effetto vetro (`data-vetro`, con `@supports`), 21 `@keyframes`, regola globale `prefers-reduced-motion`, icone SVG al posto delle emoji (04-simboli), test `vetro`/`csp`/`prestazioni`.
- Pesi: style.css 87,8 KB (18,9 KB gzip); app.js 304 KB gzip su 306 → **il JS nuovo deve stare in ~1,5 KB o in un chunk su richiesta**.

## Come lo fanno le app
| App | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
|---|---|---|---|---|
| Duolingo | animazioni legate allo STATO (streak, lezione finita, toast, FAB); personaggi animati con Rive | il movimento risponde a ciò che fai, non decora | richiede un motore (Rive) e un team di motion | Duolingo Design, Rive blog [C]; analisi Medium/Dev.to [D] |
| Notion / Structured | interfaccia calma, timeline visiva della giornata | poche scelte per schermata | curva di apprendimento (Notion) | recensioni ClickUp, Cal.com [D] |
| Forest | una sola metafora visiva (l'albero che cresce) durante la concentrazione | motivazione senza rumore | niente di documentato sul motion | roundup [D] |
| Web (Chrome, Safari 18, Firefox 144) | View Transitions API per le transizioni tra viste | nativa, 0 dipendenze, con ripiego automatico | i «types» e i gruppi annidati non ovunque | web.dev, developer.chrome.com, caniuse [C] |

## Cosa dice la ricerca
- **Dettagli seducenti**: informazioni o decorazioni interessanti ma non pertinenti peggiorano l'apprendimento — meta-analisi di 58 studi, 7.500+ studenti (Sundararajan & Adesope 2020) [A]; meta-analisi 2026 su 50 studi e 20.883 studenti: effetto negativo piccolo, dovuto al carico cognitivo estraneo [A]; un'animazione decorativa riduce il ricordo rispetto a un'immagine ferma (Pink & Newton 2020) [B]. → **Lo sfondo animato NON va nelle schermate in cui si studia** (quiz, lettura, flashcard): lì fermo e quasi invisibile.
- **Tutorial**: in uno studio NN/g (70 persone, 4 app) chi legge il tutorial iniziale non ha più successo (91% contro 94%) e trova i compiti più difficili; meglio aiuto contestuale «a richiesta», visibile ma non invadente, a ogni passo dei compiti multipli [C/B, studio di usabilità]. → **niente tour iniziale**: suggerimenti al primo uso di una funzione, accanto al pulsante, chiudibili e riapribili da «?».
- **Durata delle animazioni**: 100–500 ms; feedback semplice ~100 ms, cambio di schermata 200–300 ms, uscita più breve dell'entrata; l'errore comune è farle troppo lunghe (NN/g) [C, linea guida].
- **Movimento e accessibilità**: WCAG 2.1 2.3.3 (animazioni da interazione disattivabili) e `prefers-reduced-motion` [C, standard].

## Valutazione
| Opzione | Efficacia [livello] | Costo | Peso | Rischi |
|---|---|---|---|---|
| **A. Identità nuova + movimento legato alle azioni** (palette e font nuovi, pulsanti che rispondono al tocco, transizioni tra viste, sfondo vivo solo fuori dallo studio, aiuti contestuali, pulizia delle schermate) | movimento come feedback [C]; niente distrazioni dove si studia [A] | ~14–18 h in 5–6 sessioni | CSS +8–12 KB gzip; JS ≤ 1,5 KB in app.js + aiuti in un chunk; font locale ~40–60 KB (cache del SW) | molti selettori degli E2E da aggiornare; contrasto da rimisurare |
| B. Solo restyling (colori, font, pulsanti), senza sfondo né aiuti | parziale | ~6–8 h | CSS +4 KB | non risponde a «intuibile» e «tutorial» |
| C. Sfondo animato ovunque, anche nel quiz | **peggiora l'apprendimento** [A] | — | rAF continuo = batteria | contraddice la ricerca: sconsigliato |

## Proposta di design (A) — prima stesura e revisione
**Soggetto**: lo studio delle scienze per l'esame di Medicina. Il materiale del mondo: vetrino al microscopio, colorazioni istologiche, carta millimetrata del laboratorio.

**Colore (4–6 valori, da verificare a 4,5:1)**
- Vetro `#F2F4F6` (fondo chiaro, freddo, non crema) · Inchiostro `#1A1830` (testo)
- Ematossilina `#3D2C8D` (azione principale: viola-indaco, non il blu SaaS)
- Eosina `#C2185B` (attenzione/errore, non decorazione)
- Blu di metilene `#0E7C86` (successo/consolidato)
- Scuro «campo oscuro»: fondo `#0D0F1A`, ematossilina schiarita `#A99BFF`, eosina `#FF7AA8`.

**Tipografia**: una sola famiglia, **Atkinson Hyperlegible Next** (Braille Institute, progettata per distinguere i caratteri simili: l, I, 1, O, 0 → utile con formule e sigle), self-hosted in woff2, 2 pesi (400/700); scala modulare 1,25 su base 16 px (13 · 16 · 20 · 25 · 31): 5 dimensioni invece di 24. Niente etichette tutte maiuscole.

**Layout**: allineamento a sinistra; Oggi diventa una colonna con UNA azione dominante («Cosa faccio adesso») e il resto in righe compatte; Studio scende a un solo livello di schede; l'avviso «in ritardo» diventa una riga («29 step indietro» + «Ripianifica»), con l'elenco solo su richiesta.
```
┌──────────────────────────┐
│ Oggi · ven 27 nov    ?  ＋│
│ ┌──────────────────────┐ │
│ │ Adesso: Chimica 3.1  │ │  ← unica card in risalto (ematossilina)
│ │ 50 min · 18 domande  │ │
│ │ [  ▶ Inizia  ]       │ │  ← pulsante con risposta al tocco
│ └──────────────────────┘ │
│ D−13 1° appello · 29 step indietro › │
│ Impegni di oggi ……………… │
└──────────────────────────┘
   griglia millimetrata viva solo qui sotto (non nel quiz)
```

**Movimento (un solo «momento» forte, il resto risposta alle azioni)**
- Firma: lo **sfondo a griglia millimetrata** (pattern SVG in CSS) che, al tocco, accende un'onda di «cellule» sotto il dito per ~600 ms, come un vetrino colorato. Solo in Oggi/Calendario/Altro; fermo e al 3% di opacità in Studio, quiz, lettura; spento con «riduci movimento» e con la pagina nascosta.
- Pulsanti: pressione 100 ms (scala 0,97 + riempimento che parte dal punto toccato), rilascio 160 ms; stato di caricamento in place.
- Tra viste: View Transitions native (200–250 ms, scorrimento nella direzione della barra in basso); senza supporto il cambio è istantaneo come oggi.
- Esiti: risposta giusta/sbagliata e «scheda completata» con un'animazione breve legata all'esito (come Duolingo), mai in loop.

**Aiuti contestuali**: un «?» discreto accanto ai pulsanti chiave; al primo uso di una funzione un fumetto ancorato al pulsante (1 frase + «Ho capito»), mai più di uno per schermata, registro dei già visti per account; il testo è scritto dall'utente medio («Ripianifica sposta gli step indietro nei prossimi giorni liberi»).

**Togliere dall'interfaccia (codice conservato dietro un interruttore)**: inventario da fare schermata per schermata nel blocco 1; candidati dagli screenshot: «+» doppio, Promemoria/Note doppi in Altro, seconda riga di schede in Studio, elenco dei 29 step in ritardo sempre aperto, «Drive non collegato» ripetuto.

**Revisione contro i modelli generici**: la prima stesura aveva il blu attuale e le carte uguali → sostituiti da colori delle colorazioni istologiche e da UNA card in risalto per schermata; le cifre grandi con etichetta (trattamento predefinito) diventano una riga di testo; niente maiuscolo, niente numeri 01/02/03 (non è una sequenza).

## Piano e tattiche (blocchi verificabili)
1. **Fondamenta**: token nuovi (colore, tipo, raggio per gerarchia, durate e curve), font locale, due temi a 4,5:1; inventario di ciò che si nasconde (interruttore `UI.nascosti`, nessun codice cancellato). Test: contrasto automatico, cricchetti colori/font-size, `csp`, `prestazioni`.
2. **Pulsanti e transizioni**: componente pulsante con stati (riposo, premuto, caricamento, disattivo, fatto), View Transitions tra le viste. Test: E2E `vetro` riscritto, INP.
3. **Sfondo vivo**: griglia + onda al tocco, pausa nelle viste di studio, `reduced-motion`, nessun rAF a pagina nascosta. Test: CPU 4× in `prestazioni`.
4. **Schermate**: Oggi, Studio, Altro ristrutturati (gerarchia, una azione dominante). Test: E2E delle viste aggiornati.
5. **Aiuti contestuali**: modulo nel chunk su richiesta, testi, primo uso. Test: nuovo E2E `aiuti`, a11y (fumetto con `role=dialog` non modale, Esc chiude).
6. **Rifinitura**: design-critique e accessibility-review su screenshot, ux-copy dei testi.

## Decisioni per l'utente
1. Direzione visiva: **«Vetrino» (colorazioni istologiche + griglia millimetrata, consigliata)** o un'alternativa più neutra?
2. Font: **Atkinson Hyperlegible Next locale (~40–60 KB, consigliato)** o font di sistema (0 KB)?
3. Sfondo animato: **vivo solo fuori dalle schermate di studio (consigliato, per la ricerca [A])** o ovunque?
4. Aiuti: **al primo uso + «?» sempre disponibile (consigliato)** o solo «?» a richiesta?

**Decise dall'utente (27/11):** direzione **neutra e moderna** (non «Vetrino»: la parte sul laboratorio sopra resta solo come traccia della proposta) · Atkinson Hyperlegible Next locale · sfondo vivo solo fuori dalle schermate di studio · aiuti al primo uso + «?». Lo sfondo neutro sarà a puntini con risposta al tocco (blocco 3).

## Blocco 1 — fatto (27/11)
- Palette neutra nello strato v0.34 che vale davvero (chiaro #f5f5f4/#ffffff/#ededeb, testo #18191c, tenue #5c6069; scuro #111214/#1a1b1e/#24262a, testo #ecedef, tenue #a3a7ae); accento predefinito verde petrolio #0f6e78, migrazione dei due blu predefiniti; colori delle materie invariati.
- `--su-accento` calcolato (bianco o inchiostro col contrasto maggiore): corregge anche il testo bianco illeggibile sui pulsanti con accento giallo.
- Atkinson Hyperlegible Next 400/700 latin locale (24,8 KB, OFL in `public/font/OFL.txt`, nella cache del service worker), `--font` dell'utente sempre prioritario.
- Token nuovi: scala `--t-1…5`, durate `--dur-1…3`, curve, raggi `--r-s/m/l`; niente etichette in maiuscolo tracciato (13 tolte).
- Test `aspetto` (contrasto ≥ 4,5:1 di 10 coppie × 9 accenti × 2 temi, font, SW, licenza). Cricchetti: colori fuori token 99, `font-size` distinti 24 (invariati con il conteggio del 27/11).

## Blocco 2 — fatto (27/11)
- View Transitions solo dai tocchi della barra (`transizione()` in 09-main.ts), onda dal punto toccato con un ascoltatore delegato, tolta la cascata sulle sezioni.

## Blocco 3 — fatto (27/11)
- Puntini a 22 px nei due temi (`--puntino`: testo all'11% chiaro, 9% scuro, 5% nelle viste di studio).
- Vivo solo in Oggi, Calendario, Altro, Promemoria e Note (`data-sfondo` da `disegna()`): un tocco su uno spazio vuoto accende i puntini vicini nell'accento per 650 ms (maschera radiale animata con `@property --raggio`). Nessun movimento continuo, nessun rAF; spento con «riduci movimento» e Animazioni: no. JS +141 B gzip.

## Blocco 4 — fatto (27/11), scelte dell'utente
- Oggi: esami in una riga sotto la data (`rigaEsami`, anche gli esami dei piani generati) al posto del banner «Modalità esame» e dei 3 riquadri; card Adesso senza la riga di stato doppia, pulsante «▶ Studio libero» su una riga; «Tempo di studio» solo minuti (i ▶ erano doppioni). `bannerModoEsame`, `widgetEsami`, `widgetTimerAvvii` restano nel codice.
- Ritardo: «In ritardo di N step» + «Quali» (elenco chiuso) + Ripianifica, in Oggi e in Studio.
- Studio › Corsi: un selettore «Step ▾» (menu con gli step e «+ Nuovo corso») al posto della fila di chip: da 3 a 2 livelli prima del contenuto.
- Test: `aspetto` +10 controlli; `versatile` (Nuovo corso dal selettore), `collaudo_filiera` F4 (conto alla rovescia sotto la data), `fase4` (attesa della vista dopo la View Transition).
- Non fatto: la card «Drive non collegato» in Altro (doppione di Dati e backup) resta: è anche l'invito a collegare Drive; da decidere nel blocco 6.

## Fonti
- Sundararajan & Adesope 2020 (WSU): https://news.wsu.edu/press-release/2020/03/19/seductive-details-inhibit-learning · meta-analisi 2026: https://link.springer.com/content/pdf/10.1007/s11251-023-09632-w.pdf · https://frontiersin.org/articles/10.3389/fpsyg.2024.1393113/full · Pink & Newton 2020: https://online.gcc.mass.edu/pluginfile.php/2178383/mod_page/content/39/advan.00102.2019.pdf
- NN/g: https://www.nngroup.com/articles/mobile-tutorials/ · https://www.nngroup.com/articles/onboarding-tutorials/ · https://www.nngroup.com/articles/mobile-app-onboarding/ · https://nngroup.com/articles/animation-duration
- View Transitions: https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available · https://developer.chrome.com/blog/view-transitions-in-2025 · https://caniuse.com/view-transitions
- Duolingo/Rive: https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life · https://medium.com/@assenavseolb/dissecting-duolingos-design-f1113a1db8cd
- App di pianificazione: https://cal.com/blog/planner-apps-for-students · https://clickup.com/blog/minimalist-digital-planners/
- Atkinson Hyperlegible (Braille Institute) e WCAG 2.1 2.3.3: conoscenza di Claude [C], da verificare la licenza OFL del file prima dell'uso.
