# 04 — (B) Ipotesi di tattiche neurologiche da implementare
Formato di ogni tattica: **Meccanismo** (file 02) · **Nell'app** · **Dati** · **Metrica di successo** · **Rischio/limite** · **Fase**.
Priorità: **M** = Must, **S** = Should, **C** = Could.

## Gruppo 1 — Quando ripassare (spaziatura)
**T1. Motore FSRS unico (M)** · Bjork + spaziatura ★★★ · Ogni ER ha stabilità/difficoltà; "Ripassi di oggi" = ER con recuperabilità prevista < ritenzione desiderata. Implementare FSRS in TypeScript (formule pubbliche, parametri predefiniti; ottimizzazione dei parametri solo dopo ~1000 ripassi, facoltativa). · `memoria` · % di risposte giuste ai ripassi vicina alla ritenzione scelta (±5%) · Rischio: troppi ripassi accumulati → T3. · F2
**T2. Ritenzione che cambia con l'esame (S)** · intervallo ottimale dipende dalla distanza dall'esame ★★ · Ritenzione 0,90 normale → 0,95 negli ultimi 14 giorni prima di un `esame`; ultimi 3 giorni solo ripasso. · `esame`, impostazioni · ritenzione misurata nelle simulazioni · Rischio: carico alto vicino all'esame → avviso. · F2/F5
**T3. Tetto giornaliero e smaltimento dolce (M)** · carico cognitivo ★★★ · Massimo ripassi/giorno (es. 60 carte o 6 schede); se si accumulano, ordine = più a rischio prima, il resto distribuito sui giorni successivi ("modalità recupero"). · impostazioni · coda mai > 2 giorni di lavoro · F2
**T4. Ripasso a tolleranza (S)** · FSRS gestisce i ritardi ★★ · Saltare un giorno non è un fallimento: l'app ricalcola senza messaggi colpevolizzanti. · — · uso continuativo dopo un'assenza · F2
**T5. Pagine come ER (S)** · lettura incrementale + richiamo ★★ · Dopo aver letto pp. X–Y, l'app le riprogramma come "Scrivi a memoria cosa dicono pp. X–Y" (blurting 3 min) → poi apri il PDF e confronta → voto. · ER `pagine` · — · F4

## Gruppo 2 — Come richiamare (test e generazione)
**T6. Pretest prima del nuovo (M)** · effetto pretest ★★ · Aprendo uno step nuovo: 3–5 domande a freddo (dalle carte/quiz dello step) *prima* della lettura; il punteggio non conta e non entra nelle statistiche. · carte dello step · — · Rischio: frustrazione → testo "sbagliare qui aiuta". · F4
**T7. Sicurezza prima della risposta (M)** · metacognizione, ipercorrezione ★★ · 3 tasti (Indovino/Credo/Sicuro) prima di vedere la soluzione nelle carte; per i quiz HTML una domanda unica a inizio quiz ("quanto pensi di fare?"). · `log` · grafico di calibrazione che migliora · F3
**T8. Evidenza ipercorrezione (S)** · ★★ · Errori con "Sicuro" → bordo viola "Sorpresa!" + spiegazione obbligatoria da leggere + ripasso anticipato (giorno dopo). · `log` · tasso di errore ripetuto più basso su questi · F3
**T9. Scala di difficoltà (S)** · generazione ★★★ · Stabilità bassa → scelta multipla; media → completamento; alta → risposta libera/spiega. · `carta.tipo` dinamico · — · F3
**T10. "Perché?" dopo una risposta giusta (C)** · interrogazione elaborativa ★★ · Ogni tanto (1 su 5), dopo una risposta giusta: "In una frase: perché?" con confronto con la spiegazione. · — · — · F3
**T11. Crea la tua domanda (S)** · generazione ★★★ · A fine sessione: "Scrivi 1 domanda su cosa hai studiato" → diventa carta. · `carta` · numero di carte create e loro ritenzione · F4
**T12. Cattura automatica del punteggio quiz (M)** · feedback ★★★ · I quiz HTML si aprono in un iframe *creato dall'app*: l'app aggiunge al volo (senza modificare il file) un piccolo ascoltatore che legge la schermata finale (percentuale, tipi di domanda sbagliati) e la salva. Se il formato non è riconosciuto → chiede il punteggio a mano come oggi. · `progresso`, `memoria` · 0 punteggi ricopiati a mano · Rischio: dipende dal testo della schermata finale → test sui 3 modelli (step, consolidamento, motore esteso). · F3
**T13. Errori a scatole (Leitner) (S)** · ★★ · Le domande sbagliate (dal registro errori o catturate) diventano ER `errore` che passano di scatola in scatola; escono dopo 3 risposte giuste a distanza. · `memoria` · — · F3
**T14. Simulazione in condizioni d'esame (M)** · trasferimento ★★ · Le schede di consolidamento (31 domande, 50 min) si aprono in "modalità esame": schermo intero, timer, niente notifiche, niente suggerimenti esterni. · `sessione.tipo=simulazione` · andamento punteggi simulazioni · F4

