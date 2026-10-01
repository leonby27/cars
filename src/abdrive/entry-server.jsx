import React from 'react';
import {renderToString} from 'react-dom/server';
import {AbdriveApp} from './App.jsx';
export const render=boot=>renderToString(<AbdriveApp boot={boot}/>);
