import React from 'react';
export function RussianPrivacyPage() {
 const text=window.__boot?.privacyText;
 return <main className="simple-page page-width"><h1>{text?'Обработка персональных данных':'Страница не найдена'}</h1>{text&&<p style={{whiteSpace:'pre-line'}}>{text}</p>}</main>;
}