## Gruppo 3 — Come organizzare la sessione
**T15. "Studia ora" (M)** · carico cognitivo ★★★ · Un tasto: l'app compone la sessione migliore per la durata scelta: 1) ripassi scaduti più a rischio (max 30% del tempo), 2) step del giorno, 3) errori; 4) chiusura con richiamo. · tutto · % sessioni avviate da qui · F4
**T16. Alternanza intelligente (S)** · interleaving ★★ · Nei ripassi mescolare materie e tipi di problema (mai 3 carte di fila dello stesso microstep); nel *nuovo* invece blocchi (l'alternanza aiuta soprattutto dopo un primo apprendimento). · — · — · F4
**T17. Blocchi adattivi di concentrazione (S)** · attenzione ★★ · Timer con blocchi 25/5, 50/10, 90/15; a fine blocco: "Concentrazione 1–5?". Dopo 20 sessioni l'app suggerisce la durata con focus medio più alto. · `sessione.focus` · — · F4
**T18. Pausa tranquilla post-studio (S)** · consolidamento a riposo ★★ · A fine sessione: "5 minuti senza schermo" con schermata scura e respirazione lenta animata; notifica al termine. · — · — · F4
**T19. Chiusura con prossimo passo (C)** · Zeigarnik + intenzioni ★ · A fine sessione l'app scrive "Prossima volta: parti da 2.2.5 scheda 2" e lo mette in Oggi. · — · — · F4

## Gruppo 4 — Quando studiare (ritmi, sonno, energia)
**T20. Ripasso "Questa sera" (S)** · sonno ★★★ · Fascia serale (es. 21:30–22:30, impostabile): solo richiamo di ciò studiato in giornata, 10–15 min, niente argomenti nuovi. · — · ritenzione a 24 h dei contenuti con ripasso serale vs senza · F5
**T21. Fasce di energia (S)** · attenzione ★★ · L'utente imposta fasce alta/media/bassa; il pianificatore mette nuovo/difficile/problemi nelle alte, ripassi nelle basse. Dopo 2 settimane l'app propone fasce corrette dai suoi dati (punteggio e focus per ora del giorno). · `giorno.energia`, `sessione` · — · F5
**T22. Sonno annotato e correlato (C)** · ★★★ · Rituale mattino: "Quante ore hai dormito?" (un tocco). Progressi: grafico punteggi vs sonno. Promemoria "è ora di chiudere" nelle 2 settimane prima dell'esame. · `giorno.sonno` · — · F6
**T23. Pausa attiva (C)** · movimento/BDNF ★★ · Tra due blocchi lunghi: suggerimento "10 min a piedi" con timer. · — · — · F4

## Gruppo 5 — Motivazione sana
**T24. Serie gentile (S)** · abitudine ★★ · La serie conta i giorni con *almeno* i ripassi minimi (non le ore). 2 congelamenti al mese gratis; i giorni "Riposo" del piano non rompono la serie; nessun messaggio di colpa. · `giorno.congelato` · — · Rischio: studiare per la serie → la serie richiede richiamo, non tempo. · F6
**T25. Celebrazioni legate alla padronanza (S)** · dopamina/sorpresa ★★ · Animazione breve quando un microstep diventa verde, quando chiudi uno step, quando la calibrazione migliora; frasi variabili. Mai per "hai aperto l'app". · — · — · F7
**T26. Intenzioni di attuazione (M)** · ★★★ · Ogni blocco di studio in calendario mostra "quando/dove/cosa apri" e il rituale mattino chiede "dove studi oggi?". · `evento` · % blocchi iniziati entro 10 min dall'orario · F5
**T27. Barre e conto alla rovescia (S)** · gradiente dell'obiettivo ★★ · Barra di padronanza per step e corso, giorni all'esame, "pronto all'esame: 72%" (= ritenzione prevista sul programma a quella data). · — · — · F6
**T28. Rituali mattina/sera (S)** · pianificazione + revisione ★★ · Mattina (2 min): sonno, energia, conferma piano, avviso sovraccarico. Sera (2 min): cosa è fatto, cosa slitta (ripianifica), ripasso serale. · `giorno` · — · F5

## Gruppo 6 — Codifica migliore
**T29. Doppia codifica nelle carte (S)** · ★★ · Campo immagine nelle carte (da Drive o foto), grafici; mai immagini decorative. · `carta.img` · — · F3
**T30. Carte dagli appunti e dal PDF (S)** · generazione ★★★ · Sintassi `domanda :: risposta` nelle note; nel visualizzatore PDF "Crea carta da questa pagina" con riferimento pagina. · `carta.fonte` · — · F3

## Ipotesi da verificare con i dati (esperimenti personali)
L'app può fare piccoli **esperimenti su di te** (A/B personali), mostrando il risultato dopo qualche settimana:
- ripasso serale sì/no → ritenzione a 24 h;
- blocchi 25 vs 50 min → focus e punteggio;
- alternanza vs blocchi nei ripassi → punteggio nelle simulazioni;
- pretest sì/no → punteggio al primo quiz dello step.
Regola: un esperimento alla volta, attivabile da Progressi, mai obbligatorio.
