// ============================================================
// 01-json.ts — v0.57 (BP6 · A15): UNICO parser JSON dell'app (risposte AI, quiz incollati, pacchetti
// .imcpack / pacchetto-studio, mappe del pianificatore). Prima c'erano tre copie divergenti
// (IA.parseJsonSicuro, Neuro.parseTollerante, Pianificatore.leggiRisposta). Modulo PURO: niente DOM né rete.
// - parseSicuro: <think>, fence, testo intorno → primo JSON bilanciato, LaTeX riparato; lancia se non c'è JSON.
// - parseTollerante: parse diretto → riparazioni (fence, virgolette tipografiche, virgole finali) → riga per riga.
// - recuperaArrayParziale: oggetti completi di un array troncato (risposta interrotta a metà).
// - leggiFile: testo di un file JSON (BOM tollerato); null se illeggibile.
// ============================================================

const JsonAI = (() => {
  /** BOM e caratteri di controllo (tranne \t \n \r) via. */
  function pulisci(raw: unknown): string { return String(raw == null ? '' : raw).replace(/^\uFEFF/, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  const togliFence = (t: string) => t.replace(/```(?:json|javascript|js)?/gi, '');

  const LATEX = new Set(('frac dfrac tfrac sqrt text textrm mathrm mathbf mathit operatorname times cdot div pm mp neq ne leq le geq ge approx sim propto infty partial nabla int sum prod lim log ln exp sin cos tan to rightarrow leftarrow Rightarrow rightleftharpoons leftrightarrow left right bar vec hat dot overline underline ' +
    'alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta Theta iota kappa lambda Lambda mu nu xi Xi pi Pi rho sigma Sigma tau upsilon phi Phi varphi chi psi Psi omega Omega degree circ ce pu quad qquad newline not in notin cup cap subset forall exists rm bf it').split(' '));
  /** Raddoppia i backslash del LaTeX SOLO dentro le stringhe JSON: `\\` già doppi, `\uXXXX` e i veri escape (\n, \t, \" …) restano. */
  function riparaLatex(t: string): string {
    return t.replace(/"(?:[^"\\]|\\.)*"/gs, s => s.replace(/\\(\\|u[0-9a-fA-F]{4}|[a-zA-Z]+|[\s\S])/g, (m, x: string) => {
      if (x === '\\' || /^u[0-9a-fA-F]{4}$/.test(x)) return m;      // già escapato · unicode valido
      if (!/^[a-zA-Z]/.test(x)) return '"/'.includes(x) ? m : '\\\\' + x;   // \" \/ validi; \( \, \[ … sono LaTeX
      if (LATEX.has(x)) return '\\\\' + x;                           // comando LaTeX intero (limite noto: \nu \tau \theta …)
      if (/^[bfnrt]/.test(x)) return m;                              // vero escape JSON seguito da testo (es. \nnuovo)
      return '\\\\' + x;                                             // \l \s \c… invalidi in JSON → LaTeX
    }));
  }
  /** Toglie <think>, fence ``` e testo intorno; estrae il PRIMO JSON bilanciato (fuori dalle stringhe), ripara il LaTeX, poi JSON.parse. */
  function parseJsonSicuro(raw: string): any {
    let t = pulisci(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/```(?:json)?/gi, '');
    const i = t.search(/[{[]/); if (i < 0) throw new Error('risposta non in JSON');
    let d = 0, s = false, e = false, j = i;
    for (; j < t.length; j++) {
      const c = t[j];
      if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
      if (c === '"') s = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) break; }
    }
    t = t.slice(i, j + 1);
    // sempre riparare prima: «\frac» è JSON valido (\f = form feed) ma va letto come LaTeX
    try { return JSON.parse(riparaLatex(t)); } catch (_) { throw new Error('risposta non in JSON valido'); }
  }

  function riparaJson(t: string): string {
    let s = togliFence(pulisci(t));
    s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const a = s.search(/[\[{]/); if (a < 0) return s.trim();
    const chiusa = s[a] === '[' ? ']' : '}', b = s.lastIndexOf(chiusa); s = s.slice(a, b >= a ? b + 1 : undefined);
    s = s.replace(/,\s*([}\]])/g, '$1');
    return s;
  }
  function parseTollerante(t: string): { ok: boolean; dati: any; riparazioni: string[] } {
    const rip: string[] = [], raw = String(t || '');
    try { return { ok: true, dati: JSON.parse(raw), riparazioni: rip }; } catch (_) { /* si ripara */ }
    if (/```/.test(raw)) rip.push('blocco markdown rimosso');
    const s = riparaJson(raw);
    if (/,\s*[}\]]/.test(raw)) rip.push('virgole finali rimosse');
    try { return { ok: true, dati: JSON.parse(s), riparazioni: rip.concat(rip.length ? [] : ['caratteri spuri rimossi']) }; } catch (_) { /* ultima prova: un oggetto per riga */ }
    const righe = s.split('\n').map(x => x.trim().replace(/,$/, '')).filter(x => /^\{.*\}$/.test(x));
    const v: unknown[] = []; for (const r of righe) { try { v.push(JSON.parse(r)); } catch (_) { /* riga scartata */ } }
    if (v.length) return { ok: true, dati: v, riparazioni: rip.concat(['letto riga per riga']) };
    return { ok: false, dati: null, riparazioni: rip };
  }
  /** Recupera gli oggetti completi di un array JSON troncato; «chiave» = nome dell'array cercato (es. 'unita'). */
  function recuperaArrayParziale(raw: string, chiave = ''): any[] {
    const s = String(raw || ''), k0 = chiave && s.indexOf(chiave) >= 0 ? s.indexOf('[', s.indexOf(chiave)) : s.indexOf('[');
    if (k0 < 0) return [];
    const out: unknown[] = []; let prof = 0, ini = -1, str = false, esc = false;
    for (let k = k0 + 1; k < s.length; k++) {
      const c = s[k];
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{') { if (prof === 0) ini = k; prof++; }
      else if (c === '}') { prof--; if (prof === 0 && ini >= 0) { try { out.push(JSON.parse(s.slice(ini, k + 1))); } catch (_) { /* oggetto rotto */ } ini = -1; } if (prof < 0) break; }
      else if (c === ']' && prof === 0) break;
    }
    return out;
  }
  /** Oggetto/array da testo AI o già oggetto: parseSicuro, poi tollerante; null se niente. */
  function leggi(r: unknown): any {
    if (r && typeof r === 'object') return r;
    try { return parseJsonSicuro(String(r || '')); } catch (_) { const p = parseTollerante(String(r || '')); return p.ok ? p.dati : null; }
  }
  /** File JSON (pacchetti, .imcpack): BOM tollerato; null se illeggibile. */
  function leggiFile(t: string): any { try { return JSON.parse(pulisci(t)); } catch (_) { const p = parseTollerante(t); return p.ok ? p.dati : null; } }

  return { pulisci, riparaLatex, parseSicuro: parseJsonSicuro, riparaJson, parseTollerante, recuperaArrayParziale, leggi, leggiFile };
})();
