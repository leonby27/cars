import {renderCatalogApp} from '../entry-server.jsx';
export const render=boot=>renderCatalogApp(boot.path||'/',boot.search||'',boot);
