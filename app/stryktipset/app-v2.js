(() => {
  'use strict';

  const PRODUCTS=['Stryktipset','Europatipset'];
  const SIGNS=['1','X','2'];
  const STORAGE_KEY='tips-reduceraren-v2';
  const LEGACY_KEY='stryktips-reduceraren-v1';
  const THEME_KEY='tips-reduceraren-theme';
  const MAX_ROWS=500;
  const DEFAULT_WEIGHT=3,MIN_WEIGHT=1,MAX_WEIGHT=5;
  const weightLabel=value=>value.toFixed(1).replace('.',',')+'×';
  const POOL_SIZE=12000;
  const $=id=>document.getElementById(id);
  const format=n=>new Intl.NumberFormat('sv-SE').format(n);
  const id=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);

  function newProduct(){
    return {
      matches:Array.from({length:13},()=>({name:'',signs:[],weights:{}})),
      global:{'1':{min:0,max:13},'X':{min:0,max:13},'2':{min:0,max:13}},
      rules:[],target:'',drawNumber:null
    };
  }
  function numberInRange(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback}
  function normalizeProduct(raw){
    if(!raw||!Array.isArray(raw.matches)||raw.matches.length!==13)throw Error('Upplägget måste ha 13 matcher.');
    const matches=raw.matches.map(m=>{
      const signs=SIGNS.filter(s=>Array.isArray(m?.signs)&&m.signs.includes(s));
      const weights={};
      for(const sign of signs){
        const raw=Array.isArray(m?.weights)?m.weights.includes(sign)?DEFAULT_WEIGHT:null:m?.weights?.[sign];
        if(raw!=null&&Number.isFinite(Number(raw)))weights[sign]=Math.round(Math.max(MIN_WEIGHT,Math.min(MAX_WEIGHT,Number(raw)))*10)/10;
      }
      return {name:String(m?.name||'').slice(0,100),signs,weights};
    });
    const global={};for(const s of SIGNS){const r=raw.global?.[s]||{};global[s]={min:numberInRange(r.min,0,0,13),max:numberInRange(r.max,13,0,13)}}
    const rules=(Array.isArray(raw.rules)?raw.rules:[]).slice(0,50).map(r=>({id:String(r.id||id()),name:String(r.name||'Egen regel').slice(0,80),matches:String(r.matches||'').slice(0,100),signs:SIGNS.filter(s=>Array.isArray(r.signs)&&r.signs.includes(s)),min:numberInRange(r.min,0,0,13),max:numberInRange(r.max,13,0,13)}));
    return {matches,global,rules,target:raw.target===''?'':Math.min(MAX_ROWS,numberInRange(raw.target,40,1,10000)),drawNumber:raw.drawNumber!=null&&Number.isInteger(Number(raw.drawNumber))?Number(raw.drawNumber):null};
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
    result=null;clearDistribution();$('download').disabled=true;$('copy').disabled=true;
    $('eligible').textContent='—';$('count').textContent='—';$('price').textContent='—';$('guarantee').textContent='—';
    $('preview').textContent='Inga rader skapade ännu.';
    status(message);persist();
  }

  function renderHeader(){
    document.documentElement.dataset.product=app.activeProduct==='Europatipset'?'europatipset':'stryktipset';
    $('svenska-spel-link').href='https://spela.svenskaspel.se/'+(app.activeProduct==='Europatipset'?'europatipset':'stryktipset')+'/externa-systemspel';
    document.querySelectorAll('[data-product]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.product===app.activeProduct)));
    $('target').value=current().target;
    $('target-picker').value=String(current().target);
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
    let activeRoundChanged=false;
    for(const name of PRODUCTS){
      const product=app.products[name],fixture=incoming[name];
      if(product.drawNumber!==fixture.drawNumber){
        const isNewRound=product.drawNumber!==null;
        if(isNewRound&&name===app.activeProduct)activeRoundChanged=true;
        product.matches.forEach((match,i)=>{match.name=fixture.names[i];if(isNewRound){match.signs=[];match.weights={}}});
        product.drawNumber=fixture.drawNumber;
      }else if(product.matches.every(m=>!m.name.trim()))product.matches.forEach((m,i)=>m.name=fixture.names[i]);
    }
    persist();renderMatches();renderFixtureInfo();
    if(activeRoundChanged)invalidate('Ny omgång. Välj tecken och skapa rader igen.');
    else if(result?.product===app.activeProduct)renderDistribution(result.rows);
  }
  async function refreshFixtures(){
    fixtureStatus='loading';renderFixtureInfo();
    try{const response=await fetch('./fixtures.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);applyFixtures(await response.json())}
    catch(error){fixtureStatus='error';renderFixtureInfo();status('Matchlistan kunde inte hämtas: '+error.message,'error')}
  }

  function setPickAppearance(btn,match,sign){
    const selected=match.signs.includes(sign),strength=match.weights[sign],weighted=strength!==undefined;
    btn.className='pick'+(selected?' selected':'')+(weighted?' weighted':'');
    btn.setAttribute('aria-pressed',String(selected));
    btn.dataset.baseLabel=`${sign}: ${weighted?'viktad '+weightLabel(strength):selected?'vald':'inte vald'}. Dubbeltryck växlar viktning, håll och dra ändrar styrkan.`;
    btn.dataset.baseTitle=weighted?'Viktad '+sign+' '+weightLabel(strength)+' · dubbeltryck för att ta bort':'Dubbeltryck för '+weightLabel(DEFAULT_WEIGHT)+' eller håll och dra';
    btn.setAttribute('aria-label',btn.dataset.baseLabel);btn.title=btn.dataset.baseTitle;
    const fill=document.createElement('span');fill.className='distribution-fill';fill.setAttribute('aria-hidden','true');
    const glyph=document.createElement('span');glyph.className='pick-sign';glyph.textContent=sign;
    btn.replaceChildren(fill,glyph);
    if(weighted){const star=document.createElement('span');star.className='star';star.textContent='★';star.setAttribute('aria-hidden','true');btn.append(star)}
  }
  function clearDistribution(){
    $('match-list').querySelectorAll('.pick').forEach(button=>{
      button.classList.remove('has-distribution');
      button.style.removeProperty('--distribution');
      button.setAttribute('aria-label',button.dataset.baseLabel);
      button.title=button.dataset.baseTitle;
    });
  }
  function renderDistribution(rows){
    const counts=Array.from({length:13},()=>[0,0,0]);
    for(const row of rows)for(let match=0;match<13;match++)counts[match][SIGNS.indexOf(row[match])]++;
    $('match-list').querySelectorAll('.match-row').forEach((matchRow,match)=>{
      matchRow.querySelectorAll('.pick').forEach((button,sign)=>{
        const percent=counts[match][sign]*100/rows.length;
        button.style.setProperty('--distribution',percent.toFixed(2)+'%');
        button.classList.add('has-distribution');
        const description=Math.round(percent)+' procent av skapade rader.';
        button.setAttribute('aria-label',button.dataset.baseLabel+' '+description);
        button.title=button.dataset.baseTitle+' · '+description;
      });
    });
  }
  function changePick(index,sign,button,mode,strength=DEFAULT_WEIGHT){
    const match=current().matches[index];
    if(mode==='weight'||mode==='set-weight'){
      if(!match.signs.includes(sign))match.signs=SIGNS.filter(s=>s===sign||match.signs.includes(s));
      if(mode==='weight'&&match.weights[sign]!==undefined)delete match.weights[sign];
      else match.weights[sign]=strength;
    }else if(match.signs.includes(sign)){
      match.signs=match.signs.filter(s=>s!==sign);delete match.weights[sign];
    }else match.signs=SIGNS.filter(s=>s===sign||match.signs.includes(s));
    setPickAppearance(button,match,sign);
    invalidate(mode==='set-weight'?`Match ${index+1}, ${sign}: viktning ${weightLabel(strength)}. Skapa rader igen.`:undefined);
  }
  let pendingPick=null;
  function finishPendingPick(toggle=true){
    if(!pendingPick)return;
    const pending=pendingPick;pendingPick=null;clearTimeout(pending.timer);
    if(toggle&&pending.button.isConnected&&pending.product===app.activeProduct)pending.toggle();
  }
  function makePick(index,sign,match){
    const button=document.createElement('button');button.type='button';setPickAppearance(button,match,sign);
    const product=app.activeProduct;
    const toggle=()=>changePick(index,sign,button,'toggle');
    let holdTimer=0,held=false,activePointer=null,moved=false,adjusting=false;
    let startX=0,startY=0,startStrength=DEFAULT_WEIGHT,previewStrength=DEFAULT_WEIGHT,bubble=null;
    const showStrength=y=>{
      if(!bubble){bubble=document.createElement('div');bubble.className='weight-bubble';document.body.append(bubble)}
      bubble.textContent='Viktning '+weightLabel(previewStrength);
      const rect=button.getBoundingClientRect();
      bubble.style.left=Math.max(75,Math.min(window.innerWidth-75,rect.left+rect.width/2))+'px';
      bubble.style.top=Math.max(48,y-20)+'px';
    };
    const hideStrength=()=>{if(bubble){bubble.remove();bubble=null}};
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||activePointer!==null)return;
      held=false;moved=false;adjusting=false;activePointer=event.pointerId;
      startX=event.clientX;startY=event.clientY;
      startStrength=match.weights[sign]??DEFAULT_WEIGHT;previewStrength=startStrength;
      try{button.setPointerCapture(event.pointerId)}catch{}
      holdTimer=setTimeout(()=>{
        if(activePointer!==event.pointerId||moved||!button.isConnected||product!==app.activeProduct)return;
        held=true;adjusting=true;
        finishPendingPick(pendingPick?.button!==button);
        showStrength(startY);
      },550);
    });
    button.addEventListener('pointermove',event=>{
      if(activePointer!==event.pointerId)return;
      if(!adjusting){
        if(Math.hypot(event.clientX-startX,event.clientY-startY)>12){
          moved=true;clearTimeout(holdTimer);holdTimer=0;
        }
        return;
      }
      event.preventDefault();
      previewStrength=Math.round(Math.max(MIN_WEIGHT,Math.min(MAX_WEIGHT,startStrength+(startY-event.clientY)/40))*10)/10;
      showStrength(event.clientY);
    });
    const finishPointer=(event,commit)=>{
      if(activePointer!==event.pointerId)return;
      clearTimeout(holdTimer);holdTimer=0;activePointer=null;
      try{if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId)}catch{}
      if(adjusting){
        adjusting=false;hideStrength();held=true;
        if(commit&&button.isConnected&&product===app.activeProduct)changePick(index,sign,button,'set-weight',previewStrength);
      }else if(moved)held=true;
    };
    button.addEventListener('pointerup',event=>finishPointer(event,true));
    button.addEventListener('pointercancel',event=>finishPointer(event,false));
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{
      if(!button.isConnected||product!==app.activeProduct)return;
      if(held){held=false;event.preventDefault();return}
      if(event.detail===0){finishPendingPick();toggle();return}
      if(pendingPick?.button===button){
        finishPendingPick(false);
        changePick(index,sign,button,'weight');
        return;
      }
      finishPendingPick();
      const pending={button,product,toggle,timer:0};
      pending.timer=setTimeout(()=>{if(pendingPick===pending)finishPendingPick()},400);
      pendingPick=pending;
    });
    button.addEventListener('dblclick',event=>event.preventDefault());
    return button;
  }
  function renderMatches(){
    const root=$('match-list');root.replaceChildren();
    current().matches.forEach((match,i)=>{
      const row=document.createElement('div');row.className='match-row';
      const num=document.createElement('span');num.className='match-no';num.textContent=String(i+1).padStart(2,'0');
      const name=document.createElement('span');name.className='match-name';name.textContent=match.name||'Match '+(i+1);
      const picks=document.createElement('div');picks.className='pick-group';picks.setAttribute('role','group');picks.setAttribute('aria-label','Tecken för match '+(i+1));
      SIGNS.forEach(sign=>picks.append(makePick(i,sign,match)));
      row.append(num,name,picks);root.append(row);
    });
  }
  function makeMobileNumberSelect(input,min,max,onValue){
    const picker=document.createElement('select');
    picker.className='mobile-number-select';
    const description=input.getAttribute('aria-label');
    if(description)picker.setAttribute('aria-label',description);
    for(let n=min;n<=max;n++){
      const option=document.createElement('option');
      option.value=String(n);option.textContent=String(n);picker.append(option);
    }
    picker.value=input.value;
    input.classList.add('number-input');
    input.addEventListener('input',()=>{picker.value=input.value;onValue(input.value)});
    picker.addEventListener('change',()=>{input.value=picker.value;onValue(picker.value)});
    return picker;
  }
  function renderGlobals(){
    const root=$('global-rules');root.replaceChildren();
    for(const sign of SIGNS){
      const row=document.createElement('div');row.className='global-rule';
      const title=document.createElement('strong');title.textContent=sign==='X'?'Antal kryss':sign==='1'?'Antal ettor':'Antal tvåor';row.append(title);
      for(const key of ['min','max']){
        const label=document.createElement('label');label.textContent=key==='min'?'Min':'Max';
        const input=document.createElement('input');input.type='number';input.min=0;input.max=13;input.step=1;input.inputMode='numeric';input.value=current().global[sign][key];input.setAttribute('aria-label',`${key==='min'?'Minst':'Högst'} antal ${title.textContent.toLowerCase().replace('antal ','')}`);
        const picker=makeMobileNumberSelect(input,0,13,value=>{current().global[sign][key]=value;invalidate()});label.append(input,picker);row.append(label);
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
      for(const key of ['min','max']){const label=document.createElement('label');label.textContent=key==='min'?'Min':'Max';const input=document.createElement('input');input.type='number';input.min=0;input.max=13;input.step=1;input.value=rule[key];const picker=makeMobileNumberSelect(input,0,13,value=>{rule[key]=value;invalidate()});label.append(input,picker);fields.append(label)}
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
  function preference(row,matches){let score=0;for(let i=0;i<13;i++)score+=Math.log(matches[i].weights[row[i]]||1)/Math.log(DEFAULT_WEIGHT);return score}
  async function chooseDiverse(pool,target,matches,token){
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
    const pairs=[];for(let i=0;i<13;i++)for(let k=i+1;k<13;k++)pairs.push([i,k]);
    const codes=pool.map(row=>Uint8Array.from(row,sign=>SIGNS.indexOf(sign)));
    const encoded=codes.map(row=>Uint16Array.from(pairs,([a,b],p)=>p*9+row[a]*3+row[b]));
    const shares=matches.map(match=>{
      const factors=SIGNS.map(sign=>match.signs.includes(sign)?match.weights[sign]??1:0);
      const sum=factors.reduce((a,b)=>a+b,0);
      return factors.map(factor=>factor/sum);
    });
    const covered=new Uint8Array(pairs.length*9),used=new Uint8Array(pool.length),minDistance=new Uint8Array(pool.length).fill(13),selected=[];
    const counts=Array.from({length:13},()=>[0,0,0]);
    for(let pick=0;pick<target;pick++){
      let best=-1,bestScore=-Infinity;
      for(let i=0;i<pool.length;i++){
        if(used[i])continue;
        let fresh=0;for(const key of encoded[i])if(!covered[key])fresh++;
        let balance=0;
        for(let m=0;m<13;m++){
          const sign=codes[i][m];
          balance+=(pick+1)*shares[m][sign]-counts[m][sign];
        }
        const score=fresh*10+minDistance[i]*3+balance*24;
        if(score>bestScore){bestScore=score;best=i}
      }
      used[best]=1;selected.push(pool[best]);for(const key of encoded[best])covered[key]=1;
      for(let m=0;m<13;m++)counts[m][codes[best][m]]++;
      for(let i=0;i<pool.length;i++)if(!used[i]){let distance=0;for(let m=0;m<13;m++)if(codes[i][m]!==codes[best][m])distance++;if(distance<minDistance[i])minDistance[i]=distance}
      if(pick%3===2){status('Väljer spridda rader: '+(pick+1)+' av '+target+' …');await new Promise(resolve=>setTimeout(resolve,0));if(token!==runId)return null}
    }
    return selected;
  }
  function chooseWeighted(pool,target,matches){
    return pool.map(row=>({row,key:-Math.log(Math.max(Number.MIN_VALUE,Math.random()))/Math.pow(DEFAULT_WEIGHT,preference(row,matches))})).sort((a,b)=>a.key-b.key).slice(0,target).map(x=>x.row);
  }
  async function calculateGuarantee(rows,choices,token){
    const strides=Array(13),radices=choices.map(choice=>choice.length);
    let total=1;
    for(let i=0;i<13;i++){strides[i]=total;total*=radices[i]}
    const distance=new Uint8Array(total);
    distance.fill(255);
    for(const row of rows){
      let index=0;
      for(let i=0;i<13;i++)index+=choices[i].indexOf(row[i])*strides[i];
      distance[index]=0;
    }
    for(let i=0;i<13;i++){
      const step=strides[i],radix=radices[i],block=step*radix;
      if(radix===1)continue;
      for(let base=0;base<total;base+=block){
        for(let offset=0;offset<step;offset++){
          const first=base+offset;
          let best=255;
          for(let digit=0;digit<radix;digit++){
            const value=distance[first+digit*step];
            if(value<best)best=value;
          }
          if(best===255)continue;
          const candidate=best+1;
          for(let digit=0;digit<radix;digit++){
            const index=first+digit*step;
            if(distance[index]>candidate)distance[index]=candidate;
          }
        }
      }
      await new Promise(resolve=>setTimeout(resolve,0));
      if(token!==runId)return null;
    }
    let worstDistance=0;
    for(const value of distance)if(value>worstDistance)worstDistance=value;
    return 13-worstDistance;
  }
  async function generate(){
    if(busy)return;
    const productName=app.activeProduct,product=current();
    let compiled;try{compiled=compile(product)}catch(error){status(error.message,'error');return}
    const target=Number($('target').value);
    if(!Number.isInteger(target)||target<1||target>MAX_ROWS){status('Ange ett antal mellan 1 och 500.','error');return}
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
    if(token!==runId||!rows){busy=false;$('generate').disabled=false;return}
    status('Beräknar rättsgaranti …');
    const guarantee=await calculateGuarantee(rows,choices,token);
    busy=false;$('generate').disabled=false;if(token!==runId||guarantee===null)return;
    result={product:productName,rows};renderDistribution(rows);
    $('count').textContent=format(rows.length);$('price').textContent=format(rows.length)+' kr';$('guarantee').textContent=guarantee+' rätt';$('download').disabled=false;$('copy').disabled=false;
    $('preview').textContent=makeText(result,false);
    const weighted=product.matches.some(m=>Object.keys(m.weights).length);
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
  setTheme(document.documentElement.dataset.theme==='sport'?'sport':'retro');
  $('reset-signs').addEventListener('click',()=>{current().matches.forEach(m=>{m.signs=[];m.weights={}});renderMatches();invalidate('Alla tecken rensade. Välj minst ett per match.')});
  $('refresh-fixture').addEventListener('click',refreshFixtures);
  for(let n=1;n<=MAX_ROWS;n++){
    const option=document.createElement('option');option.value=String(n);option.textContent=String(n);$('target-picker').append(option);
  }
  $('target').addEventListener('input',()=>{$('target-picker').value=$('target').value;current().target=$('target').value;invalidate()});
  $('target-picker').addEventListener('change',()=>{$('target').value=$('target-picker').value;current().target=$('target-picker').value;invalidate()});
  $('add-rule').addEventListener('click',()=>{current().rules.push({id:id(),name:'Ny regel',matches:'1-6',signs:['X'],min:0,max:2});renderRules();invalidate()});
  $('generate').addEventListener('click',generate);
  $('download').addEventListener('click',()=>{if(!result)return;const slug=result.product==='Stryktipset'?'stryktipset':'europatipset';download(slug+'-enkelrader.txt',makeText(result),'text/plain;charset=us-ascii')});
  $('copy').addEventListener('click',async()=>{if(!result)return;try{await navigator.clipboard.writeText(makeText(result,false));status('Raderna kopierades till urklipp.','good')}catch{status('Det gick inte att kopiera. Ladda ned textfilen i stället.','error')}});

  renderAll();refreshFixtures();
})();

