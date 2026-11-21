import { createRoot } from 'react-dom/client';
import { App } from './App';
import './officer.css';
import { isVercelDemoRoute } from '../submit/route';
import '../submit/submit.css';
import { OfficerConsole } from '../submit/officer/OfficerConsole';
import '../submit/officer/officer-console.css';

const submitRoute = isVercelDemoRoute();
if (submitRoute) document.documentElement.dataset.smtfDemo = 'vercel';
createRoot(document.getElementById('root')!).render(submitRoute ? <OfficerConsole /> : <App />);
