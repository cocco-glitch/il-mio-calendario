// ============================================================
// 08-lungo.ts — v0.35: "tieni premuto" (come il tocco prolungato di iOS).
// Un pulsante tenuto premuto ~0,45 s si "solleva" e apre un menu di
// scorciatoie collegate a quello che rappresenta. Il tocco normale resta
// invariato. Le voci sono costruite al momento, così sono sempre attuali.
// ============================================================

type VoceLungo = { t: string; ic?: string; f: () => void; sotto?: string; pericolo?: boolean };

let lungoAppena = -1e9;   // per ignorare il "click" che segue un tocco prolungato
document.addEventListener('click', e => { if (performance.now() - lungoAppena < 500) { e.preventDefault(); e.stopPropagation(); } }, true);

function lungo<T extends HTMLElement>(el: T, voci: () => (VoceLungo | null)[], titolo?: string): T {
  let timer = 0, x0 = 0, y0 = 0;
  const annulla = () => { clearTimeout(timer); timer = 0; el.classList.remove('premendo'); };
  el.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    x0 = e.clientX; y0 = e.clientY;
    el.classList.add('premendo');
    timer = window.setTimeout(() => {
      timer = 0; el.classList.remove('premendo');
      lungoAppena = performance.now();
      apriMenuLungo(el, voci().filter(Boolean) as VoceLungo[], titolo);
    }, 450);
  });
  el.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) annulla(); });
  el.addEventListener('pointerup', annulla); el.addEventListener('pointercancel', annulla); el.addEventListener('pointerleave', annulla);
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (!timer && performance.now() - lungoAppena > 600) { lungoAppena = performance.now(); apriMenuLungo(el, voci().filter(Boolean) as VoceLungo[], titolo); } });
  el.classList.add('ha-lungo');
  return el;
}

