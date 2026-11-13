/* ===== Scheda d'esempio del kit: fonti, link, immagini, domande =====
   Struttura (vedi docs/kit-studio/DIRETTIVE-QUIZ.md, T2):
   - R* = riferimenti «da ripassare» (stringhe esatte usate nel campo r)
   - M  = per ogni riferimento, i link al PDF alla pagina giusta: [["etichetta","url#page=n"], …]
   - T  = citazioni VERBATIM dalle fonti dell'utente: {t:"testo", f:"fonte, pagina", l:"url#page=n"}
          (qui l'esempio non cita libri veri: usa solo spiegazioni di Claude nel campo x.cl)
   - IMG = disegni SVG creati ad hoc (colori dal tema: var(--ink) var(--accent) var(--muted) var(--warn))
   - q.questions = 12 risposte multiple (corretta sempre in o[0], c:0) + 6 completamenti */
var PDF = "https://drive.google.com/file/d/ID_DEL_PDF/view#page=";
var R1 = "Libro di esempio cap. 1, §1.1 Grandezze e unità del SI, pp. 1-4";
var M = {}; M[R1] = [["Libro p. 1-4 → PDF, pag. 5", PDF + 5]];
var CL = "Il Sistema Internazionale (SI) ha sette unità fondamentali: metro (m), chilogrammo (kg), secondo (s), ampere (A), kelvin (K), mole (mol) e candela (cd). Tutte le altre unità sono derivate, cioè prodotti e quozienti di queste.";
var IMG = { reg: '<svg viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg" role="img" font-family="IBM Plex Mono, monospace" font-size="12"><line x1="20" y1="70" x2="300" y2="70" stroke="var(--ink)" stroke-width="2"/>'
  + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return '<line x1="' + (20 + i * 28) + '" y1="' + (i % 5 ? 62 : 56) + '" x2="' + (20 + i * 28) + '" y2="70" stroke="var(--ink)" stroke-width="2"/>'; }).join('')
  + '<text x="20" y="92" fill="var(--muted)">0</text><text x="292" y="92" fill="var(--muted)">10 cm</text><rect x="20" y="30" width="196" height="14" rx="3" fill="var(--accent)" opacity=".8"/><text x="20" y="22" fill="var(--accent)">oggetto da misurare</text></svg>' };
