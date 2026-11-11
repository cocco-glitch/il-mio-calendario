# 07 — Design system: colori, tipografia, movimento, componenti
Base attuale: `public/style.css` con variabili `--accento`, `--bg`, `--sup`, `--testo`, tema chiaro/scuro, carattere di sistema. Tutto ciò che segue si aggiunge come **variabili CSS** (design token), così l'editor tema esistente continua a funzionare.

## 1. Colore: tre livelli di significato
1. **Neutri** (sfondo, superfici, testo): restano quelli attuali, chiaro e scuro.
2. **Identità della materia** (fissi, riconoscibili, accessibili sia in chiaro che in scuro):
   | Materia | Token | Chiaro | Scuro | Forma/icona |
   |---|---|---|---|---|
   | Chimica | `--m-c` | #0f9d8a (verde acqua) | #3fd1bc | esagono ⬡ |
   | Biologia | `--m-b` | #2f9e44 (verde foglia) | #69db7c | cerchio ● |
   | Fisica | `--m-f` | #3b6fe0 (blu) | #74a0ff | triangolo ▲ |
   | Altre materie | `--m-1…8` | palette di 8 tinte a luminosità uguale (stessa L in OKLCH) | | quadrato, rombo… |
   Il colore non è mai l'unico segnale: c'è sempre la forma/sigla (C, B, F).
3. **Stato della memoria** (scala unica per padronanza/recuperabilità, usata ovunque):
   `--mem-0` da imparare (grigio) · `--mem-1` a rischio (<70%, corallo #e8590c) · `--mem-2` in costruzione (70–85%, ambra #f59f00) · `--mem-3` solido (85–95%, verde #2f9e44) · `--mem-4` padroneggiato (>95%, verde scuro/teal #0b7285). In scuro: stesse tinte più chiare. Daltonismo: la scala usa anche **riempimento** (vuoto → ¼ → ½ → ¾ → pieno).
4. **Feedback**: giusto `--ok` (verde), sbagliato `--ko` (rosso esistente `--rosso`), sorpresa/ipercorrezione `--sorpresa` (viola #7048e8), suggerimento `--info` (accento).
- **Contrasto**: testo ≥ 4.5:1, grafici e icone ≥ 3:1 (verificare con uno script di controllo in `test/`).
- **Modalità studio**: durante "Studia ora" i colori si attenuano (solo neutri + materia corrente) per ridurre il carico.

## 2. Tipografia
- Carattere di sistema (San Francisco su iPhone) — veloce e leggibile. Numeri **tabulari** (`font-variant-numeric: tabular-nums`) per timer, percentuali, orari.
- Scala: 12 · 13 · 15 · 17 (corpo) · 20 · 24 · 28 (titolo) · 34 (numero grande, es. timer/percentuale). Interlinea 1.4 corpo, 1.15 titoli. Peso 400/600/750.
- Le carte e le domande usano 20–24 pt: leggere senza fatica è parte del carico cognitivo.
- Rispettare la dimensione testo scelta in Aspetto (già esistente).

## 3. Spazi, forme, profondità
- Griglia di 4 pt: spaziature 4/8/12/16/24/32.
- Raggi: `--raggio` esistente (14) per card; 999 per pillole; 22 per fogli modali.
- Ombre leggere solo per ciò che "galleggia" (fogli, pulsante Studia ora). In scuro: niente ombre, superfici più chiare.
- Bersagli tattili ≥ 44×44 pt; azioni principali nella metà bassa dello schermo.

## 4. Movimento (animazioni)
**Principi**: il movimento *spiega* (da dove viene, dove va), *conferma* (ho registrato), *celebra* (raramente). Mai movimento continuo durante lo studio.
| Token | Durata | Curva | Uso |
|---|---|---|---|
| `--t-micro` | 120 ms | ease-out | pressione pulsanti, spunte, toggle |
| `--t-breve` | 200 ms | cubic-bezier(.2,.8,.2,1) | comparsa elementi, cambio vista |
| `--t-medio` | 320 ms | molla leggera (CSS `linear()` approssimata) | fogli modali, carta che si gira |
| `--t-festa` | 600–900 ms | — | celebrazioni (max 1 per sessione) |
**Catalogo micro-animazioni (F7)**:
- **Spunta disegnata**: tratto SVG che si disegna (stroke-dashoffset) + leggero rimbalzo della riga; la riga poi scivola verso il basso/fuori.
- **Carta che si gira**: rotazione 3D sull'asse Y (perspective 1000px), retro con `backface-visibility: hidden`.
- **Risposta**: giusto → bordo verde + barra che avanza con piccolo "+1"; sbagliato → leggero scuotimento orizzontale (3 oscillazioni, 4 px) + spiegazione che sale dal basso; ipercorrezione → bagliore viola.
- **Barra di padronanza**: riempimento animato quando cambia; il microstep che passa a verde fa un "pop" (scala 1→1.08→1).
- **Timer**: anello che si consuma (SVG `stroke-dasharray`), respiro lento (scala 1↔1.03 in 4 s) solo nella pausa tranquilla.
- **Transizioni tra schermate**: View Transitions API (Safari 18+) con dissolvenza + scorrimento di 8 px; fallback dissolvenza semplice.
- **Celebrazioni**: coriandoli leggeri disegnati su canvas (≤ 60 particelle, 900 ms) solo per: step completato, microstep verde, record di calibrazione, esame superato.
- **Caricamento**: scheletri grigi (skeleton) invece di rotelline.
- **Accessibilità**: `@media (prefers-reduced-motion: reduce)` → tutte le durate a 0 o dissolvenze; interruttore "Animazioni" in Aspetto.
- **Vibrazione**: l'API di vibrazione del web **non è supportata su iPhone**; non contarci (su Android/PC facoltativa).

## 5. Componenti chiave (da costruire/estendere)
| Componente | Descrizione |
|---|---|
| **Pillola timeline** | blocco con icona materia, titolo, orario, durata = altezza; stato (da fare/in corso/fatto) |
| **Spazio libero** | tratteggiato tra due pillole: "45 min liberi · + ripasso" |
| **Carta** | fronte/retro, area risposta, tasti sicurezza (3) e voto (4, con intervallo scritto sotto) |
| **Opzione quiz** | colore + forma (▲ ◆ ● ■), lettera A–E, stato |
| **Cella padronanza** | quadratino del microstep con colore/riempimento della scala memoria |
| **Anello timer** | percentuale, tempo, fase |
| **Grafico calibrazione** | diagonale ideale + punti per livello di sicurezza |
| **Riquadro "Ripassi di oggi"** | numero, minuti stimati, pulsante Inizia, ripartizione per materia |
| **Foglio rituale** | 3–4 domande a tocco singolo (sonno, energia, piano, conferma) |
| **Banner gentile** | messaggi senza colpa ("Ieri hai saltato: ho ridistribuito 8 ripassi su 3 giorni") |

## 6. Tono dei testi (microcopy)
Seconda persona, frasi brevi, incoraggianti e oneste. Mai: "Hai fallito", "Hai perso la serie!". Sì: "Sbagliare qui aiuta: è un pretest", "Era una risposta sicura ma sbagliata: questa la ricorderai", "Oggi 20 minuti bastano".

## 7. Ispirazioni visive (dal file 01)
Structured (timeline), Things 3 (animazioni), Fantastical (inserimento con evidenziazione), Anki (tasti con intervallo), Kahoot (forme/colori opzioni), Khan (padronanza), Duolingo (feedback immediato).
