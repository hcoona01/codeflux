import { useState } from 'react'
import { X, Lock, Mail, UserCheck, AlertCircle, Loader2 } from 'lucide-react'
import { loginWithEmail, registerWithEmail } from '../services/firebase'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!email || !password) {
      setErrorMsg('Please enter both student email and password.')
      return
    }

    if (password.length < 6) {
      setErrorMsg('Password should be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password)
        setSuccessMsg('Signed in successfully!')
      } else {
        await registerWithEmail(email, password)
        setSuccessMsg('Account created and signed in!')
      }
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 700)
    } catch (err: any) {
      console.error('Firebase Auth Error:', err)
      let msg = err.message || 'Authentication failed. Please check credentials.'
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Invalid student email or password.'
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this student email already exists. Try logging in.'
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please provide a valid email format.'
      }
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#fffbf8] shadow-2xl overflow-hidden border border-orange-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <Lock className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">Verto Student Portal</h3>
                <p className="text-xs text-white/80 font-medium">Campus Navigation Authentication</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-black/15 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setErrorMsg(null)
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                mode === 'login' ? 'bg-[#fffcf9] text-orange-600 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setErrorMsg(null)
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                mode === 'register' ? 'bg-[#fffcf9] text-orange-600 shadow-sm' : 'text-white/80 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <UserCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Student Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="verto@lpu.in or name@example.com"
                  className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-orange-700 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mode === 'login' ? 'Authenticating...' : 'Creating Account...'}
              </span>
            ) : mode === 'login' ? (
              'Log In to OmniRoute'
            ) : (
              'Create Verto Account'
            )}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            {mode === 'login' ? (
              <>
                New student?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="font-semibold text-orange-600 hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="font-semibold text-orange-600 hover:underline"
                >
                  Log in here
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
