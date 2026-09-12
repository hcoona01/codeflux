import { useState } from 'react'
import { X, ShieldCheck, Mail, Lock, Building2, Tag, Loader2, Sparkles, AlertCircle, Zap } from 'lucide-react'
import { loginWithEmail, registerWithEmail } from '../services/firebase'
import { saveClubProfile, type ClubAdminProfile } from '../services/campusEventsApi'

interface ClubAuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (profile: ClubAdminProfile) => void
}

const CLUB_CATEGORIES = [
  { id: 'technical', label: 'Technical & Engineering' },
  { id: 'cultural', label: 'Cultural, Music & Arts' },
  { id: 'workshops', label: 'Skill Workshops & Academics' },
  { id: 'sports', label: 'Sports & E-Sports' },
  { id: 'literary', label: 'Literary & Debating' },
  { id: 'social', label: 'Social Service & NGO' },
]

const DEMO_CLUB_ACCOUNTS = [
  {
    clubName: 'Google Developer Student Club (GDSC)',
    clubCategory: 'technical',
    email: 'gdsc@lpu.co.in',
    password: 'verto@gdsc2026',
    role: 'GDSC Lead',
  },
  {
    clubName: 'RoboManiax Robotics Society',
    clubCategory: 'technical',
    email: 'robomaniax@lpu.co.in',
    password: 'verto@robo2026',
    role: 'Robotics Lead',
  },
  {
    clubName: 'LPU Cultural Affairs & Youth Council',
    clubCategory: 'cultural',
    email: 'cultural@lpu.co.in',
    password: 'verto@culture2026',
    role: 'Cultural Lead',
  },
  {
    clubName: 'CyberX Security Club',
    clubCategory: 'technical',
    email: 'cyberx@lpu.co.in',
    password: 'verto@cyber2026',
    role: 'CyberX Lead',
  },
]

export default function ClubAuthModal({ isOpen, onClose, onSuccess }: ClubAuthModalProps) {
  const [isRegister, setIsRegister] = useState(false)
  const [clubName, setClubName] = useState('')
  const [clubCategory, setClubCategory] = useState(CLUB_CATEGORIES[0].id)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  // Fast demo login helper
  const handleQuickDemoLogin = async (demo: (typeof DEMO_CLUB_ACCOUNTS)[0]) => {
    setErrorMsg(null)
    setLoading(true)
    try {
      try {
        await loginWithEmail(demo.email, demo.password)
      } catch {
        // If not registered in Firebase Auth yet, auto-register
        try {
          await registerWithEmail(demo.email, demo.password)
        } catch {
          // Local fallback allowed
        }
      }

      const profile: ClubAdminProfile = {
        clubName: demo.clubName,
        clubCategory: demo.clubCategory,
        adminEmail: demo.email,
      }
      saveClubProfile(profile)
      onSuccess(profile)
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Quick login failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setLoading(true)

    try {
      if (isRegister) {
        if (!clubName.trim()) {
          throw new Error('Please enter your official Club / Organization Name.')
        }
        try {
          await registerWithEmail(email, password)
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            await loginWithEmail(email, password)
          } else {
            throw authErr
          }
        }

        const profile: ClubAdminProfile = {
          clubName: clubName.trim(),
          clubCategory,
          adminEmail: email.trim(),
        }
        saveClubProfile(profile)
        onSuccess(profile)
        onClose()
      } else {
        try {
          await loginWithEmail(email, password)
        } catch (authErr: any) {
          // Check if this is a demo account or auto-provision if not found
          if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
            try {
              await registerWithEmail(email, password)
            } catch {
              throw authErr
            }
          } else {
            throw authErr
          }
        }

        // Check if there is an existing club profile for this email or generate friendly name
        const existingDemo = DEMO_CLUB_ACCOUNTS.find(
          (d) => d.email.toLowerCase() === email.trim().toLowerCase(),
        )
        const friendlyName = existingDemo?.clubName || clubName.trim() || `${email.split('@')[0].toUpperCase()} Society`
        const friendlyCategory = existingDemo?.clubCategory || clubCategory

        const profile: ClubAdminProfile = {
          clubName: friendlyName,
          clubCategory: friendlyCategory,
          adminEmail: email.trim(),
        }
        saveClubProfile(profile)
        onSuccess(profile)
        onClose()
      }
    } catch (err: any) {
      let msg = err.message || 'Authentication failed. Please check credentials.'
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        msg = 'Invalid club email or password. Please verify credentials or switch to Register Club.'
      } else if (msg.includes('email-already-in-use')) {
        msg = 'An account already exists for this club email. Please switch to Sign In.'
      } else if (msg.includes('weak-password')) {
        msg = 'Password should be at least 6 characters long.'
      }
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-orange-200/80 bg-[#fffdfb] p-5 sm:p-7 shadow-2xl text-slate-900">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-400 hover:bg-orange-100/60 hover:text-slate-700 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-md shadow-orange-500/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Verto Club Portal</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {isRegister ? 'Register Club Lead' : 'Club Lead Sign In'}
            </h3>
          </div>
        </div>

        {/* 1-Click Quick Demo Sign-in Box */}
        <div className="mb-4 rounded-2xl bg-[#fff5ec] border border-orange-200/80 p-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-800 uppercase tracking-wide mb-2">
            <Zap className="h-3.5 w-3.5 text-orange-600" />
            <span>1-Click Test Demo Logins (Pre-seeded)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DEMO_CLUB_ACCOUNTS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                disabled={loading}
                onClick={() => handleQuickDemoLogin(demo)}
                className="flex flex-col items-start p-2 rounded-xl bg-white hover:bg-orange-100/70 border border-orange-200 text-left transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                <span className="text-xs font-bold text-slate-800 truncate w-full">{demo.role}</span>
                <span className="text-[10px] text-orange-700 font-mono truncate w-full">{demo.email}</span>
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Official Club / Organization Name
                </label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                  <input
                    type="text"
                    required
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="e.g., GDSC LPU, RoboManiax, Cultural Council"
                    className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 pl-10 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Club Category
                </label>
                <div className="relative">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                  <select
                    value={clubCategory}
                    onChange={(e) => setClubCategory(e.target.value)}
                    className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 pl-10 pr-3 text-xs sm:text-sm text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                  >
                    {CLUB_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Club Lead Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clubname@lpu.co.in"
                className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 pl-10 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 pl-10 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 py-2.5 text-sm font-bold text-white shadow-xs transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authenticating with Firebase...</span>
              </>
            ) : isRegister ? (
              <span>Register & Access Event Portal</span>
            ) : (
              <span>Sign In to Club Portal</span>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-4 text-center text-xs text-slate-600">
          {isRegister ? (
            <p>
              Already registered your club?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false)
                  setErrorMsg(null)
                }}
                className="font-bold text-orange-600 hover:underline cursor-pointer"
              >
                Sign In here
              </button>
            </p>
          ) : (
            <p>
              Leading a new campus club?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true)
                  setErrorMsg(null)
                }}
                className="font-bold text-orange-600 hover:underline cursor-pointer"
              >
                Register your Club
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
