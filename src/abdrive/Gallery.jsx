import React,{useRef,useState} from 'react';
import {StripPhoto} from '../strip-photo.jsx';
import {vehiclePhotoHref} from '../photo-source.js';

export function Gallery({images=[],title}){
 const track=useRef(null);const [active,setActive]=useState(0);
 const urls=[...new Set(images)];
 if(!urls.length)return <div className="ab-gallery-empty">Фотографии уточняются</div>;
 function go(index){
  const node=track.current;if(!node)return;
  const target=Math.max(0,Math.min(urls.length-1,index));
  node.scrollTo({left:node.clientWidth*target,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }
 return <section className="ab-photo-section" aria-label="Фотографии автомобиля">
  <div className="ab-gallery" ref={track} tabIndex={urls.length>1?0:undefined} role="region" aria-label="Галерея: листайте фотографии стрелками"
   onScroll={event=>{const node=event.currentTarget;if(node.clientWidth)setActive(Math.max(0,Math.min(urls.length-1,Math.round(node.scrollLeft/node.clientWidth))));}}
   onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();go(active+(event.key==='ArrowRight'?1:-1));}}}>
   {urls.map((url,i)=><StripPhoto key={url} src={vehiclePhotoHref(url,600,{mirrorOrigin:'https://abcars.by'})} first={i===0} alt={`${title}, фото ${i+1}`}/>)}
  </div>
  {urls.length>1?<div className="ab-gallery-controls"><button type="button" onClick={()=>go(active-1)} disabled={active===0} aria-label="Предыдущее фото">←</button><span aria-live="polite">Фото {active+1} из {urls.length}</span><button type="button" onClick={()=>go(active+1)} disabled={active===urls.length-1} aria-label="Следующее фото">→</button></div>:null}
  <a className="ab-full-photo" href={vehiclePhotoHref(urls[active],'original',{mirrorOrigin:'https://abcars.by'})} target="_blank" rel="noopener noreferrer">Открыть фото полностью ↗</a>
 </section>;
}
