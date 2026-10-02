import '../config/load-env.mjs';
import {catalogPool,closePools} from '../server/db.mjs';
import {SITE} from '../src/site-profile.js';
import {createRussianPriceIndex} from '../server/abdrive/price-index.mjs';
import {createRussianCatalog} from '../server/abdrive/catalog.mjs';
import {prepareRussianHome,writeRussianHome} from '../server/abdrive/home-snapshot.mjs';
import {createRussianRates} from '../server/abdrive/pricing.mjs';
if(SITE.id!=='abdrive'||!process.env.ABDRIVE_PRICE_INDEX_FILE)throw new Error('ABDrive price cache path required');
try{
 const started=Date.now();
 // Only the offline preparation connection gets a longer query timeout.
 const client=await catalogPool.connect();
 await client.query('SET statement_timeout=30000');client.release();
 const index=await createRussianPriceIndex(catalogPool,{getRates:createRussianRates(),now:()=>new Date(),cacheFile:process.env.ABDRIVE_PRICE_INDEX_FILE,forceRefresh:true,onProgress:count=>{if(count%20000===0)console.log('Prepared Russian prices:',count);}})();
 if(!index.prices.size)throw new Error('No Russian prices prepared');
 console.log('Russian pricing coverage:',JSON.stringify(index.coverage.summary));
 console.log('Russian price index ready:',index.prices.size,'prices in',Math.round((Date.now()-started)/1000),'seconds');
 if(process.env.ABDRIVE_HOME_SNAPSHOT_FILE){
  const catalog=createRussianCatalog(catalogPool,{priceIndexFile:process.env.ABDRIVE_PRICE_INDEX_FILE});
  const snapshot=await prepareRussianHome(catalog);
  await writeRussianHome(process.env.ABDRIVE_HOME_SNAPSHOT_FILE,snapshot);
  console.log('Russian homepage snapshot ready:',snapshot.boot.homeShowcase.length,'cars');
 }
}finally{await closePools();}
