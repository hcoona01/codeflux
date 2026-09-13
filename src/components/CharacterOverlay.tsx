import { useState, useEffect } from 'react'
import { Sparkles, MapPin, X, Volume2, VolumeX, RotateCcw, Square } from 'lucide-react'

const CHARACTER_SRC =
  'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png'

interface CharacterOverlayProps {
  onQuickNavigate?: (destinationId: string) => void
  onOpenContribute?: () => void
  places?: { id: string; name: string }[]
  // Voice Guidance Props
  voiceAssistanceEnabled?: boolean
  onToggleVoiceAssistance?: () => void
  isSpeaking?: boolean
  speakingText?: string | null
  onStopSpeaking?: () => void
  onReplaySpeech?: () => void
  isMobileDrawerOpen?: boolean
}

const TIPS = [
  'Welcome to Campus Navigator! Add and map any block, lab, or spot in the Contribute tab.',
  'Need directions? Add origin and destination points to calculate walking or cycling routes.',
  'Want real-world rooftop views? Click "Satellite View" on the map anytime!',
  'Found an inaccurate location? Use "Fix Location" to adjust coordinates directly on the map.',
  'Click anywhere on the map or drag the target pin to place landmarks precisely.',
]

export default function CharacterOverlay({
  onQuickNavigate,
  onOpenContribute,
  places = [],
  voiceAssistanceEnabled = true,
  onToggleVoiceAssistance,
  isSpeaking = false,
  speakingText = null,
  onStopSpeaking,
  onReplaySpeech,
  isMobileDrawerOpen = false,
}: CharacterOverlayProps) {
  const [showBubble, setShowBubble] = useState(true)
  const [tipIndex, setTipIndex] = useState(0)

  // Auto-open bubble whenever the guide begins speaking
  useEffect(() => {
    if (isSpeaking && speakingText) {
      setShowBubble(true)
    }
  }, [isSpeaking, speakingText])

  // Cycle tips periodically when not speaking
  useEffect(() => {
    if (isSpeaking) return
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length)
    }, 9000)
    return () => clearInterval(timer)
  }, [isSpeaking])

  return (
    <div
      className={`fixed z-30 select-none transition-all duration-300 pointer-events-auto ${
        isMobileDrawerOpen
          ? 'opacity-0 pointer-events-none translate-y-6 sm:opacity-100 sm:pointer-events-auto sm:translate-y-0 sm:bottom-6 sm:right-6'
          : 'opacity-100 pointer-events-auto translate-y-0 bottom-[calc(98px+env(safe-area-inset-bottom,0px))] right-3 sm:bottom-6 sm:right-6'
      }`}
    >
      <div className="relative flex flex-col items-end">
        {/* Interactive Speech Bubble */}
        {showBubble && (
          <div
            className={`mb-2 max-w-[280px] sm:max-w-[320px] max-h-[38dvh] overflow-y-auto no-scrollbar rounded-2xl border bg-white/95 p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
              isSpeaking
                ? 'border-orange-400 ring-2 ring-orange-400/30 shadow-orange-500/20'
                : 'border-orange-200'
            }`}
          >
            {/* Header with Title & Voice Toggle */}
            <div className="flex items-center justify-between gap-2 border-b border-orange-100 pb-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-600">
                <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
                <span>Verto Guide</span>
              </div>

              <div className="flex items-center gap-1">
                {/* Voice Assistance Option Toggle */}
                {onToggleVoiceAssistance && (
                  <button
                    onClick={onToggleVoiceAssistance}
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                      voiceAssistanceEnabled
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 ring-1 ring-orange-300'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={voiceAssistanceEnabled ? 'Voice Guidance Enabled (click to mute)' : 'Enable Voice Guidance'}
                  >
                    {voiceAssistanceEnabled ? (
                      <>
                        <Volume2 className="h-3 w-3 text-orange-600 animate-pulse" />
                        <span>Voice ON</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-3 w-3" />
                        <span>Voice OFF</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => setShowBubble(false)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition"
                  title="Dismiss message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Speaking Content or Campus Tips */}
            {isSpeaking && speakingText ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-orange-600">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-600"></span>
                  </span>
                  <span>Speaking Directions...</span>
                </div>
                <p className="text-xs font-semibold leading-relaxed text-slate-800 bg-orange-50/80 rounded-xl p-2.5 border border-orange-200/60">
                  "{speakingText}"
                </p>
                {/* Speech Controls */}
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  {onReplaySpeech && (
                    <button
                      onClick={onReplaySpeech}
                      className="flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 transition cursor-pointer"
                      title="Replay speech"
                    >
                      <RotateCcw className="h-3 w-3" /> Repeat
                    </button>
                  )}
                  {onStopSpeaking && (
                    <button
                      onClick={onStopSpeaking}
                      className="flex items-center gap-1 rounded-lg bg-orange-600 hover:bg-orange-700 px-2.5 py-1 text-[10px] font-bold text-white transition cursor-pointer shadow-xs"
                      title="Stop speaking"
                    >
                      <Square className="h-2.5 w-2.5 fill-current" /> Stop Voice
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {/* Character Figure with Visual Speech Feedback */}
        <div className="relative flex items-center justify-center">
          <div
            className={`relative h-28 w-24 sm:h-36 sm:w-28 cursor-pointer filter drop-shadow-xl transition-all duration-300 hover:scale-105 ${
              isSpeaking ? 'scale-105' : ''
            }`}
            onClick={() => {
              setShowBubble(true)
              if (!isSpeaking) {
                setTipIndex((prev) => (prev + 1) % TIPS.length)
              }
            }}
            title={isSpeaking ? 'Guide is speaking directions!' : 'Click to interact with Verto Guide!'}
          >
            {/* Animated Talking Aura / Wave Halo when Guide is talking */}
            {isSpeaking && (
              <div className="absolute inset-0 -m-2 rounded-full border-2 border-orange-500/60 bg-orange-400/10 animate-ping pointer-events-none" />
            )}

            <img
              src={CHARACTER_SRC}
              alt="Verto Navigation Mascot"
              className="h-full w-full object-contain"
              draggable={false}
            />

            {/* Badge */}
            <span
              className={`absolute bottom-1 right-2 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase text-white shadow-sm flex items-center gap-1 transition-colors ${
                isSpeaking ? 'bg-orange-600 animate-pulse' : 'bg-orange-600'
              }`}
            >
              {isSpeaking ? (
                <>
                  <Volume2 className="h-2.5 w-2.5 animate-bounce" />
                  <span>Speaking</span>
                </>
              ) : (
                <span>Guide</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
