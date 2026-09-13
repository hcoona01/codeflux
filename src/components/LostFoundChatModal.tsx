import { useState, useEffect, useRef } from 'react'
import {
  X,
  Send,
  MapPin,
  CheckCircle2,
  Navigation as NavIcon,
  Sparkles,
  Loader2,
  ShieldCheck,
  Compass,
} from 'lucide-react'
import {
  type LostFoundItem,
  type ChatMessage,
  type TaggedLocation,
  subscribeToCaseChat,
  sendCaseMessage,
  updateItemStatus,
} from '../services/lostAndFoundApi'

interface LostFoundChatModalProps {
  item: LostFoundItem
  onClose: () => void
  onRedirectToMap: (location: {
    lng: number
    lat: number
    label: string
    note?: string
    itemId?: string
  }) => void
}

const CAMPUS_MEETING_SPOTS = [
  { name: 'Central Library Main Steps', lat: 31.25460, lng: 75.70560 },
  { name: 'UniMall Main Gate (Food Court)', lat: 31.25230, lng: 75.70320 },
  { name: 'Block 34 Nescafe Corner', lat: 31.25382, lng: 75.70425 },
  { name: 'BRM Auditorium Plaza', lat: 31.25520, lng: 75.70610 },
  { name: 'Uni-Hospital Reception', lat: 31.25150, lng: 75.70210 },
  { name: 'Boys Hostel 4 Front Gate', lat: 31.25610, lng: 75.70180 },
  { name: 'Girls Hostel 1 Security Post', lat: 31.25310, lng: 75.70750 },
]

