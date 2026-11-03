import fs from 'node:fs';

const sourceUrl='https://api.spela.svenskaspel.se/draw/1/stryktipset/draws';
const response=await fetch(sourceUrl,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error(`Svenska Spel svarade ${response.status}`);
const payload=await response.json();
const draw=(Array.isArray(payload.draws)?payload.draws:[])
  .filter(d=>d.drawState==='Open'&&Array.isArray(d.drawEvents)&&d.drawEvents.length===13)
  .sort((a,b)=>Date.parse(a.regCloseTime)-Date.parse(b.regCloseTime))[0];
if(!draw)throw Error('Ingen öppen Stryktipsomgång med 13 matcher hittades');

const names=[...draw.drawEvents].sort((a,b)=>a.eventNumber-b.eventNumber).map((event,index)=>{
  if(event.eventNumber!==index+1)throw Error('Oväntad matchordning');
  const participants=event.match?.participants||[];
  const home=participants.find(p=>p.type==='home')?.name;
  const away=participants.find(p=>p.type==='away')?.name;
  if(typeof home!=='string'||!home.trim()||typeof away!=='string'||!away.trim())throw Error('Ofullständigt lagnamn i match '+(index+1));
  return `${home} - ${away}`;
});

const fixture={drawNumber:draw.drawNumber,regCloseTime:draw.regCloseTime,fetchedAt:new Date().toISOString(),names};
fs.writeFileSync(new URL('../app/stryktipset/fixtures.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n','utf8');
console.log(`Uppdaterade omgång ${draw.drawNumber} med 13 matcher`);

