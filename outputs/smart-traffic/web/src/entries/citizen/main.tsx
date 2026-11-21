import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './citizen.css';
import { isDemoRoute } from './mode';

const publicMode = isDemoRoute(import.meta.env.VITE_SMTF_SUBMIT);
createRoot(document.getElementById('root')!).render(<App mode={publicMode ? 'public' : 'local'} />);
