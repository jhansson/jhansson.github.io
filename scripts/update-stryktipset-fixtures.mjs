import fs from 'node:fs';

const PRODUCTS = [
  {name:'Stryktipset',slug:'stryktipset'},
  {name:'Europatipset',slug:'europatipset'},
];

async function currentDraw({name,slug}) {
  const url=`https://api.spela.svenskaspel.se/draw/1/${slug}/draws`;
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`${name}: Svenska Spel svarade ${response.status}`);
  const payload=await response.json();
  const draw=(Array.isArray(payload.draws)?payload.draws:[])
    .filter(d=>d.drawState==='Open'&&Array.isArray(d.drawEvents)&&d.drawEvents.length===13)
    .sort((a,b)=>Date.parse(a.regCloseTime)-Date.parse(b.regCloseTime))[0];
  if(!draw)throw Error(`${name}: ingen öppen omgång med 13 matcher`);
  const names=[...draw.drawEvents].sort((a,b)=>a.eventNumber-b.eventNumber).map((event,index)=>{
    if(event.eventNumber!==index+1)throw Error(`${name}: oväntad matchordning`);
    const participants=event.match?.participants||[];
    const home=participants.find(p=>p.type==='home')?.name;
    const away=participants.find(p=>p.type==='away')?.name;
    if(typeof home!=='string'||!home.trim()||typeof away!=='string'||!away.trim())throw Error(`${name}: ofullständigt lagnamn i match ${index+1}`);
    return `${home} - ${away}`;
  });
  return {drawNumber:draw.drawNumber,regCloseTime:draw.regCloseTime,fetchedAt:new Date().toISOString(),names};
}

const fixturePath=new URL('../app/stryktipset/fixtures.json',import.meta.url);
const previous=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const results=await Promise.allSettled(PRODUCTS.map(currentDraw));
const products={};
let refreshed=0;
for(let i=0;i<PRODUCTS.length;i++){
  const {name}=PRODUCTS[i];
  const result=results[i];
  if(result.status==='fulfilled'){
    products[name]=result.value;
    refreshed++;
    console.log(`${name} ${result.value.drawNumber}: 13 matcher`);
  }else{
    const saved=previous.products?.[name];
    if(!saved||!Array.isArray(saved.names)||saved.names.length!==13)throw result.reason;
    products[name]=saved;
    console.warn(`${name}: ${result.reason.message}. Behåller omgång ${saved.drawNumber}.`);
  }
}
if(!refreshed)throw Error('Ingen matchlista kunde uppdateras.');
fs.writeFileSync(fixturePath,JSON.stringify({products},null,2)+'\n','utf8');

