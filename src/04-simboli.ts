// ============================================================
// 04-simboli.ts — v0.34: niente emoji nell'interfaccia.
// Gli emoji usati nei testi dei pulsanti/titoli vengono sostituiti al volo
// da icone vettoriali (stesso tratto delle icone della barra), così l'app
// ha un aspetto coerente e professionale. I testi scritti dall'utente
// (campi, note, appunti) non vengono toccati.
// ============================================================

Object.assign(ICONE, {
  ai: '<path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7z"/><path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  cervello: '<path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a3 3 0 0 0-2 5.2A3 3 0 0 0 7.5 17 2.5 2.5 0 0 0 12 18.5v-12a2.5 2.5 0 0 0-2.5-2z"/><path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.8 2.5 2.5 0 0 1-4.5 1.5"/>',
  avvertenza: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  quiz: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 3h6v3H9zM8.5 13l2.3 2.3 4.7-4.8"/>',
  nuvola: '<path d="M7 18.5a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.6a4.5 4.5 0 0 1-.6 8.9z"/>',
  fatto: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.9-5.3"/>',
  ghiaccio: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
  matita: '<path d="M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5z"/><path d="M14 6.5l3.5 3.5"/>',
  cestino: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
  traguardo: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 3.5M16 6h2.5a2.5 2.5 0 0 1-2.6 3.5M12 13v4M8.5 20h7"/>',
  voce: '<path d="M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  dado: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" stroke-width="2.6"/>',
  sveglia: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.3 1.6M5 4.5L3 6.5M19 4.5l2 2"/>',
  libri: '<path d="M4.5 4.5h4v15h-4zM10.5 4.5h4v15h-4zM16 5.3l3-.8 3 14.2-3 .8z"/>',
  libro: '<path d="M3.5 5.5H9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5h-6zM20.5 5.5H15a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5h6z"/>',
  pollice: '<path d="M7.5 10.5v9h-3v-9zM7.5 10.5L11 4a2 2 0 0 1 3 2l-.8 4h5.3a2 2 0 0 1 2 2.4l-1.4 6a2 2 0 0 1-2 1.6H7.5"/>',
  luna: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
  cronometro: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5M10 2.5h4M18 6.5l1.5-1.5"/>',
  stella: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 12.5v1.5M14.5 12.5v1.5M2.5 13v2M21.5 13v2"/>',
  tazza: '<path d="M4.5 9h11v5.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM15.5 10.5h1.8a2.3 2.3 0 0 1 0 4.6h-1.8M8 3.5v2.5M12 3.5v2.5"/>',
  graffetta: '<path d="M19.5 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.6-7.6"/>',
  collega: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  occhio: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  nascondi: '<path d="M3.5 3.5l17 17M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.9 3.4M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6a8.6 8.6 0 0 0 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  modello: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M10 9.5V20"/>',
  documento: '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14.5 3.5v4h4"/>',
  cartella: '<path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>',
  tassello: '<path d="M10 4.5a2 2 0 0 1 4 0v1.5h4v4h-1.5a2 2 0 0 0 0 4H18v4h-4v-1.5a2 2 0 0 0-4 0V18H6v-4h1.5a2 2 0 0 0 0-4H6V6h4z"/>',
  provetta: '<path d="M9 3.5h6M10 3.5v6l-5 8.6a1.8 1.8 0 0 0 1.6 2.4h10.8a1.8 1.8 0 0 0 1.6-2.4L14 9.5v-6M7.2 15h9.6"/>',
  dito: '<path d="M9.5 11.5V5a1.8 1.8 0 0 1 3.6 0v6l3.6.9a2 2 0 0 1 1.5 2.3l-.8 4.4a2.5 2.5 0 0 1-2.4 2h-3.6a2.5 2.5 0 0 1-2.1-1.2l-2.6-4a1.4 1.4 0 0 1 2.3-1.6l.5.7"/>',
  tastiera: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10" stroke-width="2"/>',
  lampadina: '<path d="M9.5 18h5M10.5 21h3M12 3.5A5.8 5.8 0 0 0 8.2 13.7c.6.6.8 1.4.8 2.3h6c0-.9.2-1.7.8-2.3A5.8 5.8 0 0 0 12 3.5z"/>',
  salvagente: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M9.5 14.5L6 18"/>',
  bersaglio: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  grafico: '<path d="M5 19.5v-8M10 19.5v-14M15 19.5v-6M20 19.5v-10M3 19.5h18"/>',
  ingranaggio: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  spunta: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  penna: '<path d="M12.5 19.5l7-7 2 2-7 7zM18 13.5l-1.5-7L3 3l3.5 13.5 7 1.5zM3 3l7.3 7.3"/><circle cx="11.5" cy="11.5" r="1.5"/>',
  evidenziatore: '<path d="M9 15.5l-4.5 4.5h5.5l1.5-1.5M9 15.5l7-11 4.5 3-7 11z"/>',
  gomma: '<path d="M7.5 20.5h12M4.5 14.5l9-9a1.5 1.5 0 0 1 2 0l3 3a1.5 1.5 0 0 1 0 2l-9 9.5H8z"/><path d="M9 10l5 5"/>',
  lazo: '<ellipse cx="12" cy="9.5" rx="8.5" ry="5.5" stroke-dasharray="3 2.5"/><path d="M9.5 15c-1 1.8-.4 3.5 1.5 5"/>',
  immagine: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9.5 8.5"/>',
  telefono: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  carte: '<rect x="3.5" y="6" width="11" height="14" rx="2"/><path d="M9 4.5l9.5 2.3a1.6 1.6 0 0 1 1.2 2l-2.5 10.3"/>',
  play: '<path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7z" fill="currentColor"/>',
  pausa: '<path d="M8.5 5v14M15.5 5v14" stroke-width="2.6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  carica: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 14.5v5h15v-5"/>',
});

