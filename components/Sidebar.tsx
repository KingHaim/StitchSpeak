import React from 'react';
import {
  HomeIcon,
  FolderIcon,
  GridIcon,
  SettingsIcon,
} from './icons/NavIcons';
import { CloseIcon } from './icons/CloseIcon';
import { useAuth } from '../contexts/AuthContext';
import { getBalance } from '../services/creditService';
import type { PageId } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { label: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; pageId: PageId }[] = [
  { label: 'Translate', icon: HomeIcon, pageId: 'dashboard' },
  { label: 'My Patterns', icon: FolderIcon, pageId: 'history' },
  { label: 'Glossary', icon: GridIcon, pageId: 'glossary' },
  { label: 'Settings', icon: SettingsIcon, pageId: 'settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activePage, onNavigate }) => {
  const { user, isAuthenticated } = useAuth();
  const balance = isAuthenticated && user?.email ? getBalance(user.email) : 0;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-brand-900/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-20 bg-white border-r border-brand-200
          flex flex-col items-center transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="pt-4 pb-2">
          <img
            src="/logo.png"
            alt="StitchSpeak"
            className="h-11 w-11 object-contain"
          />
        </div>

        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-brand-400 hover:bg-brand-100 transition-colors mb-2"
        >
          <CloseIcon className="w-4 h-4" />
        </button>

        <nav className="flex-1 flex flex-col items-center gap-1 pt-4 w-full px-2">
          {navItems.map(({ label, icon: Icon, pageId }) => (
            <button
              key={pageId}
              onClick={() => { onNavigate(pageId); onClose(); }}
              className={`
                flex flex-col items-center justify-center gap-1 w-full py-2.5 rounded-xl transition-colors
                ${activePage === pageId
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-brand-400 hover:bg-brand-50 hover:text-brand-700'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          ))}
        </nav>

        {isAuthenticated && (
          <div className="pb-4 pt-2 flex flex-col items-center">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-100" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-600"
                  strokeDasharray={`${Math.min(balance, 100)} 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-brand-800">
                {balance % 1 === 0 ? balance : balance.toFixed(1)}
              </span>
            </div>
            <span className="text-[9px] text-brand-400 font-medium mt-1">Credits</span>
          </div>
        )}
      </aside>
    </>
  );
};
