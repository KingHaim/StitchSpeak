
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CreditProvider } from './contexts/CreditContext';
import { TechEditJobProvider } from './contexts/TechEditJobContext';
import { getGoogleOAuthClientId } from './auth/googleConfig';
import { HomepagePrototypePage } from './components/prototype/homepage/HomepagePrototypePage';
import { initAnalytics } from './services/analytics';
import './src/index.css';

initAnalytics();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isHomepagePrototype = (): boolean => {
  if (import.meta.env.PROD) return false;
  return new URLSearchParams(window.location.search).get('prototype') === 'homepage';
};

const googleClientId = getGoogleOAuthClientId();

const appTree = isHomepagePrototype() ? (
  <HomepagePrototypePage />
) : (
  <AuthProvider>
    <CreditProvider>
      <TechEditJobProvider>
        <App />
      </TechEditJobProvider>
    </CreditProvider>
  </AuthProvider>
);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {googleClientId ? (
      // Keep the Google iframe text in sync with the custom English "Sign in" overlay on landing.
      <GoogleOAuthProvider clientId={googleClientId} locale="en">
        {appTree}
      </GoogleOAuthProvider>
    ) : (
      appTree
    )}
  </React.StrictMode>
);
