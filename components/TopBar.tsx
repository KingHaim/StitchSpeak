import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SearchIcon, BellIcon, MenuIcon } from './icons/NavIcons';

interface TopBarProps {
  onMenuToggle: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle }) => {
  const { user, isAuthenticated } = useAuth();

  const displayName = isAuthenticated && user?.name
    ? user.name.split(' ')[0]
    : null;

  return (
    <div className="bg-white/60 backdrop-blur-sm border-b border-brand-200 px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-xl text-brand-500 hover:bg-brand-100 transition-colors"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-brand-800 truncate">
              Welcome back{displayName ? `, ${displayName}` : ''}! 🧶
            </h1>
            <p className="text-sm text-brand-400">What are we stitching today?</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 w-64">
            <SearchIcon className="w-4 h-4 text-brand-400 shrink-0" />
            <input
              type="text"
              placeholder="Search projects, patterns, or members..."
              className="ml-2 bg-transparent text-sm text-brand-800 placeholder-brand-400 outline-none w-full"
              disabled
            />
          </div>

          <button className="relative p-2 rounded-xl text-brand-400 hover:bg-brand-100 transition-colors">
            <BellIcon className="w-5 h-5" />
          </button>

          {isAuthenticated && user?.picture ? (
            <img
              src={user.picture}
              alt=""
              className="h-9 w-9 rounded-full border-2 border-brand-200 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-brand-200 flex items-center justify-center">
              <span className="text-sm font-semibold text-brand-600">
                {displayName ? displayName[0] : '?'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
