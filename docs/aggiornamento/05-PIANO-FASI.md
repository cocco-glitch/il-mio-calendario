# 05 — (C) Piano a fasi per aggiornare l'app
## 1. Il metodo di pianificazione (perché è fatto così)
Combino sei tecniche usate per pianificare applicazioni nel loro insieme, scelte perché funzionano con **un solo sviluppatore (un Claude per sessione)** e **pochi token**:
1. **Mappa delle storie utente** (User Story Mapping, Jeff Patton): in alto la "spina dorsale" = il ciclo PIANIFICA→STUDIA→RICHIAMA→VALUTA→RIPROGRAMMA→RIPOSA (file 03); sotto, le funzioni per ogni passo. Serve a vedere l'app *intera* e a non dimenticare pezzi.
2. **Scheletro che cammina** (walking skeleton) + **tagli verticali**: ogni fase consegna una funzione completa dall'inizio alla fine (dati → logica → schermata → test), piccola ma usabile subito. Mai "prima tutti i dati, poi tutta la grafica".
3. **Appetito** (Shape Up, Basecamp): per ogni fase si decide **prima** quanto lavoro vale (S = 1 sessione, M = 2, L = 3) e si taglia la soluzione per starci dentro. Ogni fase ha una "scheda pitch": problema, appetito, soluzione, buche da evitare (rabbit holes), cose escluse (no-go).
4. **MoSCoW** dentro ogni fase: Must (senza questo la fase fallisce), Should, Could, Won't (va nel file 09).
5. **Prima i rischi**: le incognite tecniche più grandi (FSRS corretto, cattura punteggio dall'iframe, notifiche iOS) si provano con un **prototipo minimo** ("spike") all'inizio della loro fase.
6. **Definizione di "fatto"** uguale per tutte le fasi (sotto) + **registro delle decisioni** (una riga in `docs/DECISIONI.md` per ogni scelta importante: data, scelta, motivo).

### Definizione di "fatto" (vale per ogni fase)
- [ ] `node build.mjs` senza errori; tutti i `test/*.py` esistenti verdi + nuovo `test/fN.py`.
- [ ] Dati vecchi aperti senza perdite (test con un `dati.json` della v0.6).
- [ ] Funziona offline e su iPhone verticale (390×844) e PC.
- [ ] "Riduci movimento" rispettato; contrasto AA.
- [ ] `VERSIONE` alzata, `README.md`/`docs/MANUTENZIONE.md` aggiornati in poche righe, riga in `docs/DECISIONI.md`.
- [ ] Pubblicato su `gh-pages`; link mandato all'utente; stato aggiornato nel file 00.

## 2. Mappa delle dipendenze
```
F0 Fondamenta ──► F2 FSRS ──► F3 Carte/Quiz ──► F4 Studia ora ──► F5 Pianificatore ──► F6 Progressi
      │                                                                  ▲
      ├──► F1 Notifiche (indipendente, può andare subito dopo F0) ───────┘
      └──► F7 Aspetto (può andare in parallelo da F2 in poi, a pezzi)
F8 Drive/archivio: solo dopo decisione dell'utente sul file 08.  F9 Robustezza: dopo F6.  F10: continuo.
```
Ordine consigliato: **F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F9 → F8 → F10**. F1 è anticipata perché l'utente l'ha chiesta e dà valore subito.

## 3. Le fasi (schede pitch)

### F0 — Fondamenta · appetito S
- **Problema**: le nuove funzioni hanno bisogno di nuovi record, di colori/animazioni coerenti e di una vista Oggi riorganizzabile.
- **Must**: tipi `memoria`, `carta`, `giorno` in `03-modello.ts` (facoltativi, compatibili); **design token** in `style.css` (file 07: colori materia, scala stato memoria, spaziature, durate animazioni, `prefers-reduced-motion`); funzione `anima(el, tipo)` in `04-componenti.ts`; file `docs/DECISIONI.md`.
- **Should**: migrazione automatica `impostazioni` con valori predefiniti nuovi.
- **Buche da evitare**: non ridisegnare tutta l'app ora (è F7).
- **Accettazione**: dati v0.6 aperti identici; i token cambiano il tema senza rompere nulla.
- **File**: `03-modello.ts`, `04-componenti.ts`, `public/style.css`, nuovo `test/f0.py`.

### F1 — Notifiche vere · appetito S (Livello A) + M (Livello B, facoltativo)
- **Dettagli completi nel file 06.**
- **Must (Livello A, ntfy)**: impostazione "Notifiche sul telefono" con topic segreto generato dall'app; a ogni salvataggio e a ogni apertura l'app programma su ntfy.sh i promemoria delle prossime 72 ore (eventi con promemoria, task con ora, blocchi di studio, "Ripassi di oggi" alle 8:00, "Questa sera" alle 21:30); annulla/riprogramma quando cambi qualcosa; orari silenziosi; testo minimo (privacy).
- **Should**: tocco sulla notifica → apre l'app nel punto giusto (`Click:` con URL `#/oggi`, `#/studio/…`).
- **Could (Livello B)**: Web Push nativo con Cloudflare Worker (file 06).
- **Buche**: limite di 3 giorni per la programmazione su ntfy.sh → finestra mobile + promemoria quotidiano "apri l'app" + specchio Google Calendar per gli eventi lontani (già esistente).
- **Accettazione**: notifica di prova arriva su iPhone a schermo bloccato in < 1 min dall'orario; modificare/eliminare un evento cambia/cancella la notifica.
- **File**: nuovo `src/06-notifiche.ts`, `08-viste.ts` (Altro → Notifiche), `test/f1.py` (finto server).

### F2 — Motore di ripasso FSRS · appetito M
- **Tattiche**: T1, T2, T3, T4.
- **Must**: `src/07-memoria.ts` con FSRS (funzioni pure: `recuperabilita(s, giorni)`, `aggiorna(mem, voto, giorni)`, `prossimaData`), parametri predefiniti pubblici, ritenzione regolabile; conversione punteggio quiz → voto (file 03 §4); ER creati in automatico per ogni scheda fatta e per ogni errore; riquadro **"Ripassi di oggi"** in Oggi con tetto giornaliero e ordine per rischio; colore di padronanza per microstep nella vista Studio.
- **Spike iniziale**: confrontare gli intervalli calcolati con quelli di riferimento FSRS (tabella di 10 casi nel test).
- **Should**: ritenzione 0,95 nei 14 giorni prima di un esame (T2); modalità semplice "2-3-5-7" per chi non vuole FSRS.
- **Could**: ottimizzazione dei parametri sui dati dell'utente (dopo 1000 ripassi).
- **Buche**: non importare l'algoritmo da npm; non cambiare i `progresso` esistenti (la memoria è un record a parte).
- **Accettazione**: test con i 10 casi; una scheda fatta con 60% torna prima di una con 95%; il riquadro non supera il tetto.
- **File**: nuovo `07-memoria.ts`, `07-studio.ts` (aggancio a `segna()`), `08-viste.ts`, `test/f2.py`.

### F3 — Carte e quiz nativi + cattura punteggio · appetito L
- **Tattiche**: T7, T8, T9, T10, T12, T13, T29, T30.
- **Must**: record `carta` con editor (fronte/retro, tipo, immagine da Drive, materia, microstep); schermata di ripasso carte: sicurezza (3 tasti) → risposta → 4 tasti con intervallo; opzioni con **colore + forma**; **cattura del punteggio** dei quiz HTML (T12) con ricaduta su `progresso` e `memoria`; importazione di carte da JSON (pacchetto `tipo: "carte"` generato da Claude; formato in `docs/formato-studio.md`).
- **Spike iniziale (T12)**: aprire 3 quiz reali (scheda step, motore esteso, consolidamento) e verificare che la schermata finale sia leggibile dall'app; se no, fallback manuale.
- **Should**: sintassi `domanda :: risposta` nelle note; "Crea carta da questa pagina" nel PDF; ipercorrezione evidenziata; errori a scatole.
- **Could**: modalità "Abbina" a tempo; "Perché?" dopo risposte giuste.
- **No-go**: modificare i file quiz su Drive.
- **Accettazione**: un quiz completato aggiorna da solo punteggio, data e prossimo ripasso; 20 carte importate da JSON si ripassano offline.
- **File**: nuovi `07-carte.ts`, `07-cattura.ts`; `07-studio.ts`; `test/f3.py`.

### F4 — "Studia ora" e sessione guidata · appetito M
- **Tattiche**: T5, T6, T11, T14, T15, T16, T17, T18, T19, T23.
- **Must**: pulsante centrale **▶ Studia ora** → scelta durata → sessione composta (ripassi a rischio, step del giorno, errori) a schermo intero con una cosa per volta; timer a blocchi (25/5, 50/10, 90/15) con valutazione focus; **pretest** all'apertura di uno step nuovo; **modalità esame** per le schede di consolidamento; chiusura con "crea una domanda" e "prossimo passo".
- **Should**: blurting sulle pagine (T5); alternanza nei ripassi (T16); pausa tranquilla (T18).
- **Could**: pausa attiva (T23); suoni discreti (disattivabili).
- **Buche**: non rifare il timer esistente: estenderlo (`07-extra.ts`).
- **Accettazione**: dalla Home a una sessione in ≤ 2 tocchi; a fine sessione `sessione`, `memoria`, `progresso` aggiornati.
- **File**: nuovo `07-sessione.ts`, `07-extra.ts`, `08-viste.ts`, `test/f4.py`.

### F5 — Pianificatore adattivo e rituali · appetito L
- **Tattiche**: T2, T20, T21, T26, T28 (+ PROGRESSIONE.md punto 2 "Generatore di piani").
- **Must**: generatore di piani (data esame + argomenti + giorni disponibili + step/giorno + giorni riserva + ripasso finale) → pacchetto `piano` con `origine: "generato"`; **ripianifica da oggi** quando sei indietro senza toccare i progressi; ripassi FSRS incastrati negli spazi liberi della timeline; rituale mattino e sera con **avviso di sovraccarico**.
- **Should**: fasce di energia; fascia "Questa sera"; intenzioni di attuazione (dove/quando) sui blocchi.
- **Could**: suggerimento automatico delle fasce dai dati.
- **Buche**: niente ottimizzatori complicati: algoritmo "riempi in ordine di priorità" con limiti giornalieri.
- **Accettazione**: con 3 giorni di ritardo simulati il piano si sposta in avanti, la data di chiusura teoria resta o compare un avviso chiaro; il 12/11 di esempio continua a mostrare gli step del piano attuale.
- **File**: nuovo `07-pianifica.ts`, `07-studio.ts`, `08-viste.ts`, `test/f5.py`.

### F6 — Progressi "di memoria" e metacognizione · appetito M
- **Tattiche**: T22, T24, T27 + esperimenti personali.
- **Must**: schermata **Progressi**: ritenzione prevista per materia e step (oggi e alla data d'esame), mappa di padronanza (griglia microstep), **calibrazione** (sicurezza vs esito), tempo per materia (esistente), andamento simulazioni; "Pronto all'esame: N%".
- **Should**: serie gentile con congelamenti; sonno vs punteggio; errori ricorrenti per tipo di domanda (sbarramento, trabocchetto, completamento — dai quiz catturati).
- **Could**: esperimenti personali A/B (file 04 fondo).
- **Grafici**: SVG fatti a mano (niente librerie), stile file 07.
- **File**: nuovo `07-progressi.ts`, `test/f6.py`.

### F7 — Nuovo aspetto e animazioni · appetito M (a pezzi)
- **Must**: applicare il design system (file 07) a Oggi (timeline), Studia ora, carte, Progressi; animazioni: spunta disegnata, carta che si gira, barra che avanza, transizioni tra schermate (View Transitions API dove supportata, fallback dissolvenza), celebrazioni brevi (T25); icone per materia.
- **Should**: temi preconfezionati nuovi (es. "Notte studio", "Carta", "Alto contrasto"); vista settimana con densità di studio (heatmap).
- **Accettazione**: nessuna animazione > 400 ms nell'uso quotidiano; tutto disattivabile; 60 fps su iPhone.

### F8 — Drive, archivio, import/export · appetito M (dopo la decisione dell'utente sul file 08)
- **Must**: sync divisa per file (`dati/eventi-2026.json`, `dati/studio.json`, `dati/memoria.json`…) per non riscrivere tutto a ogni modifica; esportazione completa (ZIP JSON + CSV); importazione `.apkg`/CSV di Anki (solo testo) facoltativa.
- **Should**: "archivio corso concluso" (PROGRESSIONE.md punto 6); indice automatico delle cartelle dello studio.
- **Could**: proposte del file 08 (nuova struttura, numerazione) — **solo con ok dell'utente**, con anteprima e senza spostare nulla da sola.

### F9 — Robustezza · appetito S
- **Must**: prestazioni con 5.000 carte e 50.000 ripassi (paginazione liste, `disegna()` parziale per le liste lunghe); controllo dimensione `dati.json`; cifratura facoltativa dei dati su Drive con passphrase (Web Crypto, AES-GCM); verifica integrità backup.
- **Should**: PIN locale; registro errori tecnici consultabile in Altro.

### F10 — Estensioni continue · appetito libero
- Pacchetti generati da Claude: step nuovi (come oggi), **carte per ogni microstep**, piani, simulazioni. Formato unico in `docs/formato-studio.md` (versione `v2` compatibile con `v1`).
- Nuovi corsi (altri esami, lingue, certificazioni, cybersecurity): solo dati, nessun codice specifico per materia.

## 4. Stima complessiva
F0 S · F1 S(+M) · F2 M · F3 L · F4 M · F5 L · F6 M · F7 M · F8 M · F9 S → circa **16–20 sessioni** di lavoro. Il minimo che cambia davvero lo studio è **F0+F1+F2+F3(Must)+F4(Must)** ≈ 8 sessioni.

## 5. Rischi principali e contromisure
| Rischio | Contromisura |
|---|---|
| iOS chiude le notifiche web o ntfy cambia limiti | specchio Google Calendar resta attivo come rete di sicurezza; Livello B Web Push |
| Lettura del punteggio dai quiz fallisce | fallback manuale (come oggi), test sui 3 modelli di quiz |
| `dati.json` troppo grande per la sync | F8: file divisi; `log` limitato agli ultimi 50 ripassi per ER |
| Troppi ripassi accumulati → abbandono | tetto giornaliero, modalità recupero, tono gentile (T3, T4) |
| Fasi che si allargano | appetito fisso: si taglia la soluzione, non si allunga la fase |
