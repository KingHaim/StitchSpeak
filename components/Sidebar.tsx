import React from 'react';
import {
  HomeIcon,
  FolderIcon,
  UsersIcon,
  GridIcon,
  MailIcon,
  BellIcon,
  BookmarkIcon,
  UserIcon,
  SettingsIcon,
} from './icons/NavIcons';
import { CloseIcon } from './icons/CloseIcon';
import type { PageId } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { label: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; pageId: PageId }[] = [
  { label: 'Dashboard', icon: HomeIcon, pageId: 'dashboard' },
  { label: 'Portfolio', icon: FolderIcon, pageId: 'portfolio' },
  { label: 'Community', icon: UsersIcon, pageId: 'community' },
  { label: 'Glossary', icon: GridIcon, pageId: 'glossary' },
  { label: 'Messages', icon: MailIcon, pageId: 'messages' },
  { label: 'Notifications', icon: BellIcon, pageId: 'notifications' },
  { label: 'History', icon: BookmarkIcon, pageId: 'history' },
  { label: 'Profile', icon: UserIcon, pageId: 'profile' },
  { label: 'Settings', icon: SettingsIcon, pageId: 'settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activePage, onNavigate }) => {
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
          fixed top-0 left-0 z-40 h-full w-[260px] bg-white border-r border-brand-200
          flex flex-col transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-5 pb-2">
          <img
            src="/logo.png"
            alt="StitchSpeak"
            className="h-20 w-20 object-contain"
          />
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-brand-400 hover:bg-brand-100 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, pageId }) => (
            <button
              key={pageId}
              onClick={() => { onNavigate(pageId); onClose(); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${activePage === pageId
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-brand-500 hover:bg-brand-50 hover:text-brand-700'
                }
              `}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4">
          <div className="bg-brand-100/60 rounded-2xl p-4 text-center">
            <img
              src="/logo.png"
              alt=""
              className="h-12 w-12 object-contain mx-auto mb-2"
            />
            <p className="text-sm font-bold text-brand-800 leading-tight">
              Stitch with someone today
            </p>
            <p className="text-xs text-brand-400 mt-1 leading-snug">
              Share ideas, ask questions and grow together.
            </p>
            <button className="mt-3 w-full py-2 px-4 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors">
              Find Community
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
