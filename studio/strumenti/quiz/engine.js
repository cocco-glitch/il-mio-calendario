/* ---------- motore ---------- */
var LV=["Sbarramento","Applicativo","Trabocchetto","Problema","Completamento"],L=["A","B","C","D","E"],MAXH=2;
var app=document.getElementById("app"),P=[],cur=0,retry=false,ending=false,openX=false;
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function fmt(s){return esc(s).replace(/_\{([^}]*)\}/g,"<sub>$1</sub>").replace(/\^\{([^}]*)\}/g,"<sup>$1</sup>")}
function fmtQ(s){return fmt(s).replace(/(…+)/g,'<span style="white-space:nowrap">________</span>')}
function shuf(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function norm(s){var x=String(s).toLowerCase().replace(/−/g,"-");if(x.normalize)x=x.normalize("NFD").replace(/[̀-ͯ]/g,"");return x.replace(/\s+/g," ").trim().replace(/[.;:!]+$/,"").replace(/,/g,".")}
var NUM=/^-?\d+(\.\d+)?$/;
function match(v,acc){var a=norm(v);if(!a)return false;for(var i=0;i<acc.length;i++){var b=norm(acc[i]);if(a===b)return true;if(NUM.test(b)){var m=a.match(/^(-?\d+(?:\.\d+)?)\s*[a-z%\/]*$/);if(m&&Number(m[1])===Number(b))return true}}return false}
function done(it){return it.picked!==null}
function score(){return P.filter(function(it){return it.ok}).length}
function hintsUsed(){return P.reduce(function(s,it){return s+it.hid.length},0)}
function start(idx,isRetry){retry=!!isRetry;ending=false;openX=false;P=idx.map(function(i){var o=q.questions[i],it={i:i,q:o,picked:null,ok:null,hid:[]};if(o.t==="mcq"){var n=shuf([0,1,2,3,4]);it.ord=n;it.opts=n.map(function(u){return o.o[u]});it.correct=n.indexOf(o.c)}return it});cur=0;render();window.scrollTo(0,0)}
function meter(){var h='<div class="meter" style="--n:'+P.length+'">';P.forEach(function(it,k){var c=it.ok===null?(k===cur?"now":""):(it.ok?"ok":"bad");h+='<button type="button" class="tick '+c+(k===cur?" cur":"")+'" data-go="'+k+'" aria-label="Vai alla domanda '+(k+1)+'"></button>'});return h+"</div>"}
function figs(o){if(!o.img)return"";return o.img.map(function(g,k){return'<figure class="fig"><button type="button" data-zoom="'+k+'" aria-label="Ingrandisci immagine">'+IMG[g.s]+'</button><figcaption>'+esc(g.cap)+' · '+esc(g.f)+'</figcaption></figure>'}).join("")}
function expl(o){var x=o.x||{},h='<div class="expl" id="expl"><span class="label">Spiegazione dalle fonti</span>';(x.cit||[]).forEach(function(c){h+='<blockquote>«'+esc(c.t)+'»<span class="who">'+esc(c.f)+' · <a href="'+c.l+'" target="_blank" rel="noopener">apri la pagina</a></span></blockquote>'});if(x.cl)h+='<div class="mine"><b>Spiegazione di Claude</b>'+esc(x.cl)+'</div>';return h+"</div>"}
function steps(e){var a=Array.isArray(e)?e:[e];return'<ol class="steps">'+a.map(function(s){var m=String(s).match(/^([^:]{2,80}):\s([\s\S]*)$/);return"<li>"+(m?"<b>"+fmt(m[1])+":</b> "+fmt(m[2]):fmt(s))+"</li>"}).join("")+"</ol>"}
function wrongWhy(it){var ew=it.q.ew||[];if(it.q.t==="mcq"){if(it.picked===null)return"";var orig=it.ord[it.picked],t=ew[orig-1];return t?'<div class="wrongwhy"><b>Perché la tua risposta è sbagliata</b><p>Hai scelto «'+fmt(it.opts[it.picked])+'»: '+fmt(t)+"</p></div>":""}return ew[0]?'<div class="wrongwhy"><b>Perché la tua risposta è sbagliata</b><p>'+(it.picked!==null?"Hai scritto «"+esc(it.picked)+"». ":"")+fmt(ew[0])+"</p></div>":""}
function others(it){var ew=it.q.ew||[];if(it.q.t!=="mcq"||!ew.length)return"";return'<details class="others"><summary>Perché le altre opzioni sono sbagliate</summary><div class="inner">'+ew.map(function(t,k){return"<p><b>«"+fmt(it.q.o[k+1])+"»</b> — "+fmt(t)+"</p>"}).join("")+"</div></details>"}
function corr(it){return steps(it.q.e)+(it.ok?others(it):(it.picked===null?others(it):wrongWhy(it)))}
function why(it){var g=it.q.t==="mcq"?L[it.correct]:it.q.show;return'<div class="why" id="why"><span class="label">Correzione passo-passo</span><p class="verdict '+(it.ok?"ok":"bad")+'">'+(it.ok?"Corretto.":(it.q.t==="mcq"?"Non corretto: la risposta giusta è "+g+".":"Non corretto: la risposta attesa è «"+fmt(g)+"»."))+"</p>"+corr(it)+"</div>"}
function unanswered(){var u=[];P.forEach(function(it,k){if(!done(it))u.push(k)});return u}
function render(){
 var it=P[cur],a=done(it),mc=it.q.t==="mcq";
 var h=meter()+'<div class="stat"><span>Domanda <b>'+(cur+1)+"</b> di "+P.length+(retry?" · ripasso errori":"")+'</span><span>Punteggio <b>'+score()+'</b> · Suggerimenti <b>'+hintsUsed()+"</b></span></div>";
 h+='<section class="card"><div class="qhead"><span class="badge lv-'+it.q.lv+'">'+it.q.lv+"</span><span>"+(mc?"Risposta multipla":"A completamento")+"</span></div>";
 h+=figs(it.q);
 h+='<p class="question">'+(mc?fmt(it.q.q):fmtQ(it.q.q))+"</p>";
 h+='<div class="tools">';
 if(mc){var left=MAXH-it.hid.length;h+='<button type="button" class="tool" id="hintbtn"'+(a||left<=0?" disabled":"")+'>💡 Suggerimento ('+left+')</button>'}
 h+='<button type="button" class="tool'+(openX?" on":"")+'" id="explbtn" aria-expanded="'+openX+'">📖 Spiegazione</button></div>';
 if(openX)h+=expl(it.q);
 if(mc){h+='<div class="opts">';it.opts.forEach(function(t,k){var c="opt",tag="",off=it.hid.indexOf(k)>=0;if(a){if(k===it.correct){c+=" ok";tag='<span class="tag">Risposta corretta</span>'}else if(k===it.picked){c+=" bad";tag='<span class="tag">La tua risposta</span>'}else c+=" dim"}if(off&&!(a&&k===it.correct))c+=" off";h+='<button type="button" class="'+c+'" data-k="'+k+'"'+(a||off?" disabled":"")+(off?' aria-label="Risposta esclusa dal suggerimento"':"")+'><span class="key">'+L[k]+'</span><span class="txt">'+fmt(t)+tag+"</span></button>"});h+="</div>"}
 else h+='<form class="fillform" id="fillform" autocomplete="off" novalidate><label for="ans">La tua risposta</label><input id="ans" type="text" enterkeyhint="done" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"'+(a?' disabled class="'+(it.ok?"ok":"bad")+'" value="'+esc(it.picked)+'"':"")+">"+(a?"":'<p class="hint" id="hint">Scrivi la parola o il numero che completa la frase. Maiuscole e accenti non contano.</p><button type="submit" class="btn">Verifica</button>')+"</form>";
 if(a)h+=why(it);
 if(ending){var u=unanswered();h+='<div class="warnbox" id="warnbox"><p><b>Hai '+u.length+(u.length===1?" domanda":" domande")+' senza risposta</b> (n. '+u.map(function(k){return k+1}).join(", ")+'). Se chiudi ora contano come errate.</p><button type="button" class="btn" id="gofirst">Vai alla prima senza risposta</button><button type="button" class="btn ghost" id="finish">Chiudi comunque e vedi il risultato</button></div>'}
 var last=cur===P.length-1;
 h+='<div class="nav"><button type="button" class="btn ghost" id="prev"'+(cur===0?" disabled":"")+'>◀ Indietro</button><button type="button" class="btn'+(a?"":" ghost")+'" id="next">'+(last?"Vedi il risultato":(a?"Avanti ▶":"Salta ▶"))+"</button></div></section>";
 app.innerHTML=h;
 if(a){var w=document.getElementById("why");if(w&&w.scrollIntoView)w.scrollIntoView({block:"nearest",behavior:"auto"})}
 else if(!mc&&!ending){var inp=document.getElementById("ans");if(inp)inp.focus({preventScroll:true})}
 if(ending){var wb=document.getElementById("warnbox");if(wb&&wb.scrollIntoView)wb.scrollIntoView({block:"nearest"})}
}
function go(k){if(k<0||k>=P.length)return;cur=k;ending=false;openX=false;render();window.scrollTo(0,0)}
function next(){if(cur===P.length-1){if(unanswered().length){ending=true;render()}else final()}else go(cur+1)}
function pick(k){var it=P[cur];if(!it||done(it)||it.q.t!=="mcq"||it.hid.indexOf(k)>=0)return;it.picked=k;it.ok=k===it.correct;render()}
function fill(v){var it=P[cur];if(!it||done(it)||it.q.t!=="fill")return;if(!norm(v)){var hn=document.getElementById("hint");if(hn)hn.textContent="Scrivi una risposta prima di verificare.";return}it.picked=v.trim();it.ok=match(v,it.q.a);render()}
function hint(){var it=P[cur];if(!it||done(it)||it.q.t!=="mcq"||it.hid.length>=MAXH)return;var pool=[];for(var k=0;k<5;k++)if(k!==it.correct&&it.hid.indexOf(k)<0)pool.push(k);if(!pool.length)return;it.hid.push(pool[Math.floor(Math.random()*pool.length)]);render()}
function zoom(k){var g=P[cur].q.img[k];var d=document.createElement("div");d.className="zoom";d.innerHTML='<div class="box">'+IMG[g.s]+"</div>";d.addEventListener("click",function(){d.remove()});document.body.appendChild(d)}
function final(){
 ending=false;P.forEach(function(it){if(!done(it))it.ok=false});
 var n=P.length,s=score(),pc=Math.round(s*100/n),msg=pc>=90?"Ottimo: i concetti sono solidi.":pc>=70?"Buono: guarda gli errori qui sotto e rifai il quiz.":pc>=50?"Da consolidare: rileggi la teoria dello step e rifai gli errori.":"Da rivedere: riparti dalla teoria dello step prima di riprovare.";
 var mt='<div class="meter" style="--n:'+n+'">';P.forEach(function(it){mt+='<span class="tick '+(it.ok?"ok":"bad")+'"></span>'});mt+="</div>";
 var hu=hintsUsed(),hq=P.filter(function(it){return it.hid.length}).length;
 var h=mt+'<section class="card"><div class="score"><div class="big">'+s+"<small> / "+n+'</small></div><div class="pct">'+pc+'% di risposte corrette</div><p class="msg">'+msg+"</p></div>";
 h+='<div class="levels"><h2>Per tipo di domanda</h2>';
 LV.forEach(function(t){var r=0,ok=0;P.forEach(function(it){if(it.q.lv===t){r++;if(it.ok)ok++}});if(r)h+='<div class="lvrow"><span>'+t+'</span><span class="bar"><span class="fill" style="display:block;width:'+Math.round(ok*100/r)+'%"></span></span><span class="n">'+ok+"/"+r+"</span></div>"});
 var wk=null;LV.forEach(function(t){var r=0,b=0;P.forEach(function(it){if(it.q.lv===t){r++;if(!it.ok)b++}});if(b){var rt=b/r;if(!wk||rt>wk.rate||(rt===wk.rate&&b>wk.bad))wk={lv:t,bad:b,tot:r,rate:rt}}});
 h+=wk?'<p class="weak"><b>Punto debole:</b> '+wk.lv+" ("+wk.bad+" errori su "+wk.tot+", "+Math.round(wk.rate*100)+"%)</p>":'<p class="weak"><b>Nessun punto debole:</b> tutti i tipi di domanda sono corretti.</p>';
 h+='<p class="weak"><b>Suggerimenti usati:</b> '+hu+(hu?" (su "+hq+(hq===1?" domanda)":" domande)"):"")+"</p></div>";
 var bad=P.filter(function(it){return!it.ok});
 if(bad.length){h+='<div class="review"><h2>Da rivedere ('+bad.length+")</h2>";bad.forEach(function(it){var mine=it.picked===null?"— (senza risposta)":(it.q.t==="mcq"?fmt(it.opts[it.picked]):esc(it.picked)),good=it.q.t==="mcq"?fmt(it.opts[it.correct]):fmt(it.q.show);h+="<details><summary>"+(it.q.t==="mcq"?fmt(it.q.q):fmtQ(it.q.q))+'</summary><div class="inner"><p class="pair"><b class="w">La tua risposta:</b> '+mine+'</p><p class="pair"><b class="r">Risposta corretta:</b> '+good+"</p>"+corr(it)+'<p class="pair">Ripassa: '+esc(it.q.r)+"</p></div></details>"});h+="</div>";
  var cnt={},ord=[];bad.forEach(function(it){var r=it.q.r;if(!cnt[r]){cnt[r]=0;ord.push(r)}cnt[r]++});
  h+='<div class="review"><h2>Cosa ripassare</h2>';ord.forEach(function(r){h+='<p class="pair"><b>'+cnt[r]+(cnt[r]===1?" errore":" errori")+":</b> "+esc(r)+'<span class="lk">'+(M[r]||[]).map(function(x){return'<a href="'+x[1]+'" target="_blank" rel="noopener">📄 '+esc(x[0])+"</a>"}).join("")+"</span></p>"});h+="</div>"}
 h+='<div class="actions">'+(bad.length?'<button type="button" class="btn" id="retry">Rifai solo gli errori</button>':"")+'<button type="button" class="btn'+(bad.length?" ghost":"")+'" id="again">Rifai tutto il quiz</button></div></section>';
 app.innerHTML=h;window.scrollTo(0,0);
}
app.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button"):null;if(!b)return;
 if(b.hasAttribute("data-zoom"))return zoom(+b.getAttribute("data-zoom"));
 if(b.hasAttribute("data-go"))return go(+b.getAttribute("data-go"));
 if(b.classList.contains("opt"))return pick(+b.getAttribute("data-k"));
 switch(b.id){case"prev":go(cur-1);break;case"next":next();break;case"hintbtn":hint();break;case"explbtn":openX=!openX;render();break;
 case"gofirst":go(unanswered()[0]);break;case"finish":final();break;
 case"again":start(q.questions.map(function(_,i){return i}),false);break;
 case"retry":start(P.filter(function(it){return!it.ok}).map(function(it){return it.i}),true);break}});
app.addEventListener("submit",function(e){e.preventDefault();var i=document.getElementById("ans");if(i)fill(i.value)});
document.addEventListener("keydown",function(e){if(e.metaKey||e.ctrlKey||e.altKey)return;var tg=e.target&&e.target.tagName;if(tg==="INPUT"||tg==="TEXTAREA")return;var it=P[cur];if(!it||!app.querySelector(".card .nav"))return;
 if(it.q.t==="mcq"&&!done(it)&&e.key.length===1){var o="abcde".indexOf(e.key.toLowerCase());if(o<0&&/^[1-5]$/.test(e.key))o=+e.key-1;if(o>=0){pick(o);return}}
 if(e.key==="ArrowRight")next();else if(e.key==="ArrowLeft")go(cur-1)});
start(q.questions.map(function(_,i){return i}),false);
})();
