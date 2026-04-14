import type { AppView } from '../App'

interface HeaderProps {
  view: AppView
  setView: (view: AppView) => void
  hasPattern: boolean
}

export default function Header({ view, setView, hasPattern }: HeaderProps) {
  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-purple-100 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <button
          onClick={() => setView('upload')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <span className="text-3xl">🧶</span>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            StitchSpeak
          </h1>
        </button>

        {hasPattern && (
          <nav className="flex gap-2">
            <NavButton
              active={view === 'upload'}
              onClick={() => setView('upload')}
            >
              Upload
            </NavButton>
            <NavButton
              active={view === 'translation'}
              onClick={() => setView('translation')}
            >
              Translation
            </NavButton>
            <NavButton
              active={view === 'assistant'}
              onClick={() => setView('assistant')}
            >
              AI Assistant
            </NavButton>
          </nav>
        )}
      </div>
    </header>
  )
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
        active
          ? 'bg-purple-600 text-white shadow-md'
          : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
      }`}
    >
      {children}
    </button>
  )
}
