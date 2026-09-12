import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search,
  PlusCircle,
  MapPin,
  MessageSquare,
  Home,
  Navigation as NavIcon,
  CheckCircle2,
  Camera,
  Compass,
  X,
  Loader2,
  UploadCloud,
  Sparkles,
} from 'lucide-react'
import {
  type LostFoundItem,
  type ItemType,
  type ItemCategory,
  subscribeToLostFoundItems,
  createLostFoundItem,
  fetchCloudChats,
} from '../services/lostAndFoundApi'
import { uploadImageFile } from '../services/navigationApi'
import LostFoundChatModal from './LostFoundChatModal'

interface LostAndFoundHubProps {
  onBackToHome: () => void
  onOpenMap: (location?: { lng: number; lat: number; label: string }) => void
}

const CATEGORIES: { id: ItemCategory; label: string; icon: string }[] = [
  { id: 'electronics', label: 'Electronics', icon: '💻' },
  { id: 'id_card', label: 'Student IDs & Cards', icon: '🪪' },
  { id: 'bottle_bag', label: 'Bottles & Bags', icon: '🎒' },
  { id: 'books', label: 'Books & Notes', icon: '📚' },
  { id: 'keys', label: 'Keys', icon: '🔑' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
  { id: 'other', label: 'Other Items', icon: '📦' },
]

const CAMPUS_LOCATIONS = [
  { name: 'Central Library Lawn', lat: 31.25460, lng: 75.70560 },
  { name: 'Block 34 Cafeteria', lat: 31.25382, lng: 75.70425 },
  { name: 'UniMall Main Gate', lat: 31.25230, lng: 75.70320 },
  { name: 'Block 38 Floor 3 Lounge', lat: 31.25290, lng: 75.70340 },
  { name: 'Baldev Raj Mittal Auditorium', lat: 31.25520, lng: 75.70610 },
  { name: 'Uni-Hospital Reception', lat: 31.25150, lng: 75.70210 },
  { name: 'Boys Hostel 4 Entrance', lat: 31.25610, lng: 75.70180 },
  { name: 'Girls Hostel 1 Gate', lat: 31.25310, lng: 75.70750 },
]

export default function LostAndFoundHub({
  onBackToHome,
  onOpenMap,
}: LostAndFoundHubProps) {
  const [items, setItems] = useState<LostFoundItem[]>([])
  const [typeFilter, setTypeFilter] = useState<'all' | 'lost' | 'found' | 'resolved'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItemForChat, setSelectedItemForChat] = useState<LostFoundItem | null>(null)

  // Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportType, setReportType] = useState<ItemType>('found')
  const [reportTitle, setReportTitle] = useState('')
  const [reportDescription, setReportDescription] = useState('')
  const [reportCategory, setReportCategory] = useState<ItemCategory>('electronics')
  const [reportLocationName, setReportLocationName] = useState(CAMPUS_LOCATIONS[0].name)
  const [reportLat, setReportLat] = useState<number | undefined>(CAMPUS_LOCATIONS[0].lat)
  const [reportLng, setReportLng] = useState<number | undefined>(CAMPUS_LOCATIONS[0].lng)
  const [reportReporterName, setReportReporterName] = useState(() => {
    return localStorage.getItem('verto_chat_sender_name') || ''
  })
  const [reportContact, setReportContact] = useState('')
  const [reportImageUrl, setReportImageUrl] = useState<string>('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isCapturingGps, setIsCapturingGps] = useState(false)
  const [gpsCapturedInfo, setGpsCapturedInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Real-time items subscription
  useEffect(() => {
    const unsub = subscribeToLostFoundItems((liveItems) => {
      setItems(liveItems)
      setSelectedItemForChat((prev) => (prev ? liveItems.find((i) => i.id === prev.id) || prev : null))
    })
    return () => unsub()
  }, [])

  // Track chat counts for each case
  const [chatCounts, setChatCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let isMounted = true
    const updateCounts = async () => {
      try {
        const chats = await fetchCloudChats()
        if (!isMounted) return
        const counts: Record<string, number> = {}
        for (const [id, msgs] of Object.entries(chats)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            counts[id] = msgs.length
          }
        }
        setChatCounts(counts)
      } catch {}
    }

    updateCounts()
    const interval = setInterval(updateCounts, 6000)

    let ch: BroadcastChannel | null = null
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        ch = new BroadcastChannel('verto_lost_found_chat_bus')
        ch.onmessage = () => updateCounts()
      }
    } catch {}

    return () => {
      isMounted = false
      clearInterval(interval)
      ch?.close()
    }
  }, [])

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter === 'lost' && (item.type !== 'lost' || item.status === 'resolved')) return false
      if (typeFilter === 'found' && (item.type !== 'found' || item.status === 'resolved')) return false
      if (typeFilter === 'resolved' && item.status !== 'resolved') return false

      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchDesc = item.description.toLowerCase().includes(q)
        const matchLoc = item.locationName?.toLowerCase().includes(q)
        const matchRep = item.reporterName.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc && !matchLoc && !matchRep) return false
      }

      return true
    })
  }, [items, typeFilter, categoryFilter, searchQuery])

  // Counts
  const stats = useMemo(() => {
    const activeLost = items.filter((i) => i.type === 'lost' && i.status !== 'resolved').length
    const activeFound = items.filter((i) => i.type === 'found' && i.status !== 'resolved').length
    const resolved = items.filter((i) => i.status === 'resolved').length
    return { activeLost, activeFound, resolved }
  }, [items])

  // Live GPS capture
  const handleCaptureLiveGPS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    setIsCapturingGps(true)
    setGpsCapturedInfo(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsCapturingGps(false)
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        const acc = Math.round(pos.coords.accuracy)
        setReportLat(lat)
        setReportLng(lng)
        setReportLocationName('Captured Live GPS Spot')
        setGpsCapturedInfo(`Live GPS: ${lat}, ${lng} (±${acc}m)`)
      },
      (err) => {
        setIsCapturingGps(false)
        alert('Could not retrieve GPS coordinates. Please pick a campus spot from the list.')
        console.warn('GPS error:', err)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Handle image upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingImage(true)
    try {
      const compressedDataUrl = await uploadImageFile(file)
      setReportImageUrl(compressedDataUrl)
    } catch (err: any) {
      alert(err?.message || 'Failed to process image file')
    } finally {
      setIsUploadingImage(false)
    }
  }

  // Submit report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportTitle.trim()) {
      alert('Please provide an item title')
      return
    }
    if (!reportReporterName.trim()) {
      alert('Please provide your name or student handle')
      return
    }

    setIsSubmitting(true)
    try {
      localStorage.setItem('verto_chat_sender_name', reportReporterName.trim())

      const created = await createLostFoundItem({
        type: reportType,
        title: reportTitle.trim(),
        description: reportDescription.trim(),
        category: reportCategory,
        locationName: reportLocationName,
        latitude: reportLat,
        longitude: reportLng,
        imageUrl: reportImageUrl || undefined,
        reporterName: reportReporterName.trim(),
        reporterContact: reportContact.trim() || undefined,
      })

      setIsReportModalOpen(false)
      setReportTitle('')
      setReportDescription('')
      setReportImageUrl('')
      setGpsCapturedInfo(null)

      setSelectedItemForChat(created)
    } catch (err) {
      console.error('Error reporting item:', err)
      alert('Could not submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRedirectToMapFromChat = (loc: {
    lng: number
    lat: number
    label: string
    note?: string
    itemId?: string
  }) => {
    setSelectedItemForChat(null)
    onOpenMap({
      lng: loc.lng,
      lat: loc.lat,
      label: loc.label,
    })
  }

  return (
    <div className="relative w-full h-full min-h-screen bg-[#faf6f1] text-slate-800 flex flex-col overflow-y-auto">
      
      {/* Top Navbar: Styled identically to NavigatorHeader */}
      <header className="sticky top-0 z-40 w-full border-b border-orange-200/50 bg-[#fff9f4]/95 backdrop-blur-md shadow-xs">
        <div className="w-full flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left Side: Return to Campus Showcase & Brand */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onBackToHome}
              className="group flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fff5ec] px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:border-orange-400 hover:bg-orange-100/70 hover:text-orange-950 transition cursor-pointer"
              title="Return to Campus Showcase"
            >
              <Home className="h-3.5 w-3.5 transition-transform group-hover:scale-110 text-orange-600" />
              <span className="hidden xs:inline">Campus Showcase</span>
            </button>

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
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100/90 border border-orange-200/70 px-2 py-0.5 text-[10px] font-bold text-orange-800 uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                    Lost & Found
                  </span>
                </div>
                <p className="hidden md:block text-[10px] font-medium text-slate-500">
                  Campus Community Recovery & Handover Coordination
                </p>
              </div>
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onOpenMap()}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fff5ec] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-400 hover:bg-orange-100/70 hover:text-orange-900 transition cursor-pointer shadow-xs"
            >
              <NavIcon className="h-3.5 w-3.5 text-orange-600" />
              <span className="hidden sm:inline">Campus Map</span>
            </button>

            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer hover:scale-[1.02]"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Report Item</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner Section with Navigation-styled warmth */}
      <section className="relative px-4 sm:px-8 pt-6 pb-5 bg-gradient-to-b from-[#fff5eb] via-[#fff9f4] to-[#faf6f1] border-b border-orange-200/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Live Campus Handover Hub</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Lost & Found Registry
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
                Capture live GPS coordinates, discuss cases in real time, and tag designated campus handover spots that navigate right on the campus map!
              </p>
            </div>

            {/* Live Stats Cards in Navigation Palette */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-rose-600">{stats.activeLost}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Lost Items</p>
              </div>
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-emerald-600">{stats.activeFound}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Found Items</p>
              </div>
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-orange-600">{stats.resolved}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Recovered</p>
              </div>
            </div>
          </div>

          {/* Search Bar & Type Filters */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lost or found items by name, campus block, or description..."
                className="w-full rounded-2xl border border-orange-200/80 bg-[#fffcf9] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Type selector tabs: styled identically to Navigation chips */}
            <div className="flex items-center gap-1 bg-[#fff3e8] border border-orange-200/60 p-1 rounded-2xl shrink-0">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('lost')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  typeFilter === 'lost'
                    ? 'bg-[#fffcf9] text-rose-600 shadow-xs ring-1 ring-rose-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lost Only
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('found')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  typeFilter === 'found'
                    ? 'bg-[#fffcf9] text-emerald-600 shadow-xs ring-1 ring-emerald-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Found Only
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('resolved')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  typeFilter === 'resolved'
                    ? 'bg-[#fffcf9] text-blue-600 shadow-xs ring-1 ring-blue-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Resolved
              </button>
            </div>
          </div>

          {/* Category Filter Pills: matching Navigation explore pills */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                categoryFilter === 'all'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                  : 'bg-[#fff5ec] text-slate-700 border-orange-200/70 hover:bg-orange-100/60'
              }`}
            >
              All Categories
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                  categoryFilter === cat.id
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                    : 'bg-[#fff5ec] text-slate-700 border-orange-200/70 hover:bg-orange-100/60'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Item Cards Grid */}
      <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl mx-auto w-full">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-[#fff5ec] border border-orange-200/70 flex items-center justify-center text-3xl mb-3 shadow-xs">
              📦
            </div>
            <h3 className="text-base font-bold text-slate-900">No items found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Try adjusting your search terms or category filters, or report a newly found or missing item.
            </p>
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              + Report Item Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredItems.map((item) => {
              const isResolved = item.status === 'resolved'
              const categoryObj = CATEGORIES.find((c) => c.id === item.category)

              return (
                <div
                  key={item.id}
                  className={`group relative flex flex-col rounded-2xl border bg-[#fffcf9] transition duration-200 overflow-hidden shadow-xs hover:shadow-md hover:border-orange-400 ${
                    isResolved
                      ? 'border-slate-200 opacity-80'
                      : 'border-orange-200/80'
                  }`}
                >
                  {/* Card Image Banner */}
                  <div className="relative h-44 w-full bg-[#f6eee3] overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-br from-[#fff7ef] to-[#f4ebe1]">
                        <span className="text-4xl mb-1">{categoryObj?.icon || '📦'}</span>
                        <span className="text-[11px] font-medium text-slate-500">No Photo Attached</span>
                      </div>
                    )}

                    {/* Type & Status Badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs backdrop-blur-md ${
                          item.type === 'lost'
                            ? 'bg-rose-600 text-white ring-1 ring-rose-300'
                            : 'bg-emerald-600 text-white ring-1 ring-emerald-300'
                        }`}
                      >
                        {item.type === 'lost' ? 'Lost' : 'Found'}
                      </span>
                      {isResolved && (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-500 text-white px-2.5 py-1 rounded-full shadow-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved
                        </span>
                      )}
                    </div>

                    {/* Category pill */}
                    <div className="absolute top-2.5 right-2.5 bg-[#fffcf9]/95 border border-orange-200/80 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-slate-700 flex items-center gap-1 shadow-xs">
                      <span>{categoryObj?.icon}</span>
                      <span className="capitalize">{categoryObj?.label}</span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-orange-600 transition line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Location Coordinate / Landmark Badge */}
                      {item.locationName && (
                        <div className="mt-3 flex items-center justify-between gap-2 p-2 rounded-xl bg-[#fff5ec] border border-orange-200/60 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700 truncate">
                            <MapPin className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                            <span className="truncate font-medium">{item.locationName}</span>
                          </div>

                          {item.latitude && item.longitude && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onOpenMap({
                                  lng: item.longitude!,
                                  lat: item.latitude!,
                                  label: item.locationName || item.title,
                                })
                              }}
                              className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5 shrink-0 transition cursor-pointer"
                              title="Navigate to coordinates"
                            >
                              <span>Map</span>
                              <NavIcon className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer: Reporter & Chat Action */}
                    <div className="mt-4 pt-3 border-t border-orange-200/50 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500 truncate">
                        <span>Reported by <strong className="text-slate-700 font-semibold">{item.reporterName}</strong></span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedItemForChat(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#fff5ec] hover:bg-orange-100/80 border border-orange-200/80 text-orange-700 text-xs font-bold transition cursor-pointer shadow-xs"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-orange-600" />
                        <span>Chat & Coordinate</span>
                        {chatCounts[item.id] ? (
                          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-orange-200/80 text-orange-800 text-[10px] font-extrabold">
                            {chatCounts[item.id]}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Report Item Modal: Navigation Styled */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl max-h-[92vh] bg-[#fffdfb] border border-orange-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#fff5ec]/80 border-b border-orange-200/60">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h3 className="text-base font-extrabold text-slate-900">Report Lost or Found Item</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-orange-100/50 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitReport} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Item Status Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportType('found')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      reportType === 'found'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'bg-[#fff5ec] border-orange-200/70 text-slate-700 hover:bg-orange-100/50'
                    }`}
                  >
                    <span>🎁</span>
                    <span>I Found Something</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType('lost')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      reportType === 'lost'
                        ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                        : 'bg-[#fff5ec] border-orange-200/70 text-slate-700 hover:bg-orange-100/50'
                    }`}
                  >
                    <span>❓</span>
                    <span>I Lost Something</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Item Title *
                </label>
                <input
                  type="text"
                  required
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Dell 65W Type-C Charger, Blue Water Bottle, LPU ID Card"
                  className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Category
                </label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as ItemCategory)}
                  className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Detailed Description & Clues
                </label>
                <textarea
                  rows={3}
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Mention color, brand, stickers, where on the table it was found or last seen..."
                  className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs"
                />
              </div>

              {/* Live Geo Coordinates Capturing & Campus Spot */}
              <div className="p-3.5 rounded-2xl bg-[#fff5ec]/90 border border-orange-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700">
                    <Compass className="h-4 w-4 text-orange-600" />
                    <span>Geo Coordinates & Campus Location</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureLiveGPS}
                    disabled={isCapturingGps}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer shadow-xs"
                  >
                    {isCapturingGps ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    <span>{isCapturingGps ? 'Locating...' : 'Capture My Live GPS'}</span>
                  </button>
                </div>

                {gpsCapturedInfo && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{gpsCapturedInfo}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Or Select Campus Landmark
                  </label>
                  <select
                    value={reportLocationName}
                    onChange={(e) => {
                      const loc = CAMPUS_LOCATIONS.find((l) => l.name === e.target.value)
                      setReportLocationName(e.target.value)
                      if (loc) {
                        setReportLat(loc.lat)
                        setReportLng(loc.lng)
                      }
                    }}
                    className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    {CAMPUS_LOCATIONS.map((loc) => (
                      <option key={loc.name} value={loc.name}>
                        {loc.name}
                      </option>
                    ))}
                    {gpsCapturedInfo && (
                      <option value="Captured Live GPS Spot">Captured Live GPS Spot</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Photo Attachment */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Item Photo Attachment
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {reportImageUrl ? (
                  <div className="relative h-36 w-full rounded-2xl overflow-hidden border border-orange-200/80">
                    <img
                      src={reportImageUrl}
                      alt="Uploaded preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setReportImageUrl('')}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="w-full h-28 rounded-2xl border-2 border-dashed border-orange-200/80 hover:border-orange-400 bg-[#fff5ec]/50 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                        <span className="text-xs font-medium">Compressing photo...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="h-6 w-6 text-orange-600 mb-0.5" />
                        <span className="text-xs font-bold text-slate-800">Click to attach photo</span>
                        <span className="text-[10px] text-slate-500">JPEG, PNG, WEBP (auto-compressed)</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Reporter Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Your Name / Handle *
                  </label>
                  <input
                    type="text"
                    required
                    value={reportReporterName}
                    onChange={(e) => setReportReporterName(e.target.value)}
                    placeholder="e.g. Sahil / Aman (CSE)"
                    className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Contact / Email (Optional)
                  </label>
                  <input
                    type="text"
                    value={reportContact}
                    onChange={(e) => setReportContact(e.target.value)}
                    placeholder="e.g. your.email@lpu.in or phone"
                    className="w-full bg-[#fffcf9] border border-orange-200/80 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs"
                  />
                </div>
              </div>

              {/* Submit Actions */}
              <div className="pt-3 border-t border-orange-200/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  <span>{isSubmitting ? 'Posting...' : 'Post Report to Community'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Case Discussion & Real-Time Chat Modal */}
      {selectedItemForChat && (
        <LostFoundChatModal
          item={selectedItemForChat}
          onClose={() => setSelectedItemForChat(null)}
          onRedirectToMap={handleRedirectToMapFromChat}
        />
      )}

    </div>
  )
}
