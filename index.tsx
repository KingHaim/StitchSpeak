
import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { getGoogleOAuthClientId } from './auth/googleConfig';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const googleClientId = getGoogleOAuthClientId();

const appTree = (
  <AuthProvider>
    <App />
  </AuthProvider>
);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>{appTree}</GoogleOAuthProvider>
    ) : (
      appTree
    )}
  </React.StrictMode>
);
