import { Home, User, LogOut, ShieldCheck } from 'lucide-react'
import type { User as FirebaseUser } from 'firebase/auth'

interface NavigatorHeaderProps {
  currentUser: FirebaseUser | null
  onOpenAuth: () => void
  onSignOut: () => void
  onGoHome: (e: React.MouseEvent) => void
  activeSubView?: string
}

export default function NavigatorHeader({
  currentUser,
  onOpenAuth,
  onSignOut,
  onGoHome,
}: NavigatorHeaderProps) {
  return (
    <header className="shrink-0 z-40 w-full border-b border-orange-200/50 bg-[#fff9f4]/98 backdrop-blur-md shadow-xs">
      <div className="w-full flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Side: Return to Home Showcase & Brand Badge (Pinned to Left Corner) */}
        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href="/"
            onClick={onGoHome}
            className="group flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fff5ec] px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs font-bold text-slate-800 shadow-xs hover:border-orange-400 hover:bg-orange-100/80 hover:text-orange-950 active:scale-95 transition cursor-pointer shrink-0"
            title="Return to Campus Showcase"
            aria-label="Return to Campus Showcase"
          >
            <Home className="h-4 w-4 transition-transform group-hover:scale-110 text-orange-600 shrink-0" />
            <span className="hidden sm:inline">Campus Showcase</span>
          </a>

          <div className="h-5 w-px bg-orange-200/60 hidden sm:block" />

          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-orange-200/80 p-0.5">
              <img
                src="/lpu-logo.png"
                alt="Lovely Professional University"
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold uppercase tracking-tight text-slate-900 text-xs sm:text-sm">
                  Verto OmniRoute
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-orange-100/90 border border-orange-200/70 px-2 py-0.5 text-[10px] font-bold text-orange-800 uppercase tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Live GPS
                </span>
              </div>
              <p className="hidden md:block text-[10px] font-medium text-slate-500">
                Official Campus Navigation & Directions System
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication & Profile Section (Pinned to Right Corner) */}
        <div className="flex items-center gap-2 sm:gap-3">

          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-orange-200/80 bg-[#fff4eb] py-1 pl-2.5 pr-3 text-xs text-orange-950 shadow-xs">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-white font-bold text-[10px] shadow-xs">
                  {currentUser.email ? currentUser.email[0].toUpperCase() : 'V'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="flex items-center gap-1">
                    <span className="max-w-[150px] truncate font-semibold text-[11px] text-slate-800">
                      {currentUser.email}
                    </span>
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  </div>
                </div>
              </div>

              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 rounded-xl border border-red-200/80 bg-white/90 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition cursor-pointer shadow-xs"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 rounded-xl bg-orange-600 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 active:scale-95 transition cursor-pointer"
            >
              <User className="h-3.5 w-3.5" />
              <span>Student Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
