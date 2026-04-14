import React from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { getGoogleOAuthClientId } from '../auth/googleConfig';

export const GoogleAuthSection: React.FC = () => {
  const { user, isAuthenticated, signInWithGoogleCredential, signOut } =
    useAuth();
  const clientId = getGoogleOAuthClientId();

  const handleSuccess = (res: CredentialResponse) => {
    if (res.credential) {
      signInWithGoogleCredential(res.credential);
    }
  };

  if (!clientId) {
    return (
      <p className="text-xs text-slate-400 max-w-[200px] text-right leading-snug">
        Add <code className="text-[10px] bg-slate-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code>{' '}
        in <code className="text-[10px] bg-slate-100 px-1 rounded">.env</code> to enable Google
        sign-in.
      </p>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-3">
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            className="h-9 w-9 rounded-full border border-rose-100 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="text-right min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[160px]">
            {user.name ?? user.email ?? 'Signed in'}
          </p>
          {user.email && user.name ? (
            <p className="text-xs text-slate-500 truncate max-w-[160px]">{user.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={signOut}
          className="text-sm font-medium text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="[&_iframe]:!shadow-none">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => {
          console.error('Google sign-in failed');
        }}
        useOneTap={false}
        theme="outline"
        size="medium"
        text="signin_with"
        shape="pill"
      />
    </div>
  );
};
