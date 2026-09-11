import { useState, useEffect } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Navigation, Compass, MapPin } from 'lucide-react'

const CHARACTER_SRC =
  'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png'

interface CharacterOverlayProps {
  onQuickNavigate?: (destinationId: string) => void
}

const TIPS = [
  'Hey Verto! Need to find your lecture hall? Search any Block (32, 34, 38) in Explore!',
  'Looking for a quick snack? Check out UniMall Front Roundal with top cafes & outlets!',
  'Heading to sports practice? Switch to Walking or Cycling mode in Directions for the fastest loop.',
  'Want real-world rooftop views? Click "Switch to Satellite" on the map!',
  'Did you find a new landmark? Sign in to add places and walkways in the Contribute tab.',
]

export default function CharacterOverlay({ onQuickNavigate }: CharacterOverlayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length)
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-30 select-none transition-all duration-300 pointer-events-auto">
      {isExpanded ? (
        <div className="relative flex flex-col items-end">
          {/* Interactive Speech Bubble */}
          <div className="mb-2 max-w-[260px] sm:max-w-[290px] rounded-2xl border border-orange-200 bg-white/95 p-3.5 shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
                <span>Verto Navigator</span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition"
                title="Minimize Guide"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs font-medium leading-relaxed text-slate-700">
              {TIPS[tipIndex]}
            </p>

            {/* Quick Shortcuts */}
            <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => onQuickNavigate?.('lpu-unimall')}
                className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700 border border-orange-200 hover:bg-orange-100 transition cursor-pointer"
              >
                <MapPin className="h-3 w-3" /> UniMall
              </button>
              <button
                onClick={() => onQuickNavigate?.('lpu-block-34-library')}
                className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
              >
                <Compass className="h-3 w-3" /> Library
              </button>
              <button
                onClick={() => onQuickNavigate?.('lpu-main-gate-1')}
                className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
              >
                <Navigation className="h-3 w-3" /> Gate 1
              </button>
            </div>
          </div>

          {/* Character Figure Container */}
          <div className="relative flex items-center justify-center">
            <div
              className="relative h-28 w-24 sm:h-36 sm:w-28 cursor-pointer filter drop-shadow-xl transition-transform duration-300 hover:scale-105"
              onClick={() => setTipIndex((prev) => (prev + 1) % TIPS.length)}
              title="Click to switch advice!"
            >
              <img
                src={CHARACTER_SRC}
                alt="Verto Navigation Mascot"
                className="h-full w-full object-contain"
                draggable={false}
              />
              <span className="absolute bottom-1 right-2 rounded-full bg-orange-600 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-white shadow-xs">
                Guide
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed Floating Badge */
        <button
          onClick={() => setIsExpanded(true)}
          className="group flex items-center gap-2 rounded-full border border-orange-300 bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-md hover:border-orange-400 hover:bg-orange-50/90 hover:shadow-xl transition-all duration-300 cursor-pointer"
          title="Open Verto Campus Guide"
        >
          <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-orange-100 ring-2 ring-orange-500/30">
            <img
              src={CHARACTER_SRC}
              alt="Mascot"
              className="h-10 w-10 object-contain translate-y-1 scale-125"
              draggable={false}
            />
          </div>
          <div className="text-left pr-1 hidden xs:block">
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
              <span>Verto Guide</span>
              <Sparkles className="h-3 w-3 text-amber-500" />
            </div>
            <p className="text-[9px] font-medium text-slate-500">Need directions?</p>
          </div>
          <ChevronUp className="h-4 w-4 text-orange-600 transition-transform group-hover:-translate-y-0.5" />
        </button>
      )}
    </div>
  )
}
