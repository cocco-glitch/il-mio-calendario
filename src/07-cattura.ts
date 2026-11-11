// 07-cattura.ts — Lettura automatica del risultato dei quiz HTML (F3 ridotta, tattica T12).
//
// I file dei quiz su Drive NON vengono mai modificati: quando l'app apre un quiz, aggiunge alla copia
// scaricata (solo in memoria, nell'iframe) un piccolo "osservatore" che guarda la schermata finale del
// motore dei quiz e manda all'app: percentuale, giuste/totale, righe "Per tipo di domanda", punto debole
// e se era "Rifai solo gli errori".
//
// Decisioni dell'utente (11/11): salvataggio automatico con avviso "tocca per annullare" (8 s);
// "Rifai solo gli errori" NON cambia il punteggio: si annota nella nota della scheda.
//
// Selettori del motore dei quiz (schermata finale): .score .big ("12 / 16"), .score .pct ("75% di
// risposte corrette"), .lvrow (tipo, barra, "ok/tot"), .weak ("Punto debole: …"), .stat durante il
// quiz ("Domanda 1 di 3 · ripasso errori"). Se un quiz ha un formato diverso, non succede nulla:
// il punteggio si scrive a mano come prima.

interface RisultatoQuiz { imc: 'quiz-risultato'; pct: number; giuste: number | null; totale: number | null; livelli: [string, number, number][]; debole: string | null; errori: boolean; }

const Cattura = (() => {
  const SPIA = '<script>(function(){var retry=false,inviato=null;function leggi(){try{'
    + 'var st=document.querySelector(".stat");if(st&&/Domanda\\s+1\\s+di/.test(st.textContent)){retry=/ripasso errori/i.test(st.textContent)}'
    + 'var pc=document.querySelector(".score .pct");if(!pc){inviato=null;return}'
    + 'var m=/(\\d+)\\s*%/.exec(pc.textContent);if(!m)return;'
    + 'var big=document.querySelector(".score .big"),gm=big?/(\\d+)\\s*\\/\\s*(\\d+)/.exec(big.textContent):null;'
    + 'var liv=[].map.call(document.querySelectorAll(".lvrow"),function(r){var s=r.querySelector("span"),n=/(\\d+)\\s*\\/\\s*(\\d+)\\s*$/.exec(r.textContent.trim());return[s?s.textContent.trim():"",n?+n[1]:0,n?+n[2]:0]});'
    + 'var deb=null;[].forEach.call(document.querySelectorAll(".weak"),function(w){var t=w.textContent;if(/Punto debole:/.test(t))deb=t.replace(/^[\\s\\S]*Punto debole:\\s*/,"").replace(/\\s*\\([\\s\\S]*$/,"").trim()});'
    + 'var firma=m[1]+"|"+(gm?gm[0]:"")+"|"+retry;if(firma===inviato)return;inviato=firma;'
    + 'parent.postMessage({imc:"quiz-risultato",pct:+m[1],giuste:gm?+gm[1]:null,totale:gm?+gm[2]:null,livelli:liv,debole:deb,errori:retry},"*")'
    + '}catch(e){}}new MutationObserver(leggi).observe(document.documentElement,{childList:true,subtree:true,characterData:true})})();<\/script>';

  /** Aggiunge l'osservatore alla copia del quiz (in fondo al body). */
  function inietta(html: string): string { return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, SPIA + '</body>') : html + SPIA; }

  interface Contesto { frame: HTMLIFrameElement; schedaId: string; titolo: string; }
  let ctx: Contesto | null = null;
  let ascolto = false;

  function osserva(frame: HTMLIFrameElement, schedaId: string, titolo: string): void {
    ctx = { frame, schedaId, titolo };
    if (!ascolto) { window.addEventListener('message', ricevi); ascolto = true; }
  }

  function ricevi(e: MessageEvent): void {
    const d = e.data as RisultatoQuiz;
    if (!d || d.imc !== 'quiz-risultato' || !ctx || e.source !== ctx.frame.contentWindow) return;
    if (typeof d.pct !== 'number' || d.pct < 0 || d.pct > 100) return;
    salva(ctx.schedaId, d);
  }

  /** Salva il risultato; restituisce la funzione per annullare. */
  function salva(id: string, d: RisultatoQuiz): () => void {
    const oggiK = ymd(new Date());
    const p0 = Studio.prog(id), primaProg = p0 ? JSON.parse(JSON.stringify(p0)) : null;
    const t = trovaScheda(id), idMem = t ? 'mem-sub-' + t.k : '';
    const m0 = idMem ? Stato.prendi<Rec>(idMem) : undefined, primaMem = m0 ? JSON.parse(JSON.stringify(m0)) : null;
    const quanto = d.giuste != null && d.totale != null ? d.giuste + '/' + d.totale : d.pct + '%';
    let testo: string;
    if (d.errori) {
      const riga = 'Errori rifatti ' + oggiK.slice(8, 10) + '/' + oggiK.slice(5, 7) + ': ' + quanto;
      Studio.segna(id, { nota: ((p0 && p0.nota) ? p0.nota + '\n' : '') + riga });
      testo = '📝 ' + riga + ' (annotato, il punteggio non cambia)';
    } else {
      Studio.segna(id, { fatta: true, data: oggiK, punteggio: d.pct, deboli: d.livelli && d.livelli.length ? d.livelli : undefined } as Partial<Progresso>);
      testo = '✅ Salvato ' + d.pct + '% (' + quanto + ')' + (d.debole ? ' · punto debole: ' + d.debole : '');
    }
    const annulla = () => {
      if (primaProg) Stato.salva(primaProg); else Stato.elimina('prog-' + id);
      if (idMem) { if (primaMem) Stato.salva(primaMem); else if (Stato.prendi<Rec>(idMem)) Stato.elimina(idMem); }
      avviso('Annullato: risultato non salvato.');
    };
    avviso(testo + ' · tocca per annullare', 8000, annulla);
    return annulla;
  }

  return { inietta, osserva, salva, SPIA };
})();
