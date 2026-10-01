import '../config/load-env.mjs';
import {catalogPool,closePools} from '../server/db.mjs';
import {SITE} from '../src/site-profile.js';
import {createRussianPriceIndex} from '../server/abdrive/price-index.mjs';
import {createRussianRates} from '../server/abdrive/pricing.mjs';
if(SITE.id!=='abdrive'||!process.env.ABDRIVE_PRICE_INDEX_FILE)throw new Error('ABDrive price cache path required');
try{
 const started=Date.now();
 const index=await createRussianPriceIndex(catalogPool,{getRates:createRussianRates(),now:()=>new Date(),cacheFile:process.env.ABDRIVE_PRICE_INDEX_FILE,forceRefresh:true,onProgress:count=>{if(count%20000===0)console.log('Prepared Russian prices:',count);}})();
 if(!index.prices.size)throw new Error('No Russian prices prepared');
 console.log('Russian price index ready:',index.prices.size,'prices in',Math.round((Date.now()-started)/1000),'seconds');
}finally{await closePools();}