export default function LostFoundChatModal({
  item,
  onClose,
  onRedirectToMap,
}: LostFoundChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [senderName, setSenderName] = useState(() => {
    return localStorage.getItem('verto_chat_sender_name') || 'Campus Student'
  })
  const [isTaggingLocation, setIsTaggingLocation] = useState(false)
  const [isCapturingGps, setIsCapturingGps] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)

  // Tagged location form state
  const [selectedSpotName, setSelectedSpotName] = useState(CAMPUS_MEETING_SPOTS[0].name)
  const [customLat, setCustomLat] = useState(CAMPUS_MEETING_SPOTS[0].lat.toString())
  const [customLng, setCustomLng] = useState(CAMPUS_MEETING_SPOTS[0].lng.toString())
  const [meetupNote, setMeetupNote] = useState('')

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Real-time Firestore & Cloud Gist & BroadcastChannel subscription
  useEffect(() => {
    const unsub = subscribeToCaseChat(item.id, (msgs) => {
      setMessages([...msgs])
    })
    return () => unsub()
  }, [item.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return

    localStorage.setItem('verto_chat_sender_name', senderName)
    setInputText('')

    await sendCaseMessage(item.id, {
      senderName,
      text: trimmed,
    })
  }

  const handleCaptureLiveGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.')
      return
    }

    setIsCapturingGps(true)
    setGpsError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsCapturingGps(false)
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        setCustomLat(lat.toString())
        setCustomLng(lng.toString())
        setSelectedSpotName('My Current Live Location (GPS)')
      },
      (err) => {
        setIsCapturingGps(false)
        setGpsError('Unable to get live GPS position. Please pick a campus spot below.')
        console.warn('GPS error:', err)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const handleSendLocation = async () => {
    const lat = parseFloat(customLat)
    const lng = parseFloat(customLng)

    if (isNaN(lat) || isNaN(lng)) {
      setGpsError('Please specify valid coordinates.')
      return
    }

    const taggedLocation: TaggedLocation = {
      latitude: lat,
      longitude: lng,
      name: selectedSpotName.trim() || 'Designated Meeting Point',
      note: meetupNote.trim() || 'Let\'s meet here to exchange the item.',
      taggedAt: new Date().toISOString(),
    }

    localStorage.setItem('verto_chat_sender_name', senderName)
    setIsTaggingLocation(false)
    setMeetupNote('')

    await sendCaseMessage(item.id, {
      senderName,
      text: `📍 Shared a meeting location: ${taggedLocation.name}`,
      taggedLocation,
    })
  }

  const handleResolveCase = async () => {
    if (!confirm('Mark this case as resolved? This confirms the item was returned or recovered.')) {
      return
    }

    setIsResolving(true)
    try {
      await updateItemStatus(item.id, 'resolved')
      await sendCaseMessage(item.id, {
        senderName: 'System',
        text: '🎉 Case has been marked as RESOLVED! The item was successfully returned.',
        isSystem: true,
      })
    } finally {
      setIsResolving(false)
    }
  }

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur()
    window.scrollTo(0, 0)
    onClose()
  }

  const handleMapRedirect = (loc: {
    lng: number
    lat: number
    label: string
    note?: string
    itemId?: string
  }) => {
    (document.activeElement as HTMLElement)?.blur()
    window.scrollTo(0, 0)
    onRedirectToMap(loc)
  }

  const isResolved = item.status === 'resolved'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="relative flex flex-col w-full max-w-2xl h-[92vh] max-h-[780px] bg-[#fffdfb] border border-orange-200/80 rounded-3xl shadow-2xl overflow-hidden text-slate-900">
        
        {/* Header: Navigation Styled */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#fff5ec]/90 border-b border-orange-200/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                className="h-11 w-11 rounded-xl object-cover ring-1 ring-orange-200 shrink-0 shadow-xs"
              />
            ) : (
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold shrink-0 border ${
                  item.type === 'lost'
                    ? 'bg-rose-50 border-rose-200 text-rose-600'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                }`}
              >
                {item.type === 'lost' ? '❓' : '🎁'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    item.type === 'lost'
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {item.type === 'lost' ? 'Lost Item' : 'Found Item'}
                </span>
                {isResolved && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3 text-amber-600" />
                    Resolved
                  </span>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate mt-0.5">{item.title}</h3>
              <p className="text-[11px] text-slate-500 truncate">
                Reported by <span className="font-semibold text-slate-700">{item.reporterName}</span> • {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isResolved && (
              <button
                type="button"
                onClick={handleResolveCase}
                disabled={isResolving}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition cursor-pointer shadow-xs"
                title="Mark case as resolved"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Mark Resolved</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-orange-100/60 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Reported Location Banner */}
        {item.latitude && item.longitude && (
          <div className="flex items-center justify-between gap-2 px-5 py-2 bg-[#fff7ef] border-b border-orange-200/50 text-xs text-slate-700 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <MapPin className="h-4 w-4 text-orange-600 shrink-0" />
              <span className="truncate">
                Reported Spot: <strong className="text-slate-900">{item.locationName || 'Campus Coordinate'}</strong> ({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                handleMapRedirect({
                  lng: item.longitude!,
                  lat: item.latitude!,
                  label: item.locationName || item.title,
                  note: `Initial location reported for: ${item.title}`,
                  itemId: item.id,
                })
              }
              className="flex items-center gap-1 px-3 py-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] transition shadow-xs cursor-pointer shrink-0"
            >
              <span>View on Map</span>
              <NavIcon className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Sender identity bar */}
        <div className="flex items-center justify-between px-5 py-2 bg-[#fffcf9] border-b border-orange-200/40 text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-orange-600" />
            <span>Chatting as:</span>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="bg-[#fff5ec] border border-orange-200/80 rounded-lg px-2 py-0.5 text-xs text-slate-800 font-semibold focus:outline-hidden focus:ring-1 focus:ring-orange-500 w-32 sm:w-44"
              placeholder="Your name"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Cloud Sync Active</span>
          </div>
        </div>

        {/* Chat message thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#faf6f1]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
              <div className="h-12 w-12 rounded-2xl bg-[#fff5ec] border border-orange-200/80 flex items-center justify-center text-xl mb-2 text-orange-600 shadow-xs">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">No messages yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                Start the conversation, ask questions about the item, or tag a campus meeting spot to coordinate a handover.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-center max-w-md shadow-xs font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{msg.text}</span>
                    </div>
                  </div>
                )
              }

              const isMe = msg.senderName.toLowerCase() === senderName.toLowerCase()

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-bold text-slate-600">{msg.senderName}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {msg.taggedLocation ? (
                    <div className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-[#fff7ef] to-[#fff1e2] border-2 border-orange-300 p-4 shadow-sm text-slate-900">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-xl bg-orange-100 text-orange-600">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-orange-700">
                            Tagged Handover Spot
                          </p>
                          <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                            {msg.taggedLocation.name}
                          </h4>
                        </div>
                      </div>

                      {msg.taggedLocation.note && (
                        <p className="text-xs text-slate-700 bg-white/80 rounded-xl p-2.5 mb-3 border border-orange-200/60 leading-relaxed">
                          "{msg.taggedLocation.note}"
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-orange-200/60">
                        <span className="text-[10px] font-mono text-slate-500">
                          {msg.taggedLocation.latitude.toFixed(4)}, {msg.taggedLocation.longitude.toFixed(4)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleMapRedirect({
                              lng: msg.taggedLocation!.longitude,
                              lat: msg.taggedLocation!.latitude,
                              label: msg.taggedLocation!.name,
                              note: msg.taggedLocation!.note,
                              itemId: item.id,
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-xs cursor-pointer hover:scale-[1.02]"
                        >
                          <NavIcon className="h-3.5 w-3.5" />
                          <span>View on Map & Navigate</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[85%] sm:max-w-md rounded-2xl px-3.5 py-2 text-xs sm:text-sm leading-relaxed shadow-xs ${
                        isMe
                          ? 'bg-orange-600 text-white rounded-tr-none'
                          : 'bg-[#fffcf9] text-slate-800 border border-orange-200/80 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Tag Location Panel */}
        {isTaggingLocation && (
          <div className="px-5 py-4 bg-[#fff5ec]/95 border-t border-orange-300 animate-in slide-in-from-bottom duration-200 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700">
                <MapPin className="h-3.5 w-3.5 text-orange-600" />
                <span>Tag Campus Meeting Point</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTaggingLocation(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Spot presets */}
            <div className="mb-2.5">
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Choose Campus Spot or Capture GPS
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSpotName}
                  onChange={(e) => {
                    const spot = CAMPUS_MEETING_SPOTS.find((s) => s.name === e.target.value)
                    setSelectedSpotName(e.target.value)
                    if (spot) {
                      setCustomLat(spot.lat.toString())
                      setCustomLng(spot.lng.toString())
                    }
                  }}
                  className="flex-1 bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20"
                >
                  {CAMPUS_MEETING_SPOTS.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  <option value="My Current Live Location (GPS)">My Current Live Location (GPS)</option>
                </select>

                <button
                  type="button"
                  onClick={handleCaptureLiveGPS}
                  disabled={isCapturingGps}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-orange-100 hover:bg-orange-200/80 border border-orange-300 text-orange-800 text-xs font-bold transition cursor-pointer shrink-0"
                  title="Capture live GPS"
                >
                  {isCapturingGps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Compass className="h-3.5 w-3.5" />
                  )}
                  <span>{isCapturingGps ? 'Locating...' : 'Use Live GPS'}</span>
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Handover Note (specific bench, clothes, time)
              </label>
              <input
                type="text"
                value={meetupNote}
                onChange={(e) => setMeetupNote(e.target.value)}
                placeholder="e.g. Meet me outside near the ATM at 4:30 PM"
                className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            {gpsError && (
              <p className="text-[11px] text-rose-600 mb-2 font-medium">{gpsError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsTaggingLocation(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendLocation}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs cursor-pointer transition"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Meeting Spot to Chat</span>
              </button>
            </div>
          </div>
        )}

        {/* Chat input bar */}
        <form
          onSubmit={handleSendText}
          className="flex items-center gap-2 p-3.5 bg-[#fff9f4] border-t border-orange-200/60 shrink-0"
        >
          <button
            type="button"
            onClick={() => setIsTaggingLocation((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 border ${
              isTaggingLocation
                ? 'bg-orange-600 text-white border-orange-600'
                : 'bg-[#fff5ec] hover:bg-orange-100/70 border-orange-200/80 text-orange-700'
            }`}
            title="Tag a meeting point on campus map"
          >
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Tag Meeting Point</span>
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message to coordinate handover..."
            className="flex-1 bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white transition shadow-xs cursor-pointer shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

      </div>
    </div>
  )
}
