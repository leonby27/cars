import React from 'react';
import {hydrateRoot} from 'react-dom/client';
import {AbdriveApp} from './App.jsx';
import './styles.css';
const root=document.getElementById('root');
const boot=JSON.parse(document.getElementById('abdrive-data').textContent);
hydrateRoot(root,<AbdriveApp boot={boot}/>);
