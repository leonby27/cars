import '../storage-guard.js';
import '../styles.css';
import '../order-contact.css';
import '../markets/interface.css';
window.__boot=JSON.parse(document.getElementById('abdrive-data').textContent);
const loadApp=()=>import('../app-entry.jsx');
if(document.getElementById('root')?.dataset.prerender&&document.visibilityState!=='hidden'){
 requestAnimationFrame(()=>setTimeout(loadApp,0));
}else loadApp();
