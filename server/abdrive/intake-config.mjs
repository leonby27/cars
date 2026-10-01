// Missing intake dependencies disable only the form, never the public catalog.
export function intakeConfig(env={},privacyText=null){
 const token=String(env.ABDRIVE_TELEGRAM_BOT_TOKEN||'').trim();
 const chatId=String(env.ABDRIVE_TELEGRAM_CHAT_ID||'').trim();
 const consentVersion=String(env.ABDRIVE_CONSENT_VERSION||'').trim();
 const notificationReady=Boolean(token&&/^-?\d+$/.test(chatId));
 const documentReady=typeof privacyText==='string'&&privacyText.trim().length>0;
 const enabled=Boolean(documentReady&&consentVersion&&notificationReady);
 return {enabled,consentVersion:enabled?consentVersion:null,notificationReady,token,chatId};
}
