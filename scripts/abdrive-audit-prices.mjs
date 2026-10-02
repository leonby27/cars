// Read the continuously refreshed coverage report, without scanning the database.
import '../config/load-env.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2);
const argument=(name)=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const file=argument('--file')||process.env.ABDRIVE_PRICE_INDEX_FILE;
if(!file)throw new Error('Pass --file PRICE_INDEX.json or configure ABDRIVE_PRICE_INDEX_FILE');
const index=JSON.parse(await readFile(file,'utf8'));
if(!index.coverage||index.coverage.version!==index.version)throw new Error('Coverage missing or stale: prepare the Russian price index first');
const report=index.coverage;
console.log(JSON.stringify({version:report.version,date:report.date,...report.summary},null,2));
const models=new Map();
for(const group of report.groups){const name=[group.brand,group.model].join(' ');const model=models.get(name)||{model:name,unavailable:0,wideRange:0,range:0};model[group.reason==='power_range_wide'?'wideRange':group.reason==='power_range'?'range':'unavailable']+=group.count;models.set(name,model);}
console.table([...models.values()].sort((a,b)=>(b.unavailable+b.wideRange)-(a.unavailable+a.wideRange)).slice(0,Number(argument('--limit'))||30));
const out=argument('--out');if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');