/** emoji → icona (null = l'emoji viene solo tolto, es. le faccine dei voti). */
const SIMBOLI: Record<string, string | null> = {
  '✨': 'ai', '🧠': 'cervello', '⚠': 'avvertenza', '📝': 'quiz', '☁': 'nuvola', '✅': 'fatto', '🧊': 'ghiaccio',
  '✏': 'matita', '✍': 'matita', '🗑': 'cestino', '🎉': 'traguardo', '🗣': 'voce', '➕': 'piu', '🎲': 'dado', '⏰': 'sveglia',
  '📚': 'libri', '📖': 'libro', '👍': 'pollice', '🌙': 'luna', '⏱': 'cronometro', '🎓': 'studio', '🤖': 'robot', '☕': 'tazza',
  '🔁': 'ripeti', '🔄': 'ripeti', '📎': 'graffetta', '🔗': 'collega', '👁': 'occhio', '🙈': 'nascondi', '📑': 'modello', '📄': 'documento',
  '📁': 'cartella', '📂': 'cartella', '🧩': 'tassello', '📋': 'appunti', '🧪': 'provetta', '☝': 'dito', '⌨': 'tastiera', '💡': 'lampadina',
  '🛟': 'salvagente', '🔎': 'cerca', '🔍': 'cerca', '🎯': 'bersaglio', '📊': 'grafico', '⚙': 'ingranaggio', '☑': 'spunta', '✒': 'penna',
  '🖍': 'evidenziatore', '🧽': 'gomma', '➰': 'lazo', '🖼': 'immagine', '📱': 'telefono', '📤': 'carica', '🔔': 'campana', '★': 'stella', '⭐': 'stella', '🃏': 'carte', '▶': 'play', '⏸': 'pausa', '⏹': 'stop',
  '😵': null, '😕': null, '😐': null, '🙂': null, '🔥': null, '😌': null,
};
const RE_SIMBOLI = new RegExp('(' + Object.keys(SIMBOLI).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?\\s?', 'gu');
/** Dove NON sostituire: testo dell'utente. */
const ZONE_UTENTE = 'textarea, input, [contenteditable], .md, .testo-utente, .nota-estratto, .cornell-testo, pre, code';

function sostituisciSimboli(radice: Node): void {
  const el = radice.nodeType === 1 ? radice as Element : radice.parentElement;
  if (!el || el.closest(ZONE_UTENTE)) return;
  const testi: Text[] = [];
  if (radice.nodeType === 3) testi.push(radice as Text);
  else {
    const w = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) testi.push(n as Text);
  }
  for (const t of testi) {
    const v = t.nodeValue || '';
    RE_SIMBOLI.lastIndex = 0;
    if (!RE_SIMBOLI.test(v)) continue;
    const p = t.parentElement;
    if (!p || p.closest(ZONE_UTENTE) || p.closest('svg, option, title')) continue;
    if (p.tagName === 'OPTION') { t.nodeValue = v.replace(RE_SIMBOLI, ''); continue; }
    const fr = document.createDocumentFragment();
    let ultimo = 0;
    RE_SIMBOLI.lastIndex = 0;
    for (let m = RE_SIMBOLI.exec(v); m; m = RE_SIMBOLI.exec(v)) {
      if (m.index > ultimo) fr.appendChild(document.createTextNode(v.slice(ultimo, m.index)));
      const nome = SIMBOLI[m[1]];
      if (nome) {
        const ic = icona(nome, 18); ic.classList.add('sim');
        fr.appendChild(ic);
        if (m[0].length > m[1].length && m.index + m[0].length < v.length) fr.appendChild(document.createTextNode(' '));
      }
      ultimo = m.index + m[0].length;
    }
    if (ultimo < v.length) fr.appendChild(document.createTextNode(v.slice(ultimo)));
    // pulsante che era solo un emoji: gli do un nome accessibile dal title
    const btn = p.closest('button');
    if (btn && !btn.getAttribute('aria-label') && btn.getAttribute('title') && !(btn.textContent || '').replace(RE_SIMBOLI, '').trim()) btn.setAttribute('aria-label', btn.getAttribute('title')!);
    p.replaceChild(fr, t);
  }
}

function attivaSimboli(): void {
  sostituisciSimboli(document.body);
  new MutationObserver(lista => {
    for (const m of lista) {
      if (m.type === 'characterData') sostituisciSimboli(m.target);
      else m.addedNodes.forEach(n => { if (n.nodeType === 1 || n.nodeType === 3) sostituisciSimboli(n); });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