var IR = [{ s: "reg", cap: "Un righello in centimetri e l'oggetto da misurare", f: "immagine creata ad hoc" }];
var q = { questions: [
{t:"mcq",lv:"Sbarramento",q:"Quante sono le unità fondamentali del Sistema Internazionale?",r:R1,
 e:["Cosa chiede: il numero delle unità di base del SI.","Il concetto: il SI ha sette grandezze fondamentali, ognuna con la sua unità.","Elenco: metro, chilogrammo, secondo, ampere, kelvin, mole, candela.","In sintesi: sette, e tutte le altre sono derivate."],
 ew:["Cinque è un numero troppo basso: mancano corrente e intensità luminosa.","Tre sono solo quelle della meccanica (m, kg, s).","Dieci non corrisponde a nessun elenco del SI.","Quattro: hai dimenticato mole, kelvin e candela."],
 o:["Sette","Cinque","Tre","Dieci","Quattro"],c:0,x:{cit:[],cl:CL}},
{t:"mcq",lv:"Sbarramento",q:"Qual è l'unità SI della massa?",r:R1,
 e:["Cosa chiede: l'unità fondamentale della massa.","Il concetto: nel SI la massa si misura in chilogrammi, non in grammi.","In sintesi: kg, l'unica unità fondamentale con un prefisso nel nome."],
 ew:["Il grammo è un sottomultiplo, non l'unità SI.","Il newton misura una forza.","La libbra non è del SI.","La mole misura la quantità di sostanza."],
 o:["Il chilogrammo","Il grammo","Il newton","La libbra inglese","La mole"],c:0,x:{cit:[],cl:CL}},
{t:"mcq",lv:"Applicativo",q:"Quale di queste è un'unità derivata?",r:R1,
 e:["Cosa chiede: riconoscere un'unità che non è tra le sette di base.","Il concetto: un'unità derivata si ottiene combinando quelle fondamentali.","Il newton = kg·m/s², quindi è derivato.","In sintesi: newton derivato, gli altri sono fondamentali."],
 ew:["Il metro è fondamentale.","Il secondo è fondamentale.","Il kelvin è fondamentale.","L'ampere è fondamentale."],
 o:["Il newton","Il metro","Il secondo","Il kelvin","L'ampere"],c:0,x:{cit:[],cl:CL}},
{t:"mcq",lv:"Applicativo",q:"Guarda l'immagine: quanto è lungo l'oggetto?",r:R1,img:IR,
 e:["Cosa chiede: leggere una misura sul righello.","Passaggio: l'oggetto parte da 0 e arriva alla settima tacca.","Ogni tacca vale 1 cm, quindi 7 cm.","In sintesi: si conta dallo zero, non dalla prima tacca."],
 ew:["8 cm: hai contato anche la tacca dello zero.","6 cm: hai saltato una tacca.","10 cm è la lunghezza del righello.","0,7 cm: hai sbagliato la scala di un fattore 10."],
 o:["7 cm","8 cm","6 cm","10 cm","0,7 cm"],c:0,x:{cit:[],cl:"Si legge la tacca su cui finisce l'oggetto, partendo dallo zero del righello."}},
{t:"mcq",lv:"Problema",q:"A quanti metri corrispondono 2,5 km?",r:R1,
 e:["Cosa chiede: convertire chilometri in metri.","Il concetto: chilo = 10^{3}.","Passaggio: 2,5 × 1000 = 2500 m.","In sintesi: da km a m si moltiplica per 1000."],
 ew:["250 m: hai moltiplicato per 100.","25 m: hai moltiplicato per 10.","0,0025 m: hai diviso invece di moltiplicare.","25 000 m: hai moltiplicato per 10 000."],
 o:["2500 m","250 m","25 m","0,0025 m","25 000 m"],c:0,x:{cit:[],cl:"Il prefisso chilo vale 1000."}},
{t:"mcq",lv:"Problema",q:"Una velocità di 36 km/h, in m/s, vale:",r:R1,
 e:["Cosa chiede: convertire km/h in m/s.","Passaggio 1: 36 km = 36 000 m; 1 h = 3600 s.","Passaggio 2: 36 000 / 3600 = 10 m/s.","In sintesi: da km/h a m/s si divide per 3,6."],
 ew:["129,6: hai moltiplicato per 3,6.","36: non hai convertito.","3,6: hai diviso per 10.","0,01: hai convertito solo il tempo e al contrario."],
 o:["10 m/s","129,6 m/s","36 m/s","3,6 m/s","0,01 m/s"],c:0,x:{cit:[],cl:"1 km/h = 1000 m / 3600 s = 1/3,6 m/s."}},
{t:"mcq",lv:"Trabocchetto",q:"Il simbolo corretto del chilogrammo è:",r:R1,
 e:["Cosa chiede: la scrittura corretta del simbolo.","Il concetto: i simboli SI hanno maiuscole e minuscole precise; k minuscolo = chilo.","In sintesi: kg, tutto minuscolo e senza punto."],
 ew:["Kg con K maiuscolo è un errore comune: K è il kelvin.","kG non esiste.","kgr non è un simbolo SI.","Kg. con il punto è doppiamente sbagliato."],
 o:["kg","Kg","kG","kgr","Kg."],c:0,x:{cit:[],cl:"I simboli SI non hanno il punto finale e rispettano maiuscole e minuscole."}},
{t:"mcq",lv:"Trabocchetto",q:"La temperatura nel SI si misura in:",r:R1,
 e:["Cosa chiede: l'unità SI della temperatura.","Il concetto: il kelvin è fondamentale; il grado Celsius è ammesso ma non è l'unità di base.","In sintesi: kelvin, senza il simbolo di grado."],
 ew:["Il °C è ammesso nell'uso ma non è l'unità SI di base.","Il °F non è del SI.","Il joule misura energia.","Il grado kelvin con ° è una scrittura sbagliata."],
 o:["Kelvin (K)","Gradi Celsius","Gradi Fahrenheit","Joule","Gradi kelvin (°K)"],c:0,x:{cit:[],cl:CL}},
{t:"mcq",lv:"Applicativo",q:"Il prefisso «milli» corrisponde a:",r:R1,
 e:["Cosa chiede: il fattore del prefisso milli.","Il concetto: milli = un millesimo.","In sintesi: 10^{-3}."],
 ew:["Un milionesimo è micro.","Mille volte è chilo.","Un centesimo è centi.","Un miliardesimo è nano."],
 o:["Un millesimo","Un milionesimo","Mille volte","Un centesimo","Un miliardesimo"],c:0,x:{cit:[],cl:"Prefissi: kilo 10^{3}, centi 10^{-2}, milli 10^{-3}, micro 10^{-6}, nano 10^{-9}."}},
{t:"mcq",lv:"Problema",q:"Quanti cm³ ci sono in 1 dm³?",r:R1,
 e:["Cosa chiede: convertire un volume.","Passaggio: 1 dm = 10 cm, quindi 1 dm³ = 10³ cm³.","Risultato: 1000 cm³.","In sintesi: per i volumi il fattore va al cubo."],
 ew:["10: hai convertito come una lunghezza.","100: hai convertito come un'area.","1 000 000: è il fattore tra m³ e cm³.","0,001: hai diviso invece di moltiplicare."],
 o:["1000","10","100","1 000 000","0,001"],c:0,x:{cit:[],cl:"Per le aree il fattore va al quadrato, per i volumi al cubo."}},
{t:"mcq",lv:"Sbarramento",q:"Che cosa esprime la misura di una grandezza?",r:R1,
 e:["Cosa chiede: la definizione di misura.","Il concetto: misurare è confrontare la grandezza con un'unità campione.","In sintesi: è il rapporto tra la grandezza e la sua unità."],
 ew:["La somma non c'entra.","Il prodotto non c'entra.","Non è una differenza.","Senza unità il numero non ha significato."],
 o:["Il rapporto con un'unità","La somma con un'unità","Il prodotto con un'unità","Una differenza tra grandezze","Un numero senza unità"],c:0,x:{cit:[],cl:"Una misura è sempre numero + unità."}},
{t:"mcq",lv:"Trabocchetto",q:"Quale scrittura è corretta per 5 milligrammi?",r:R1,
 e:["Cosa chiede: il simbolo di milligrammo.","Il concetto: prefisso m (milli) + g (grammo).","In sintesi: 5 mg, con lo spazio tra numero e simbolo."],
 ew:["Mg è il megagrammo (10^{6} g).","mgr non è un simbolo SI.","mG non esiste.","μg è il microgrammo."],
 o:["5 mg","5 Mg","5 mgr","5 mG","5 μg"],c:0,x:{cit:[],cl:"M maiuscolo = mega, m minuscolo = milli."}},
{t:"fill",lv:"Completamento",q:"L'unità SI del tempo è il …… .",r:R1,a:["secondo","s"],show:"secondo",e:["Il secondo è l'unità fondamentale del tempo.","In sintesi: s."],ew:["Errore più probabile: minuto o ora, che non sono unità SI di base."],x:{cit:[],cl:CL}},
{t:"fill",lv:"Completamento",q:"1 km corrisponde a …… m.",r:R1,a:["1000","mille"],show:"1000",e:["Chilo = 1000.","In sintesi: 1 km = 1000 m."],ew:["Errore più probabile: 100."],x:{cit:[],cl:"Chilo = 10^{3}."}},
{t:"fill",lv:"Completamento",q:"La quantità di sostanza si misura in …… .",r:R1,a:["mole","moli","mol"],show:"mole",e:["La mole è l'unità della quantità di sostanza.","In sintesi: mol."],ew:["Errore più probabile: grammi (quella è la massa)."],x:{cit:[],cl:CL}},
{t:"fill",lv:"Completamento",q:"Il prefisso che vale un centesimo si chiama …… .",r:R1,a:["centi"],show:"centi",e:["Centi = un centesimo.","In sintesi: 10^{-2}."],ew:["Errore più probabile: milli (10^{-3})."],x:{cit:[],cl:"centi = 10^{-2}"}},
{t:"fill",lv:"Completamento",q:"72 km/h corrispondono a …… m/s.",r:R1,a:["20"],show:"20",e:["72 / 3,6 = 20.","In sintesi: da km/h a m/s si divide per 3,6."],ew:["Errore più probabile: 259,2 (moltiplicato per 3,6)."],x:{cit:[],cl:"1 km/h = 1/3,6 m/s."}},
{t:"fill",lv:"Completamento",q:"1 m² corrisponde a …… cm².",r:R1,a:["10000","10.000","diecimila"],show:"10000",e:["1 m = 100 cm, quindi 1 m² = 100² cm².","In sintesi: 10 000 cm²."],ew:["Errore più probabile: 100 (fattore delle lunghezze)."],x:{cit:[],cl:"Per le aree il fattore va al quadrato."}}
]};
