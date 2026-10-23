import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design';
import './ui/ui.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
