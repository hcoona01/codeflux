// Voice Guidance & Speech Synthesis Service for Verto Guide
// Configured with a youthful male kid persona (higher pitch, energetic boy pacing)

let currentUtterance: SpeechSynthesisUtterance | null = null
let cachedVoice: SpeechSynthesisVoice | null = null

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function isVoiceSpeaking(): boolean {
  return isSpeechSynthesisSupported() && (window.speechSynthesis.speaking || currentUtterance !== null)
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel()
    } catch (e) {
      console.warn('[VoiceAssistant] Error stopping speech:', e)
    }
  }
  currentUtterance = null
}

function findMaleKidVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices || voices.length === 0) return null

  // Prioritize male English voices (which pitch-shift into a vibrant kid voice)
  const maleKeywords = [
    'guy',
    'natural male',
    'male',
    'mark',
    'david',
    'daniel',
    'george',
    'ryan',
    'alex',
    'oliver',
    'christopher',
    'eric',
    'fred',
    'james',
    'liam',
  ]
  const femaleKeywords = [
    'female',
    'zira',
    'samantha',
    'karen',
    'jenny',
    'aria',
    'susan',
    'victoria',
    'eva',
    'hazel',
    'heera',
    'helena',
    'catherine',
  ]

  const englishVoices = voices.filter((v) => v.lang.startsWith('en'))

  // 1. First priority: Specifically male English voices
  const preferredMale = englishVoices.find((v) => {
    const name = v.name.toLowerCase()
    const isFemale = femaleKeywords.some((f) => name.includes(f))
    if (isFemale) return false
    return maleKeywords.some((m) => name.includes(m))
  })
  if (preferredMale) return preferredMale

  // 2. Second priority: Any English voice that is NOT identified as female
  const nonFemale = englishVoices.find((v) => {
    const name = v.name.toLowerCase()
    return !femaleKeywords.some((f) => name.includes(f))
  })
  if (nonFemale) return nonFemale

  // 3. Fallback to any English voice
  return englishVoices[0] || voices[0] || null
}

// Pre-load voices on browser ready
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = findMaleKidVoice()
  }
}

export function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  cachedVoice = findMaleKidVoice()
  return cachedVoice
}

export interface SpeakOptions {
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: any) => void
}

export function speakText(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSynthesisSupported()) return false

  stopSpeaking()

  // Clean up any markup or messy punctuation for natural kid speech
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/\bm\b/g, 'meters')
    .replace(/\bkm\b/g, 'kilometers')
    .replace(/\bmin\b/g, 'minutes')
    .trim()

  if (!cleanText) return false

  const utterance = new SpeechSynthesisUtterance(cleanText)
  currentUtterance = utterance

  const voice = getPreferredVoice()
  if (voice) {
    utterance.voice = voice
  }

  // Kid voice parameters:
  // - pitch: 1.45 (higher pitch gives a natural, cheerful young boy/kid persona)
  // - rate: 1.10 (lively, energetic pacing characteristic of an enthusiastic kid guide)
  utterance.pitch = options.pitch ?? 1.45
  utterance.rate = options.rate ?? 1.10
  utterance.volume = options.volume ?? 1.0

  utterance.onstart = () => {
    options.onStart?.()
  }

  utterance.onend = () => {
    currentUtterance = null
    options.onEnd?.()
  }

  utterance.onerror = (event) => {
    currentUtterance = null
    options.onError?.(event)
  }

  try {
    window.speechSynthesis.speak(utterance)
    return true
  } catch (err) {
    console.warn('[VoiceAssistant] Speech synthesis error:', err)
    return false
  }
}

export function formatDistanceForSpeech(meters: number): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1)
    return `${km} kilometer${parseFloat(km) > 1 ? 's' : ''}`
  }
  return `${meters} meters`
}

export function buildRouteStartSpeech(
  destName: string,
  durationMinutes: number,
  distanceMeters: number,
  firstStepInstruction?: string,
  isCampusShortcut?: boolean,
): string {
  const formattedDist = formatDistanceForSpeech(distanceMeters)
  let speech = `Hey! Starting navigation to ${destName}! The route is about ${formattedDist}, and should take around ${durationMinutes} minutes!`

  if (isCampusShortcut) {
    speech += ` Awesome, I found a campus shortcut for you!`
  }

  if (firstStepInstruction) {
    speech += ` First, ${firstStepInstruction}.`
  }

  return speech
}

export function buildStepSpeech(stepIndex: number, totalSteps: number, instruction: string, distanceMeters: number): string {
  const formattedDist = formatDistanceForSpeech(distanceMeters)
  return `Step ${stepIndex + 1} of ${totalSteps}! In ${formattedDist}, ${instruction}.`
}

export function buildTurnAlertSpeech(
  stepIndex: number,
  totalSteps: number,
  instruction: string,
  distanceMeters: number,
  isArrival?: boolean,
): string {
  if (isArrival || stepIndex >= totalSteps - 1 || instruction.toLowerCase().includes('arrive')) {
    return `Awesome! You have arrived at your destination! We did it!`
  }
  const formattedDist = formatDistanceForSpeech(distanceMeters)
  if (distanceMeters > 0) {
    return `Turn coming up in ${formattedDist}! ${instruction}!`
  }
  return `Now, ${instruction}!`
}
