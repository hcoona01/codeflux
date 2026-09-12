// Voice Guidance & Speech Synthesis Service for Verto Guide

let currentUtterance: SpeechSynthesisUtterance | null = null

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

export function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices || voices.length === 0) return null

  // Prioritize high-clarity friendly English voices
  const preferred = voices.find(
    (v) =>
      v.lang.startsWith('en') &&
      (v.name.includes('Google') ||
        v.name.includes('Natural') ||
        v.name.includes('Samantha') ||
        v.name.includes('Karen') ||
        v.name.includes('Daniel') ||
        v.name.includes('Zira')),
  )

  if (preferred) return preferred

  // Fallback to any English voice
  const englishVoice = voices.find((v) => v.lang.startsWith('en'))
  return englishVoice || voices[0] || null
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

  // Clean up any markup or messy punctuation
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/m\b/g, 'meters')
    .replace(/km\b/g, 'kilometers')
    .replace(/min\b/g, 'minutes')
    .trim()

  if (!cleanText) return false

  const utterance = new SpeechSynthesisUtterance(cleanText)
  currentUtterance = utterance

  const voice = getPreferredVoice()
  if (voice) {
    utterance.voice = voice
  }

  utterance.rate = options.rate ?? 1.02
  utterance.pitch = options.pitch ?? 1.05 // slightly friendly & upbeat
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
  let speech = `Starting navigation to ${destName}. The route is approximately ${formattedDist}, estimated at ${durationMinutes} minutes.`

  if (isCampusShortcut) {
    speech += ` I've mapped an optimized campus shortcut for you.`
  }

  if (firstStepInstruction) {
    speech += ` To begin, ${firstStepInstruction}.`
  }

  return speech
}

export function buildStepSpeech(stepIndex: number, totalSteps: number, instruction: string, distanceMeters: number): string {
  const formattedDist = formatDistanceForSpeech(distanceMeters)
  return `Step ${stepIndex + 1} of ${totalSteps}. In ${formattedDist}, ${instruction}.`
}
