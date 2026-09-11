import { ArrowLeft, User, LogOut, ShieldCheck } from 'lucide-react'
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
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Left Side: Return to Home Showcase & Brand Badge */}
        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href="/"
            onClick={onGoHome}
            className="group flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition cursor-pointer"
            title="Return to Home Showcase"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden xs:inline">Campus Showcase</span>
          </a>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-slate-200 p-0.5">
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
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 uppercase tracking-wide">
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

        {/* Right Side: Authentication Section (Requirement 1) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 py-1 pl-2 pr-3 text-xs text-emerald-900">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                  {currentUser.email ? currentUser.email[0].toUpperCase() : 'V'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="flex items-center gap-1">
                    <span className="max-w-[130px] truncate font-semibold text-[11px]">
                      {currentUser.email}
                    </span>
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  </div>
                </div>
              </div>

              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 rounded-xl bg-orange-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 active:scale-95 transition cursor-pointer"
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
