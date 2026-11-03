(() => {
  'use strict';

  const PRODUCTS=['Stryktipset','Europatipset'];
  const SIGNS=['1','X','2'];
  const STORAGE_KEY='tips-reduceraren-v2';
  const LEGACY_KEY='stryktips-reduceraren-v1';
  const THEME_KEY='tips-reduceraren-theme';
  const MAX_ROWS=10000;
  const POOL_SIZE=12000;
  const $=id=>document.getElementById(id);
  const format=n=>new Intl.NumberFormat('sv-SE').format(n);
  const id=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);

  function newProduct(){
    return {
      matches:Array.from({length:13},(_,i)=>({name:'',signs:i<6?['1','X']:['1'],weights:[]})),
      global:{'1':{min:0,max:13},'X':{min:0,max:4},'2':{min:0,max:3}},
      rules:[],target:40,drawNumber:null
    };
  }
  function numberInRange(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback}
  function normalizeProduct(raw){
    if(!raw||!Array.isArray(raw.matches)||raw.matches.length!==13)throw Error('Upplägget måste ha 13 matcher.');
    const matches=raw.matches.map(m=>{
      const signs=SIGNS.filter(s=>Array.isArray(m?.signs)&&m.signs.includes(s));
      return {name:String(m?.name||'').slice(0,100),signs,weights:SIGNS.filter(s=>signs.includes(s)&&Array.isArray(m?.weights)&&m.weights.includes(s))};
    });
    const global={};for(const s of SIGNS){const r=raw.global?.[s]||{};global[s]={min:numberInRange(r.min,0,0,13),max:numberInRange(r.max,13,0,13)}}
    const rules=(Array.isArray(raw.rules)?raw.rules:[]).slice(0,50).map(r=>({id:String(r.id||id()),name:String(r.name||'Egen regel').slice(0,80),matches:String(r.matches||'').slice(0,100),signs:SIGNS.filter(s=>Array.isArray(r.signs)&&r.signs.includes(s)),min:numberInRange(r.min,0,0,13),max:numberInRange(r.max,13,0,13)}));
    return {matches,global,rules,target:numberInRange(raw.target,40,1,MAX_ROWS),drawNumber:raw.drawNumber!=null&&Number.isInteger(Number(raw.drawNumber))?Number(raw.drawNumber):null};
  }
  function normalizeState(raw){
    if(raw?.products){return {activeProduct:PRODUCTS.includes(raw.activeProduct)?raw.activeProduct:PRODUCTS[0],products:Object.fromEntries(PRODUCTS.map(name=>[name,raw.products[name]?normalizeProduct(raw.products[name]):newProduct()]))}}
    return {activeProduct:PRODUCTS[0],products:{Stryktipset:normalizeProduct(raw),Europatipset:newProduct()}};
  }
  function readState(){
    try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)return normalizeState(JSON.parse(raw))}catch{}
    try{const raw=localStorage.getItem(LEGACY_KEY);if(raw)return normalizeState(JSON.parse(raw))}catch{}
    return {activeProduct:PRODUCTS[0],products:{Stryktipset:newProduct(),Europatipset:newProduct()}};
  }
  let app=readState();
  let fixtures={};
  let fixtureStatus='loading';
  let result=null,busy=false,runId=0;
  const current=()=>app.products[app.activeProduct];
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(app))}catch{}}
  function status(message,kind=''){const el=$('status');el.textContent=message;el.className='status'+(kind?' '+kind:'')}
  function invalidate(message='Inställningarna har ändrats. Skapa rader igen.'){
    if(busy)runId++;
    result=null;$('download').disabled=true;$('copy').disabled=true;
    $('eligible').textContent='—';$('count').textContent='—';$('price').textContent='—';
    $('preview').textContent='Inga rader skapade ännu.';
    status(message);persist();
  }

  function renderHeader(){
    document.documentElement.dataset.product=app.activeProduct==='Europatipset'?'europatipset':'stryktipset';
    $('svenska-spel-link').href='https://spela.svenskaspel.se/'+(app.activeProduct==='Europatipset'?'europatipset':'stryktipset')+'/externa-systemspel';
    $('hero-product').textContent=app.activeProduct.toUpperCase();
    $('retro-product').textContent=app.activeProduct.toUpperCase();
    document.querySelectorAll('[data-product]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.product===app.activeProduct)));
    $('target').value=current().target;
    renderFixtureInfo();
  }
  function renderFixtureInfo(){
    const bar=document.querySelector('.fixture-bar');
    const fixture=fixtures[app.activeProduct];
    const saved=current();
    if(!fixture){$('fixture-info').textContent=fixtureStatus==='error'?'Kunde inte läsa matchfilen. Kontrollera matchnamnen innan spel.':'Hämtar matchlistan …';bar.classList.toggle('error',fixtureStatus==='error');return}
    const close=new Date(fixture.regCloseTime);
    const closeText=Number.isNaN(close.getTime())?'okänt':new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short'}).format(close);
    const updated=new Date(fixture.fetchedAt);
    const updateText=Number.isNaN(updated.getTime())?'okänt':new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short'}).format(updated);
    let message=`Omgång ${fixture.drawNumber} · spelstopp ${closeText} · matchfil ${updateText}.`;
    if(close.getTime()<Date.now())message+=' Spelstopp har passerat – invänta ny omgång.';
    if(fixtureStatus==='error')message+=' Senaste kontrollen misslyckades.';
    if(saved.drawNumber!==fixture.drawNumber)message+=' Dina sparade matchnamn visas.';
    $('fixture-info').textContent=message;
    bar.classList.toggle('error',close.getTime()<Date.now()||fixtureStatus==='error');
  }
  function applyFixtures(data){
    if(!data||typeof data.products!=='object')throw Error('Matchfilen har fel format.');
    const incoming={};
    for(const name of PRODUCTS){
      const fixture=data.products[name];
      if(!fixture||!Number.isInteger(fixture.drawNumber)||!Array.isArray(fixture.names)||fixture.names.length!==13||fixture.names.some(n=>typeof n!=='string'||!n.trim()))throw Error(name+': ofullständig matchlista.');
      incoming[name]=fixture;
    }
    fixtures=incoming;fixtureStatus='live';
    for(const name of PRODUCTS){
      const product=app.products[name],fixture=incoming[name];
      if(product.drawNumber!==fixture.drawNumber){
        const isNewRound=product.drawNumber!==null;
        product.matches.forEach((match,i)=>{match.name=fixture.names[i];if(isNewRound){match.signs=['1'];match.weights=[]}});
        product.drawNumber=fixture.drawNumber;
      }else if(product.matches.every(m=>!m.name.trim()))product.matches.forEach((m,i)=>m.name=fixture.names[i]);
    }
    persist();renderMatches();renderFixtureInfo();
  }
  async function refreshFixtures(){
    fixtureStatus='loading';renderFixtureInfo();
    try{const response=await fetch('./fixtures.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);applyFixtures(await response.json())}
    catch(error){fixtureStatus='error';renderFixtureInfo();status('Matchlistan kunde inte hämtas: '+error.message,'error')}
  }

  function setPickAppearance(btn,match,sign){
    const selected=match.signs.includes(sign),weighted=match.weights.includes(sign);
    btn.className='pick'+(selected?' selected':'')+(weighted?' weighted':'');
    btn.setAttribute('aria-pressed',String(selected));
    btn.setAttribute('aria-label',`${sign}: ${weighted?'viktad':selected?'vald':'inte vald'}. Enkelt tryck väljer eller tar bort, dubbeltryck eller långt tryck viktar.`);
    btn.title=weighted?'Viktad '+sign+' – dubbeltryck eller håll inne för att ta bort viktning':'Dubbeltryck eller håll inne för att vikta '+sign;
    btn.replaceChildren(document.createTextNode(sign));
    if(weighted){const star=document.createElement('span');star.className='star';star.textContent='★';star.setAttribute('aria-hidden','true');btn.append(star)}
  }
  function changePick(index,sign,button,mode){
    const match=current().matches[index];
    if(mode==='weight'){
      if(!match.signs.includes(sign))match.signs=SIGNS.filter(s=>s===sign||match.signs.includes(s));
      match.weights=SIGNS.filter(s=>s===sign?!match.weights.includes(s):match.weights.includes(s));
    }else if(match.signs.includes(sign)){
      match.signs=match.signs.filter(s=>s!==sign);match.weights=match.weights.filter(s=>s!==sign);
    }else match.signs=SIGNS.filter(s=>s===sign||match.signs.includes(s));
    setPickAppearance(button,match,sign);invalidate();
  }
  function makePick(index,sign,match){
    const button=document.createElement('button');button.type='button';setPickAppearance(button,match,sign);
    let holdTimer=0,clickTimer=0,held=false;
    button.addEventListener('pointerdown',event=>{if(event.button!==0)return;held=false;holdTimer=setTimeout(()=>{held=true;changePick(index,sign,button,'weight')},550)});
    const cancelHold=()=>{clearTimeout(holdTimer);holdTimer=0};
    button.addEventListener('pointerup',cancelHold);button.addEventListener('pointercancel',cancelHold);button.addEventListener('pointerleave',cancelHold);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{
      if(held){held=false;event.preventDefault();return}
      if(event.detail>=2){clearTimeout(clickTimer);clickTimer=0;changePick(index,sign,button,'weight');return}
      if(event.detail===0){changePick(index,sign,button,'toggle');return}
      clickTimer=setTimeout(()=>{clickTimer=0;changePick(index,sign,button,'toggle')},400);
    });
    button.addEventListener('dblclick',event=>event.preventDefault());
    return button;
  }
  function renderMatches(){
    const root=$('match-list');root.replaceChildren();
    current().matches.forEach((match,i)=>{
      const row=document.createElement('div');row.className='match-row';
      const num=document.createElement('span');num.className='match-no';num.textContent=String(i+1).padStart(2,'0');
      const name=document.createElement('input');name.className='match-name';name.type='text';name.maxLength=100;name.placeholder='Match '+(i+1);name.value=match.name;name.setAttribute('aria-label','Match '+(i+1));
      name.addEventListener('input',()=>{match.name=name.value;persist()});
      const picks=document.createElement('div');picks.className='pick-group';picks.setAttribute('role','group');picks.setAttribute('aria-label','Tecken för match '+(i+1));
      SIGNS.forEach(sign=>picks.append(makePick(i,sign,match)));
      row.append(num,name,picks);root.append(row);
    });
  }
  function renderGlobals(){
    const root=$('global-rules');root.replaceChildren();
    for(const sign of SIGNS){
      const row=document.createElement('div');row.className='global-rule';
      const title=document.createElement('strong');title.textContent=sign==='X'?'Antal kryss':sign==='1'?'Antal ettor':'Antal tvåor';row.append(title);
      for(const key of ['min','max']){
        const label=document.createElement('label');label.textContent=key==='min'?'Min':'Max';
        const input=document.createElement('input');input.type='number';input.min=0;input.max=13;input.step=1;input.inputMode='numeric';input.value=current().global[sign][key];input.setAttribute('aria-label',`${key==='min'?'Minst':'Högst'} antal ${title.textContent.toLowerCase().replace('antal ','')}`);
        input.addEventListener('input',()=>{current().global[sign][key]=input.value;invalidate()});label.append(input);row.append(label);
      }
      root.append(row);
    }
  }
  function renderRules(){
    const root=$('custom-rules');root.replaceChildren();
    current().rules.forEach(rule=>{
      const card=document.createElement('div');card.className='custom-rule';
      const top=document.createElement('div');top.className='custom-header';
      const title=document.createElement('input');title.value=rule.name;title.maxLength=80;title.setAttribute('aria-label','Regelns namn');title.addEventListener('input',()=>{rule.name=title.value;persist()});
      const remove=document.createElement('button');remove.type='button';remove.className='remove-rule';remove.textContent='×';remove.setAttribute('aria-label','Ta bort '+rule.name);remove.addEventListener('click',()=>{current().rules=current().rules.filter(r=>r.id!==rule.id);renderRules();invalidate()});top.append(title,remove);
      const fields=document.createElement('div');fields.className='custom-fields';
      const matchLabel=document.createElement('label');matchLabel.textContent='Matcher (t.ex. 1-6, 9, 11-13)';const matchInput=document.createElement('input');matchInput.value=rule.matches;matchInput.placeholder='1-13';matchInput.addEventListener('input',()=>{rule.matches=matchInput.value;invalidate()});matchLabel.append(matchInput);fields.append(matchLabel);
      const signLabel=document.createElement('div');signLabel.textContent='Räkna tecken';signLabel.style.cssText='color:#a6bed1;font-size:.69rem';const signs=document.createElement('div');signs.className='custom-signs';
      for(const s of SIGNS){const btn=document.createElement('button');btn.type='button';btn.textContent=s;btn.className='custom-sign'+(rule.signs.includes(s)?' selected':'');btn.setAttribute('aria-pressed',String(rule.signs.includes(s)));btn.addEventListener('click',()=>{rule.signs=SIGNS.filter(x=>x===s?!rule.signs.includes(x):rule.signs.includes(x));btn.classList.toggle('selected',rule.signs.includes(s));btn.setAttribute('aria-pressed',String(rule.signs.includes(s)));invalidate()});signs.append(btn)}signLabel.append(signs);fields.append(signLabel);
      for(const key of ['min','max']){const label=document.createElement('label');label.textContent=key==='min'?'Min':'Max';const input=document.createElement('input');input.type='number';input.min=0;input.max=13;input.step=1;input.value=rule[key];input.addEventListener('input',()=>{rule[key]=input.value;invalidate()});label.append(input);fields.append(label)}
      card.append(top,fields);root.append(card);
    });
  }
  function renderAll(){renderHeader();renderMatches();renderGlobals();renderRules()}

  function parseMatches(text){
    const result=new Set(),parts=text.replace(/\s/g,'').split(',');
    if(!text.trim()||parts.some(p=>!p))throw Error('Ange matcher som 1-6, 9, 11-13.');
    for(const part of parts){const m=/^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);if(!m)throw Error('Ogiltigt matchintervall: '+part);const a=Number(m[1]),b=m[2]?Number(m[2]):a;if(a<1||b>13||a>b)throw Error('Matchnummer måste vara mellan 1 och 13.');for(let i=a;i<=b;i++)result.add(i-1)}
    return [...result].sort((a,b)=>a-b);
  }
  function compile(product){
    const choices=product.matches.map((m,i)=>{if(!m.signs.length)throw Error('Välj minst ett tecken för match '+(i+1)+'.');return SIGNS.filter(s=>m.signs.includes(s))});
    const constraints=[];
    for(const sign of SIGNS)constraints.push({name:'Antal '+sign,indices:Array.from({length:13},(_,i)=>i),signs:[sign],min:Number(product.global[sign].min),max:Number(product.global[sign].max)});
    for(const rule of product.rules)constraints.push({name:rule.name||'Egen regel',indices:parseMatches(rule.matches),signs:rule.signs,min:Number(rule.min),max:Number(rule.max)});
    for(const c of constraints){
      if(!c.signs.length)throw Error(c.name+': välj minst ett tecken.');
      if(!Number.isInteger(c.min)||!Number.isInteger(c.max)||c.min<0||c.max>13||c.min>c.max||c.max>c.indices.length)throw Error(c.name+': kontrollera min och max.');
      const possible=c.indices.filter(i=>choices[i].some(s=>c.signs.includes(s))).length;
      const forced=c.indices.filter(i=>choices[i].every(s=>c.signs.includes(s))).length;
      if(c.min>possible||c.max<forced)throw Error(c.name+': regeln kan inte uppfyllas med valda tecken.');
    }
    return {choices,constraints};
  }
  function passesPrefix(row,depth,constraints,choices){
    for(const c of constraints){let count=0,possible=0;for(const i of c.indices){if(i<depth){if(c.signs.includes(row[i]))count++}else if(choices[i].some(s=>c.signs.includes(s)))possible++}if(count>c.max||count+possible<c.min)return false}return true;
  }
  function preference(row,matches){let hits=0;for(let i=0;i<13;i++)if(matches[i].weights.includes(row[i]))hits++;return hits}
  async function chooseDiverse(pool,target,matches,token){
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
    const pairs=[];for(let i=0;i<13;i++)for(let j=i+1;j<13;j++)pairs.push([i,j]);
    const encoded=pool.map(row=>{const signs=row.map(s=>SIGNS.indexOf(s));return Uint16Array.from(pairs,([a,b],p)=>p*9+signs[a]*3+signs[b])});
    const prefs=pool.map(row=>preference(row,matches));
    const covered=new Uint8Array(pairs.length*9),used=new Uint8Array(pool.length),minDistance=new Uint8Array(pool.length).fill(13),selected=[];
    for(let pick=0;pick<target;pick++){
      let best=-1,bestScore=-Infinity;
      for(let i=0;i<pool.length;i++){
        if(used[i])continue;
        let fresh=0;for(const key of encoded[i])if(!covered[key])fresh++;
        const score=fresh*10+minDistance[i]*3+prefs[i]*18;
        if(score>bestScore){bestScore=score;best=i}
      }
      used[best]=1;selected.push(pool[best]);for(const key of encoded[best])covered[key]=1;
      for(let i=0;i<pool.length;i++)if(!used[i]){let distance=0;for(let m=0;m<13;m++)if(pool[i][m]!==pool[best][m])distance++;if(distance<minDistance[i])minDistance[i]=distance}
      if(pick%3===2){status('Väljer spridda rader: '+(pick+1)+' av '+target+' …');await new Promise(resolve=>setTimeout(resolve,0));if(token!==runId)return null}
    }
    return selected;
  }
  function chooseWeighted(pool,target,matches){
    return pool.map(row=>({row,key:-Math.log(Math.max(Number.MIN_VALUE,Math.random()))/Math.pow(3,preference(row,matches))})).sort((a,b)=>a.key-b.key).slice(0,target).map(x=>x.row);
  }
  async function generate(){
    if(busy)return;
    const productName=app.activeProduct,product=current();
    let compiled;try{compiled=compile(product)}catch(error){status(error.message,'error');return}
    const target=Number($('target').value);
    if(!Number.isInteger(target)||target<1||target>MAX_ROWS){status('Ange ett antal mellan 1 och 10 000.','error');return}
    product.target=target;invalidate();busy=true;const token=++runId;$('generate').disabled=true;status('Beräknar rader som klarar reglerna …');
    const {choices,constraints}=compiled,pool=[],row=Array(13),stack=[{depth:0,next:0}];let visited=0,eligible=0;
    while(stack.length){
      const frame=stack[stack.length-1];
      if(frame.depth===13){eligible++;if(pool.length<POOL_SIZE)pool.push(row.slice());else{const slot=Math.floor(Math.random()*eligible);if(slot<POOL_SIZE)pool[slot]=row.slice()}stack.pop();continue}
      if(frame.next>=choices[frame.depth].length){stack.pop();continue}
      row[frame.depth]=choices[frame.depth][frame.next++];
      if(passesPrefix(row,frame.depth+1,constraints,choices))stack.push({depth:frame.depth+1,next:0});
      if(++visited%10000===0){await new Promise(resolve=>setTimeout(resolve,0));if(token!==runId)break}
    }
    if(token!==runId){busy=false;$('generate').disabled=false;return}
    $('eligible').textContent=format(eligible);
    if(!eligible){busy=false;$('generate').disabled=false;$('count').textContent='0';$('price').textContent='0 kr';status('Inga rader uppfyller alla regler.','error');return}
    let rows;
    if(eligible<=target)rows=pool;
    else if(target<=200){status('Väljer spridda rader …');rows=await chooseDiverse(pool,target,product.matches,token)}
    else rows=chooseWeighted(pool,target,product.matches);
    busy=false;$('generate').disabled=false;if(token!==runId||!rows)return;
    result={product:productName,rows};
    $('count').textContent=format(rows.length);$('price').textContent=format(rows.length)+' kr';$('download').disabled=false;$('copy').disabled=false;
    $('preview').textContent=makeText(result,false,10)+(rows.length>10?'\n… och '+format(rows.length-10)+' rader till':'');
    const weighted=product.matches.some(m=>m.weights.length);
    const message=eligible<target?`Endast ${format(eligible)} rader klarar reglerna. Alla valdes.`:`${format(rows.length)} av ${format(eligible)} giltiga rader valda${weighted?' med viktade tecken prioriterade':''}.`;
    status(message,'good');
  }
  function makeText(selection,windowsLineEndings=true,limit=Infinity){const lines=[selection.product,...selection.rows.slice(0,limit).map(row=>'E,'+row.join(','))];return lines.join(windowsLineEndings?'\r\n':'\n')+(windowsLineEndings?'\r\n':'')}
  function download(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}

  document.querySelectorAll('[data-product]').forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.dataset.product===app.activeProduct)return;
    app.activeProduct=btn.dataset.product;invalidate('Bytte till '+app.activeProduct+'. Skapa rader för den omgången.');renderAll();
  }));
  function setTheme(theme){
    document.documentElement.dataset.theme=theme;
    document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.themeChoice===theme)));
    try{localStorage.setItem(THEME_KEY,theme)}catch{}
  }
  document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',()=>setTheme(btn.dataset.themeChoice)));
  setTheme(document.documentElement.dataset.theme==='retro'?'retro':'sport');
  $('reset-signs').addEventListener('click',()=>{current().matches.forEach(m=>{m.signs=[];m.weights=[]});renderMatches();invalidate('Alla tecken rensade. Välj minst ett per match.')});
  $('refresh-fixture').addEventListener('click',refreshFixtures);
  $('target').addEventListener('input',()=>{current().target=$('target').value;invalidate()});
  $('add-rule').addEventListener('click',()=>{current().rules.push({id:id(),name:'Ny regel',matches:'1-6',signs:['X'],min:0,max:2});renderRules();invalidate()});
  $('generate').addEventListener('click',generate);
  $('download').addEventListener('click',()=>{if(!result)return;const slug=result.product==='Stryktipset'?'stryktipset':'europatipset';download(slug+'-enkelrader.txt',makeText(result),'text/plain;charset=us-ascii')});
  $('copy').addEventListener('click',async()=>{if(!result)return;try{await navigator.clipboard.writeText(makeText(result,false));status('Raderna kopierades till urklipp.','good')}catch{status('Det gick inte att kopiera. Ladda ned textfilen i stället.','error')}});
  $('save-config').addEventListener('click',()=>download('reduceraren-upplagg.json',JSON.stringify({version:2,...app},null,2),'application/json'));
  $('load-config').addEventListener('click',()=>$('config-file').click());
  $('config-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{app=normalizeState(JSON.parse(await file.text()));if(Object.keys(fixtures).length)applyFixtures({products:fixtures});renderAll();invalidate('Upplägget har lästs in. Kontrollera matcherna och skapa rader.')}catch(error){status('Kunde inte öppna upplägget: '+error.message,'error')}event.target.value=''});

  renderAll();refreshFixtures();
})();

