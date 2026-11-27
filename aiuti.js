"use strict";
const Aiuti = (() => {
    const ELENCO = [
        { id: 'adesso', dove: ['oggi'], sel: '.adesso .btn.studia-ora', testo: 'Tocca per iniziare. Tieni premuto per le altre scelte: flashcard, errori, simulazione.' },
        { id: 'barra', dove: ['oggi'], sel: '.tabbar button[aria-current="page"]', testo: 'Tieni premuta una sezione della barra per aprire le sue scorciatoie.' },
        { id: 'modoesame', dove: ['oggi'], sel: '.oggi-modo .btn-testo', testo: '«Mostra tutto» spegne la Modalità esame e riporta in Oggi tutti i riquadri. La riaccendi da Altro › Aspetto.' },
        { id: 'ripianifica', dove: ['oggi', 'studio'], sel: '.ripianifica', testo: 'Ripianifica sposta gli step rimasti indietro nei prossimi giorni liberi del piano.' },
        { id: 'step', dove: ['studio'], sel: '.selettore-step', testo: 'Qui cambi step o crei un nuovo corso.' },
        { id: 'centro', dove: ['studio'], sel: '.segmenti .cq-studio[title^="Crea i quiz"]', testo: 'Il Centro di creazione prepara i quiz di uno step con l’AI, passo per passo.', scorri: true },
    ];
    let giaMostrato = false;
    const visti = () => imp().aiutiVisti || [];
    function segna(id) {
        const i = imp();
        if ((i.aiutiVisti || []).includes(id))
            return;
        i.aiutiVisti = [...(i.aiutiVisti || []), id];
        Stato.salva(i, true);
    }
    function ancora(a) {
        const el = document.querySelector(a.sel);
        if (!el || !el.offsetParent)
            return null;
        if (a.scorri)
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect(), barra = document.querySelector('.tabbar');
        const basso = barra && !a.sel.startsWith('.tabbar') ? barra.getBoundingClientRect().top : innerHeight;
        return r.width && r.top >= 0 && r.bottom <= basso && r.left >= 0 && r.right <= innerWidth ? el : null;
    }
    function chiudi() { document.querySelectorAll('.aiuto').forEach(x => x.remove()); }
    function apri(lista, k) {
        chiudi();
        const [a, el] = lista[k], ultimo = k === lista.length - 1;
        const app = document.getElementById('app'), z = parseFloat(getComputedStyle(app).zoom) || 1;
        const fine = () => { document.removeEventListener('keydown', esc); el.removeEventListener('pointerdown', fine); segna(a.id); chiudi(); };
        const esc = (e) => { if (e.key === 'Escape')
            fine(); };
        const avanti = h('button.btn.piccolo', { type: 'button', onclick: () => { fine(); if (!ultimo)
                apri(lista, k + 1); } }, ultimo ? 'Ho capito' : 'Avanti');
        const b = h('div.aiuto', { role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Suggerimento', 'data-aiuto': a.id }, h('p', null, a.testo), h('div.aiuto-piede', null, lista.length > 1 ? h('span.tenue.piccolo', null, (k + 1) + ' di ' + lista.length) : null, avanti));
        app.appendChild(b);
        const r = el.getBoundingClientRect(), w = b.offsetWidth, hh = b.offsetHeight;
        const sotto = r.bottom + 12 + hh < innerHeight - 8, x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        b.classList.add(sotto ? 'sotto' : 'sopra');
        b.style.left = x / z + 'px';
        b.style.top = (sotto ? r.bottom + 12 : r.top - hh - 12) / z + 'px';
        b.style.setProperty('--freccia', Math.max(16, Math.min(w - 16, r.left + r.width / 2 - x)) / z + 'px');
        document.addEventListener('keydown', esc);
        el.addEventListener('pointerdown', fine, { passive: true });
    }
    return {
        ELENCO,
        dopo(s, nuova) {
            if (nuova)
                giaMostrato = false;
            if (s !== UI.scheda || giaMostrato || document.querySelector('.aiuto, .foglio, .lungo-sfondo'))
                return;
            const v = visti();
            for (const a of ELENCO)
                if (a.dove.includes(s) && !v.includes(a.id)) {
                    const el = ancora(a);
                    if (el) {
                        giaMostrato = true;
                        apri([[a, el]], 0);
                        return;
                    }
                }
        },
        mostra() {
            const lista = ELENCO.filter(a => a.dove.includes(UI.scheda)).map(a => [a, ancora(a)]).filter((x) => !!x[1]);
            if (lista.length) {
                giaMostrato = true;
                apri(lista, 0);
            }
            else
                avviso('Su questa schermata non ci sono suggerimenti.');
        },
    };
})();
