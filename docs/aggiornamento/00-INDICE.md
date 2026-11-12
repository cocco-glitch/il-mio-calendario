# Aggiornamento "Il mio calendario" — v0.7 → v1.0 "Cervello"
Redatto da Claude l'11/11/2026. App di partenza: **v0.6.1** (repo `cocco-glitch/il-mio-calendario`, sito `cocco-glitch.github.io/il-mio-calendario`).

## Obiettivo in una riga
Trasformare il calendario da "agenda che mostra cosa studiare" a **allenatore di memoria**: decide *quando* ripassare (ripetizione spaziata), *come* studiare (richiamo attivo, alternanza, pause), ti avvisa davvero (notifiche) e ti fa vedere *quanto ricordi* (non solo quanto hai fatto).

## I file (leggili in quest'ordine)
| # | File | Contenuto | Chi lo usa |
|---|---|---|---|
| 00 | INDICE (questo) | mappa, regole, stato | tutti |
| 01 | RICERCA-APP | analisi di app di flashcard, quiz, calendari e metodi di studio: layout, funzioni, colori, animazioni, tattiche, cosa "rubare" | consultazione |
| 02 | NEUROSCIENZE | come il cervello impara e ricorda, con forza delle prove; miti da evitare | consultazione |
| 03 | SINTESI (A) | il "merging": principi, architettura delle informazioni, cosa entra nell'app e cosa no | prima di sviluppare |
| 04 | TATTICHE-NEURO (B) | 30 ipotesi di tattiche neurologiche da implementare, ognuna con meccanismo, implementazione, dati, metrica, rischio | prima di ogni fase |
| 05 | PIANO-FASI (C) | metodo di pianificazione + fasi F0–F10 con obiettivi, MoSCoW, file toccati, criteri di accettazione | **guida operativa** |
| 06 | NOTIFICHE | modo gratuito per le notifiche (3 livelli, passo passo) | F1 |
| 07 | DESIGN-SYSTEM | colori, tipografia, movimento/animazioni, componenti, accessibilità | F7 e ogni UI |
| 08 | DRIVE-E-ARCHIVIO | proposte per riorganizzare il Drive, alternative (Drive dedicato, locale, GitHub) | da decidere con l'utente |
| 09 | IDEE-EXTRA | backlog di idee "non ora" (Won't-have-this-time) | futuro |
| 10 | PROMPT-AVVIO | prompt corto per far partire un Claude su una fase, consumando pochi token | ogni sessione |

## Regole che valgono per tutte le fasi (non negoziabili)
1. **Niente caricato sul Drive e niente cestinato senza ok esplicito** dell'utente. L'app scrive solo in `Calendario personale/` e non elimina mai file (al massimo `_cestino app/`).
2. **Mai modificare le mini-app quiz HTML** né i vecchi file Gemini. Le novità sui quiz si fanno *attorno* ai file (al momento di aprirli), non *dentro*.
3. **Mai cambiare gli `id`** di schede, materie, corsi: i progressi sono legati a quelli. Ogni campo nuovo è **facoltativo** (i dati vecchi devono continuare a funzionare).
4. **Zero dipendenze npm** (l'ambiente non le scarica): TypeScript puro, file `src/NN-nome.ts` concatenati in ordine. Librerie esterne solo da CDN con cache nel service worker (come pdf.js), e solo se indispensabili.
5. Italiano, aggiornamenti brevi. Ogni fase: build → test (`test/*.py`) → aggiornare `docs/MANUTENZIONE.md` e `VERSIONE` → link da provare sull'iPhone.
6. **Prove prima del fascino**: ogni tattica deve avere un motivo scientifico (file 02) e una metrica (file 04). Niente gamification che premia il "fare" invece dell'"imparare".

## Regole per risparmiare token (per chi sviluppa)
- Leggere **solo** 00 + il paragrafo della fase in 05 + le tattiche citate in 04. Gli altri file solo se servono.
- Non rileggere tutto `src/`: usare `grep -n` sulle funzioni da toccare. La mappa dei file è in `README.md`.
- Una fase = un "taglio verticale" (dati + logica + schermata + test) piccolo e finito. Niente rifacimenti generali.
- Codice nuovo in **file nuovi** (`07-ripasso.ts`, `07-flash.ts`…) per non dover rileggere file lunghi.
- Test: aggiungere un file `test/<fase>.py` con pochi controlli essenziali, non ripetere quelli esistenti.

## Decisioni dell'utente (11/11/2026)
- **Ora (prima dell'esame)**: F0 → F1 → F2 → **F3 ridotta** (solo T12 cattura del punteggio dei quiz). Circa 4–5 sessioni.
- **Dopo il 10/12** (mese tra gli appelli): resto di F3, F4, F5, F6, F7, F8, F9.
- **Notifiche**: ntfy subito (Livello A); Web Push (Livello B) dopo l'esame.
- **Ripassi automatici**: tetto di **30 minuti al giorno**, schede più a rischio per prime, il resto slitta.
- Lavoro **interattivo**: a ogni passo Claude propone, spiega il perché e chiede prima di decidere le cose importanti.

## Stato delle fasi (da aggiornare)
| Fase | Nome | Stato |
|---|---|---|
| F0 | Fondamenta (dati, design token, motore animazioni) | **fatta in versione minima** (solo dati e impostazioni) · v0.7.0 · 11/11 |
| F1 | Notifiche vere | **Livello A (ntfy) fatto** · v0.7.0 · 11/11 — Livello B dopo l'esame |
| F2 | Motore di ripasso (FSRS) | **fatta** · v0.8.0 · 11/11 — unità = sotto-step (decisione utente) |
| F3 | Flashcard e quiz nativi + cattura punteggio | **cattura punteggio fatta** · v0.9.0 · 11/11 — **flashcard fatte** · v0.18.0 · 12/11 (import file/cartelle Drive, 4 modalità) — quiz nativi dopo il 10/12 |
| F4 | Sessione di studio guidata ("Studia ora") | **parte fatta** · v0.11 modalità simulazione — «Studia ora» dopo il 10/12 |
| F5 | Pianificatore adattivo | **parte fatta** · v0.10 ripianifica i ritardi, v0.13 chiusura serale — **generatore di piani fatto** · v0.19.0 · 12/11 |
| F6 | Metacognizione e statistiche "di memoria" | **parte fatta** · v0.12 punti deboli, v0.13 sonno/concentrazione |
| F7 | Nuovo aspetto e animazioni | da fare |
| F8 | Drive, archivio, import/export | da fare (dopo decisione su file 08) |
| F9 | Robustezza (prestazioni, cifratura, backup) | da fare |
| F10 | Estensioni (pacchetti Claude, nuovi corsi) | continuo |
