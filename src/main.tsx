import { createRoot } from 'react-dom/client';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import './index.css';

injectSpeedInsights();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
