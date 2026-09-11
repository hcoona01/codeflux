import { useState, useEffect } from 'react'
import { Sparkles, ChevronDown, ChevronUp, MapPin } from 'lucide-react'

const CHARACTER_SRC =
  'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png'

interface CharacterOverlayProps {
  onQuickNavigate?: (destinationId: string) => void
  onOpenContribute?: () => void
  places?: { id: string; name: string }[]
}

const TIPS = [
  'Welcome to Campus Navigator! Add and map any block, lab, or spot in the Contribute tab.',
  'Need directions? Add origin and destination points to calculate walking or cycling routes.',
  'Want real-world rooftop views? Click "Satellite View" on the map anytime!',
  'Found an inaccurate location? Use "Fix Location" to adjust coordinates directly on the map.',
  'Click anywhere on the map or drag the target pin to place landmarks precisely.',
]

export default function CharacterOverlay({ onQuickNavigate, onOpenContribute, places = [] }: CharacterOverlayProps) {
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
              {places.length > 0 ? (
                places.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onQuickNavigate?.(p.id)}
                    className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700 border border-orange-200 hover:bg-orange-100 transition cursor-pointer"
                  >
                    <MapPin className="h-3 w-3" /> {p.name}
                  </button>
                ))
              ) : (
                <button
                  onClick={() => onOpenContribute?.()}
                  className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700 border border-orange-200 hover:bg-orange-100 transition cursor-pointer"
                >
                  <MapPin className="h-3 w-3" /> ➕ Add First Place
                </button>
              )}
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