function apriMenuLungo(da: HTMLElement, voci: VoceLungo[], titolo?: string): void {
  if (!voci.length) return;
  document.querySelectorAll('.lungo-sfondo').forEach(x => x.remove());
  Tocco.clic(1.2);
  const r = da.getBoundingClientRect();
  const chiudi = () => { sfondo.classList.add('esce'); setTimeout(() => sfondo.remove(), 160); };
  const menu = h('div.lungo-menu', { role: 'menu' },
    titolo ? h('div.lungo-tit', null, titolo) : null,
    voci.map((v, i) => h('button.lungo-voce' + (v.pericolo ? '.pericolo' : ''), { role: 'menuitem', style: { animationDelay: (i * 22) + 'ms' }, onclick: () => { chiudi(); setTimeout(v.f, 60); } },
      h('span.voce-corpo', null, h('span.lungo-t', null, v.t), v.sotto ? h('span.lungo-s', null, v.sotto) : null),
      v.ic ? icona(v.ic, 18) : null)));
  const sfondo = h('div.lungo-sfondo', { onclick: (e: Event) => { if (e.target === sfondo) chiudi(); } }, menu);
  document.body.appendChild(sfondo);
  // posizione: vicino al pulsante, dentro lo schermo
  const mw = Math.min(280, innerWidth - 24), mh = menu.offsetHeight;
  const sotto = r.bottom + 8 + mh < innerHeight - 12;
  menu.style.width = mw + 'px';
  menu.style.left = Math.max(12, Math.min(innerWidth - mw - 12, r.left + r.width / 2 - mw / 2)) + 'px';
  menu.style.top = (sotto ? r.bottom + 8 : Math.max(12, r.top - mh - 8)) + 'px';
  menu.style.transformOrigin = (r.left + r.width / 2 - parseFloat(menu.style.left)) + 'px ' + (sotto ? '0' : '100%');
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { chiudi(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  (menu.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
}

// ---------- I menu collegati ----------
const MenuLungo = {
  sezione(s: Scheda): VoceLungo[] {
    const vaiStudio = (v: typeof UI.studioVista) => () => { UI.studioVista = v; UI.studioSub = null; vai('studio'); };
    switch (s) {
      case 'oggi': return [
        { t: 'Studia ora', ic: 'play', f: () => apriStudiaOra() },
        { t: 'Nuovo evento o promemoria', ic: 'piu', f: () => apriNuovo() },
        { t: 'Chiudi la giornata', ic: 'luna', f: () => apriChiusura() },
      ];
      case 'cal': return (['giorno', 'settimana', 'mese', 'agenda'] as VistaCal[]).map(v => ({ t: maiuscola(v), ic: 'cal', f: () => { UI.data = oggi(); vai('cal', v); } }))
        .concat([{ t: 'Nuovo evento', ic: 'piu', f: () => apriNuovo() }]);
      case 'studio': return [
        { t: 'Schede dello step', ic: 'quiz', f: vaiStudio('schede') }, { t: 'Flashcard', ic: 'carte', f: vaiStudio('carte') },
        { t: 'Piano', ic: 'cal', f: vaiStudio('piano') }, { t: 'Errori da rivedere', ic: 'avvertenza', f: vaiStudio('errori') },
        { t: 'Statistiche', ic: 'grafico', f: vaiStudio('statistiche') }, { t: 'Esami', ic: 'bersaglio', f: vaiStudio('esami') },
      ];
      case 'appunti': {
        const ult = Appunti.tutti().slice().sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 3);
        return [{ t: 'Nuovo appunto', ic: 'piu', f: () => { vai('appunti'); apriAppunto(); } } as VoceLungo]
          .concat(ult.map((a: any) => ({ t: a.titolo || '(senza titolo)', sotto: 'Ultimo modificato', ic: 'documento', f: () => { vai('appunti'); apriAppunto(a); } })));
      }
      case 'altro': return [
        { t: 'Promemoria', ic: 'task', f: () => vai('task') }, { t: 'Note', ic: 'note', f: () => vai('note') },
        { t: 'Aspetto', ic: 'ingranaggio', f: () => { UI.altroSez = 'aspetto'; vai('altro'); } },
        { t: 'Studio e AI', ic: 'ai', f: () => { UI.altroSez = 'studio'; vai('altro'); } },
        Drive.collegato ? { t: 'Sincronizza ora', ic: 'nuvola', f: () => Drive.sincronizza(false) } : { t: 'Collega Google Drive', ic: 'nuvola', f: () => Drive.login() },
      ] as VoceLungo[];
    }
    return [];
  },
  /** una voce del piano (es. Chi 2.2): tutto ciò che è collegato a quello step */
  step(k: string): VoceLungo[] {
    const t = Studio.trovaSotto(k.replace(/^G2-/, '')); if (!t) return [];
    const et = Studio.etichetta(t.sub.k);
    const mz = Carte.mazzi().filter(m => m.sub === t.sub.k);
    const ap = Appunti.tutti().filter(a => a.sub === t.sub.k);
    return [
      { t: 'Apri ' + et, ic: 'quiz', f: () => { UI.studioSub = t.sub.k; UI.studioVista = 'schede'; UI.studioStep = t.pk.id; vai('studio'); } },
      { t: 'Avvia timer', sotto: '25 min su ' + et, ic: 'cronometro', f: () => Timer.avvia({ m: materiaDi(t.sub.k), k: t.sub.k, titolo: et }) },
      mz.length ? { t: 'Flashcard dello step', sotto: Carte.conta(mz.map(m => m.id)) + ' carte', ic: 'carte', f: () => { UI.studioVista = 'carte'; UI.studioSub = null; vai('studio'); } } : null,
      ap.length ? { t: 'Appunto: ' + (ap[0].titolo || et), ic: 'documento', f: () => apriAppunto(ap[0]) } : { t: 'Nuovo appunto su ' + et, ic: 'piu', f: () => apriAppunto(undefined, { sub: t.sub.k }) },
      { t: 'Errori di questo step', ic: 'avvertenza', f: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } },
    ].filter(Boolean) as VoceLungo[];
  },
  esame(): VoceLungo[] {
    const vs = (v: typeof UI.studioVista) => () => { UI.studioVista = v; UI.studioSub = null; vai('studio'); };
    return [
      { t: 'Simulazione d\'esame', ic: 'cronometro', f: () => apriSimulazioni() },
      { t: 'Errori da rivedere', ic: 'avvertenza', f: vs('errori') },
      { t: 'Statistiche', ic: 'grafico', f: vs('statistiche') },
      { t: 'Ripianifica i ritardi', ic: 'ripeti', f: () => apriRipianifica() },
    ];
  },
};
