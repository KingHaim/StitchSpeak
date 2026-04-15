import React from 'react';
import type { PageId } from '../../types';

interface ComingSoonPageProps {
  pageId: PageId;
}

const PAGE_LABELS: Partial<Record<PageId, string>> = {
  projects: 'Projects',
  community: 'Community',
  messages: 'Messages',
  notifications: 'Notifications',
  saved: 'Saved',
  profile: 'Profile',
  settings: 'Settings',
};

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ pageId }) => {
  const label = PAGE_LABELS[pageId] ?? pageId;

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 text-center">
      <div className="bg-brand-100 p-6 rounded-full mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-brand-800 mb-2">{label}</h2>
      <p className="text-brand-400 text-lg mb-1">Coming soon</p>
      <p className="text-brand-400 text-sm max-w-sm">
        We're working on this feature. Stay tuned for updates!
      </p>
    </div>
  );
};
