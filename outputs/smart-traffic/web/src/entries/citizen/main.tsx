import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './citizen.css';
import { CitizenSubmitLookup, isVercelDemoRoute } from '../submit/SubmitDemo';
import '../submit/submit.css';

const submitRoute = isVercelDemoRoute();
if (submitRoute) document.documentElement.dataset.smtfDemo = 'vercel';
createRoot(document.getElementById('root')!).render(submitRoute ? <CitizenSubmitLookup /> : <App />);
