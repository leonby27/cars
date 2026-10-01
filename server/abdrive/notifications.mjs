import {claimNotification,finishNotification} from './leads.mjs';
import {formatLeadMessage} from '../lead-message.mjs';
import {callTelegram} from '../../scripts/lib/telegram.mjs';

// The SQL outbox owns retries; do not combine it with the legacy file outbox.
export async function deliverNextLead(db,{site,token,chatId,send=callTelegram}){
 if(!token||!chatId)return false;
 const job=await claimNotification(db);if(!job)return false;
 try{
  const result=await db.query('SELECT * FROM leads WHERE id=$1',[job.lead_id]);
  const lead=result.rows[0];const snapshot=lead.snapshot;const car=snapshot.car;
  const text=formatLeadMessage({kind:car?'availability':'custom_search',source:'site',orderNumber:'AB-'+lead.id.slice(0,8).toUpperCase(),name:lead.name,contact:lead.phone,
   comment:lead.comment,destinationName:lead.destination_name,
   car:car?{id:car.id,title:car.title,mileage:car.mileage,price:car.offer?.totalAmount,priceCurrency:car.offer?.currency,sourceUrl:snapshot.sourceUrl}:null}, {site});
  const answer=await send('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true},{token});
  await finishNotification(db,job,{sent:answer?.ok===true,error:answer?.ok?null:'telegram_delivery_failed'});
  return answer?.ok===true;
 }catch(error){await finishNotification(db,job,{sent:false,error:error.code||'notification_failed'});return false;}
}
