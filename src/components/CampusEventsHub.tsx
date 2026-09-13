import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search,
  PlusCircle,
  MapPin,
  Home,
  Navigation as NavIcon,
  Calendar,
  Clock,
  ExternalLink,
  Heart,
  X,
  Loader2,
  UploadCloud,
  Sparkles,
  ShieldCheck,
  LogOut,
  Crosshair,
  Share2,
  CheckCircle2,
  Edit3,
  Trash2,
  Map,
} from 'lucide-react'
import {
  type CampusEvent,
  type ClubAdminProfile,
  subscribeToCampusEvents,
  createCampusEvent,
  updateCampusEvent,
  deleteCampusEvent,
  getSavedClubProfile,
  saveClubProfile,
  getUserInterestedEvents,
  toggleUserInterested,
} from '../services/campusEventsApi'
import { uploadImageFile } from '../services/navigationApi'
import { subscribeToAuthChanges, logoutUser } from '../services/firebase'
import ClubAuthModal from './ClubAuthModal'
import MapLocationPickerModal from './MapLocationPickerModal'

interface CampusEventsHubProps {
  onBackToHome: () => void
  onNavigateToEvent: (eventLocation: {
    lng: number
    lat: number
    title: string
    venue: string
  }) => void
}

const EVENT_CATEGORIES = [
  { id: 'all', label: 'All Categories', icon: '🎪' },
  { id: 'technical', label: 'Technical', icon: '💻' },
  { id: 'hackathon', label: 'Hackathons', icon: '⚡' },
  { id: 'cultural', label: 'Cultural & Music', icon: '🎭' },
  { id: 'workshop', label: 'Skill Workshops', icon: '🛠️' },
  { id: 'sports', label: 'Sports & E-Sports', icon: '⚽' },
  { id: 'literary', label: 'Literary & Debating', icon: '📖' },
  { id: 'social', label: 'Social & NGO', icon: '🤝' },
]

const VENUE_PRESETS = [
  { name: 'Baldev Raj Mittal Auditorium (Block 38)', lat: 31.2552, lng: 75.7061 },
  { name: 'Shanti Devi Mittal Auditorium (Block 32)', lat: 31.2529, lng: 75.7034 },
  { name: 'Uni-Mall Open Stage & Atrium', lat: 31.2523, lng: 75.7032 },
  { name: 'Central Library Lawn & Plaza', lat: 31.2546, lng: 75.7056 },
  { name: 'Block 34 Robotics & Tech Arena', lat: 31.25382, lng: 75.70425 },
  { name: 'Indoor Sports Complex & Gymnasium', lat: 31.2561, lng: 75.7018 },
  { name: 'Student Center Food Street Lawn', lat: 31.2515, lng: 75.7021 },
  { name: 'Open Air Amphitheatre (Block 25)', lat: 31.2541, lng: 75.7048 },
]

export default function CampusEventsHub({
  onBackToHome,
  onNavigateToEvent,
}: CampusEventsHubProps) {
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'today'>('all')
  const [viewScope, setViewScope] = useState<'all' | 'my_posts'>('all')

  // Auth State
  const [clubProfile, setClubProfile] = useState<ClubAdminProfile | null>(() => getSavedClubProfile())
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // Interested Tracker
  const [interestedEventIds, setInterestedEventIds] = useState<string[]>([])

  // Create & Edit Event Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState(EVENT_CATEGORIES[1].id)
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventTime, setNewEventTime] = useState('')
  const [newVenueName, setNewVenueName] = useState(VENUE_PRESETS[0].name)
  const [newLat, setNewLat] = useState<number>(VENUE_PRESETS[0].lat)
  const [newLng, setNewLng] = useState<number>(VENUE_PRESETS[0].lng)
  const [newRegUrl, setNewRegUrl] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCapturingGps, setIsCapturingGps] = useState(false)
  const [gpsCapturedInfo, setGpsCapturedInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Map Picker Modal
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false)

  // Details Modal
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<CampusEvent | null>(null)
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null)

  // Subscribe to real-time events across all users
  useEffect(() => {
    const unsub = subscribeToCampusEvents((liveEvents) => {
      setEvents(liveEvents)
      setSelectedEventForDetails((prev) => (prev ? liveEvents.find((e) => e.id === prev.id) || prev : null))
    })
    setInterestedEventIds(getUserInterestedEvents())
    return () => unsub()
  }, [])

  // Sync auth state
  useEffect(() => {
    const unsub = subscribeToAuthChanges((user) => {
      if (!user) {
        setClubProfile(null)
        saveClubProfile(null)
        setViewScope('all')
      } else {
        const profile = getSavedClubProfile()
        if (profile) setClubProfile(profile)
      }
    })
    return () => unsub()
  }, [])

  // Reset form
  const handleResetForm = () => {
    setEditingEventId(null)
    setNewTitle('')
    setNewDescription('')
    setNewCategory(EVENT_CATEGORIES[1].id)
    setNewEventDate('')
    setNewEventTime('')
    setNewVenueName(VENUE_PRESETS[0].name)
    setNewLat(VENUE_PRESETS[0].lat)
    setNewLng(VENUE_PRESETS[0].lng)
    setNewRegUrl('')
    setNewImageUrl('')
    setGpsCapturedInfo(null)
  }

  // Open Edit Event Modal
  const handleOpenEditEvent = (event: CampusEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingEventId(event.id)
    setNewTitle(event.title)
    setNewDescription(event.description)
    setNewCategory(event.clubCategory)
    setNewEventDate(event.eventDate)
    setNewEventTime(event.startTime)
    setNewVenueName(event.venue)
    setNewLat(event.latitude)
    setNewLng(event.longitude)
    setNewImageUrl(event.imageUrl || '')
    setNewRegUrl(event.registrationUrl || '')
    setGpsCapturedInfo(`Current Coordinates: ${event.latitude}, ${event.longitude}`)
    setIsCreateModalOpen(true)
  }

  // Toggle Interested
  const handleToggleInterested = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleUserInterested(eventId)
    setInterestedEventIds(getUserInterestedEvents())
  }

  // Handle Preset Venue change
  const handleVenuePresetChange = (presetName: string) => {
    setNewVenueName(presetName)
    const preset = VENUE_PRESETS.find((v) => v.name === presetName)
    if (preset) {
      setNewLat(preset.lat)
      setNewLng(preset.lng)
      setGpsCapturedInfo(null)
    }
  }

  // Capture Live GPS for event location
  const handleCaptureLiveGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setIsCapturingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsCapturingGps(false)
        const lat = Number(pos.coords.latitude.toFixed(5))
        const lng = Number(pos.coords.longitude.toFixed(5))
        setNewLat(lat)
        setNewLng(lng)
        setGpsCapturedInfo(`GPS Captured: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`)
      },
      (err) => {
        setIsCapturingGps(false)
        alert('Could not acquire device GPS: ' + err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Upload Poster
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingImage(true)
    try {
      const url = await uploadImageFile(file)
      setNewImageUrl(url)
    } catch (err: any) {
      alert('Failed to upload image: ' + err.message)
    } finally {
      setIsUploadingImage(false)
    }
  }

  // Submit New or Edited Event
  const handleCreateOrUpdateEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clubProfile) {
      setIsAuthModalOpen(true)
      return
    }
    if (!newTitle.trim() || !newEventDate.trim()) {
      alert('Please provide an event title and scheduled date.')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingEventId) {
        // Edit Mode
        await updateCampusEvent(editingEventId, {
          title: newTitle.trim(),
          description: newDescription.trim(),
          clubCategory: newCategory as CampusEvent['clubCategory'],
          eventDate: newEventDate,
          startTime: newEventTime || '10:00 AM',
          venue: newVenueName.trim() || 'LPU Campus Venue',
          latitude: newLat,
          longitude: newLng,
          imageUrl: newImageUrl || undefined,
          registrationUrl: newRegUrl.trim() || undefined,
        })
      } else {
        // Create Mode
        await createCampusEvent({
          title: newTitle.trim(),
          description: newDescription.trim(),
          clubName: clubProfile.clubName,
          clubCategory: newCategory as CampusEvent['clubCategory'],
          eventDate: newEventDate,
          startTime: newEventTime || '10:00 AM',
          venue: newVenueName.trim() || 'LPU Campus Venue',
          latitude: newLat,
          longitude: newLng,
          imageUrl: newImageUrl || undefined,
          registrationUrl: newRegUrl.trim() || undefined,
          postedByEmail: clubProfile.adminEmail,
        })
      }

      // Reset form
      setIsCreateModalOpen(false)
      handleResetForm()
    } catch (err: any) {
      alert('Failed to save event: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Club Logout
  const handleLogout = async () => {
    await logoutUser()
    setClubProfile(null)
    saveClubProfile(null)
    setViewScope('all')
  }

  // Share Event Link
  const handleShare = (event: CampusEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `Check out "${event.title}" organized by ${event.clubName} at ${event.venue} on ${event.eventDate}!\nJoin on Verto Campus Events!`,
      )
      setCopiedEventId(event.id)
      setTimeout(() => setCopiedEventId(null), 2500)
    }
  }

  // My posts count
  const myEventsCount = useMemo(() => {
    if (!clubProfile) return 0
    return events.filter(
      (e) => e.postedByEmail.toLowerCase() === clubProfile.adminEmail.toLowerCase(),
    ).length
  }, [events, clubProfile])

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (viewScope === 'my_posts') {
        if (!clubProfile) return false
        if (evt.postedByEmail.toLowerCase() !== clubProfile.adminEmail.toLowerCase()) {
          return false
        }
      }

      const matchesCategory = selectedCategory === 'all' || evt.clubCategory === selectedCategory
      const matchesSearch =
        searchQuery === '' ||
        evt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.clubName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.description.toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchesCategory || !matchesSearch) return false

      if (timeFilter === 'upcoming') {
        const today = new Date().toISOString().split('T')[0]
        return evt.eventDate >= today
      }

      return true
    })
  }, [events, selectedCategory, searchQuery, timeFilter, viewScope, clubProfile])

  // Stats calculation
  const uniqueClubsCount = useMemo(() => {
    return new Set(events.map((e) => e.clubName)).size
  }, [events])

  const totalInterestedCount = useMemo(() => {
    return events.reduce((acc, curr) => acc + (curr.interestedCount || 0), 0)
  }, [events])

  return (
    <div className="relative w-full h-full h-[100dvh] max-h-[100dvh] bg-[#faf6f1] text-slate-800 flex flex-col overflow-hidden">
      {/* Top Navbar: Styled identically to LostAndFoundHub & Navigator - Locked at top */}
      <header className="shrink-0 z-40 w-full border-b border-orange-200/50 bg-[#fff9f4]/98 backdrop-blur-md shadow-xs">
        <div className="w-full flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left Side: Return to Campus Showcase & Brand */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onBackToHome}
              className="group flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fff5ec] px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs font-bold text-slate-800 shadow-xs hover:border-orange-400 hover:bg-orange-100/80 hover:text-orange-950 active:scale-95 transition cursor-pointer shrink-0"
              title="Return to Campus Showcase"
              aria-label="Return to Campus Showcase"
            >
              <Home className="h-4 w-4 transition-transform group-hover:scale-110 text-orange-600 shrink-0" />
              <span className="hidden sm:inline">Campus Showcase</span>
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
                    Campus Events
                  </span>
                </div>
                <p className="hidden md:block text-[10px] font-medium text-slate-500">
                  Campus Club Activities, Hackathons & Cultural Gatherings
                </p>
              </div>
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() =>
                onNavigateToEvent({
                  lng: 75.7032,
                  lat: 31.2523,
                  title: 'Campus Central',
                  venue: 'LPU Main Campus',
                })
              }
              className="flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fff5ec] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-400 hover:bg-orange-100/70 hover:text-orange-900 transition cursor-pointer shadow-xs"
              title="Open 3D Campus Map"
            >
              <NavIcon className="h-3.5 w-3.5 text-orange-600" />
              <span className="hidden sm:inline">Campus Map</span>
            </button>

            {/* Club Admin Authentication / Action */}
            {clubProfile ? (
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="max-w-[130px] truncate">{clubProfile.clubName}</span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ml-1 p-0.5 text-emerald-700 hover:text-rose-600 transition cursor-pointer"
                    title="Logout Club Lead"
                  >
                    <LogOut className="h-3 w-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleResetForm()
                    setIsCreateModalOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer hover:scale-[1.02]"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Post Event</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer hover:scale-[1.02]"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Club Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable Page Body (Header stays permanently fixed at top) */}
      <div className="flex-1 w-full overflow-y-auto overscroll-contain flex flex-col">
        {/* Hero Banner Section: Warmth & Layout identical to LostAndFoundHub */}
        <section className="relative px-4 sm:px-8 pt-6 pb-5 bg-gradient-to-b from-[#fff5eb] via-[#fff9f4] to-[#faf6f1] border-b border-orange-200/50 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Verified Campus Club Hub</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Campus Events & Hackathons
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">
                Explore upcoming club workshops, cultural fests, competitions, and guest talks across LPU. Tap any venue coordinates to calculate your route and start live turn-by-turn navigation!
              </p>
            </div>

            {/* Live Stats Cards in Navigation Palette */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-orange-600">{events.length}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Events</p>
              </div>
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-emerald-600">{uniqueClubsCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Clubs</p>
              </div>
              <div className="bg-[#fffcf9] border border-orange-200/70 rounded-2xl px-4 py-2.5 text-center min-w-[96px] shadow-xs">
                <p className="text-xl font-extrabold text-blue-600">{totalInterestedCount}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Interested</p>
              </div>
            </div>
          </div>

          {/* Search Bar, Scope Switcher & Schedule Tabs */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campus events by club, topic, venue, or keyword..."
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

            {/* Club Admin View Scope Toggle: All Events vs My Club Posts */}
            {clubProfile && (
              <div className="flex items-center gap-1 bg-[#fff3e8] border border-orange-200/60 p-1 rounded-2xl shrink-0">
                <button
                  type="button"
                  onClick={() => setViewScope('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    viewScope === 'all'
                      ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Events
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope('my_posts')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    viewScope === 'my_posts'
                      ? 'bg-[#fffcf9] text-emerald-700 shadow-xs ring-1 ring-emerald-300'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>My Club Posts ({myEventsCount})</span>
                </button>
              </div>
            )}

            {/* Time selector tabs */}
            <div className="flex items-center gap-1 bg-[#fff3e8] border border-orange-200/60 p-1 rounded-2xl shrink-0">
              <button
                type="button"
                onClick={() => setTimeFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  timeFilter === 'all'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Dates
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('upcoming')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  timeFilter === 'upcoming'
                    ? 'bg-[#fffcf9] text-emerald-600 shadow-xs ring-1 ring-emerald-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  timeFilter === 'today'
                    ? 'bg-[#fffcf9] text-blue-600 shadow-xs ring-1 ring-blue-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Soon
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {EVENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                  selectedCategory === cat.id
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

      {/* Main Event Cards Grid */}
      <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl mx-auto w-full">
        {/* Admin Management Header if inside My Club Posts */}
        {clubProfile && viewScope === 'my_posts' && (
          <div className="mb-5 rounded-2xl bg-[#fff5ec] border border-orange-200/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-md shadow-orange-500/20 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  {clubProfile.clubName} — Event Management Portal
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  You have published <strong>{myEventsCount}</strong> events. Edit descriptions, geocoordinates, or delete posts in real time.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                handleResetForm()
                setIsCreateModalOpen(true)
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ Post New Event</span>
            </button>
          </div>
        )}

        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-[#fff5ec] border border-orange-200/70 flex items-center justify-center text-3xl mb-3 shadow-xs">
              🎪
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {viewScope === 'my_posts' ? 'No posts by your club yet' : 'No events found'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {viewScope === 'my_posts'
                ? 'Create and publish your first official club event with interactive map geocoordinates.'
                : 'Try adjusting your search query, change category filters, or publish a new event for your campus club.'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!clubProfile) setIsAuthModalOpen(true)
                else {
                  handleResetForm()
                  setIsCreateModalOpen(true)
                }
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              + Post Event Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredEvents.map((event) => {
              const isInterested = interestedEventIds.includes(event.id)
              const categoryObj = EVENT_CATEGORIES.find((c) => c.id === event.clubCategory)
              const isAuthor =
                clubProfile &&
                clubProfile.adminEmail.toLowerCase() === event.postedByEmail.toLowerCase()

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEventForDetails(event)}
                  className="group relative flex flex-col rounded-2xl border border-orange-200/80 bg-[#fffcf9] transition duration-200 overflow-hidden shadow-xs hover:shadow-md hover:border-orange-400 cursor-pointer"
                >
                  {/* Card Image Banner */}
                  <div className="relative h-44 w-full bg-[#f6eee3] overflow-hidden">
                    {event.imageUrl ? (
                      <img
                        src={event.imageUrl}
                        alt={event.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-br from-[#fff7ef] to-[#f4ebe1]">
                        <span className="text-4xl mb-1">{categoryObj?.icon || '🎪'}</span>
                        <span className="text-[11px] font-medium text-slate-500">Official Club Event</span>
                      </div>
                    )}

                    {/* Club Name & Verified Badge */}
                    <div className="absolute top-2.5 left-2.5 bg-[#fffcf9]/95 border border-orange-200/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800 shadow-xs flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      <span className="max-w-[130px] truncate">{event.clubName}</span>
                    </div>

                    {/* Category pill */}
                    <div className="absolute top-2.5 right-2.5 bg-orange-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide shadow-xs">
                      {event.clubCategory}
                    </div>

                    {/* Date & Time pill over image bottom */}
                    <div className="absolute bottom-2.5 left-2.5 bg-slate-950/75 backdrop-blur-xs text-white px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-orange-400" />
                        <span>{event.eventDate}</span>
                      </div>
                      <span className="text-slate-400">·</span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-orange-400" />
                        <span>{event.startTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-orange-600 transition line-clamp-1">
                        {event.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {event.description}
                      </p>

                      {/* Venue Geocoordinate Badge: Identical to Lost & Found Location badge */}
                      <div className="mt-3 flex items-center justify-between gap-2 p-2 rounded-xl bg-[#fff5ec] border border-orange-200/60 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-700 truncate">
                          <MapPin className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                          <span className="truncate font-medium">{event.venue}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onNavigateToEvent({
                              lng: event.longitude,
                              lat: event.latitude,
                              title: event.title,
                              venue: event.venue,
                            })
                          }}
                          className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 shrink-0 transition cursor-pointer bg-white px-2 py-0.5 rounded-lg border border-orange-200 shadow-xs"
                          title="Navigate on Campus Map"
                        >
                          <span>Map</span>
                          <NavIcon className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>

                    {/* Footer: Interested Count & Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-orange-200/50 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleToggleInterested(event.id, e)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer shadow-xs ${
                          isInterested
                            ? 'bg-rose-50 border-rose-200 text-rose-600'
                            : 'bg-[#fff5ec] border-orange-200/70 text-slate-600 hover:bg-orange-100/60'
                        }`}
                        title="Mark Interested"
                      >
                        <Heart className={`h-3.5 w-3.5 ${isInterested ? 'fill-rose-600 text-rose-600' : 'text-slate-400'}`} />
                        <span>{event.interestedCount || 0}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleShare(event, e)}
                          className="rounded-xl border border-orange-200/80 bg-[#fff5ec] p-2 text-slate-600 hover:text-orange-600 hover:bg-orange-100/70 transition cursor-pointer shadow-xs"
                          title="Share Event"
                        >
                          {copiedEventId === event.id ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Share2 className="h-3.5 w-3.5 text-orange-600" />
                          )}
                        </button>

                        {/* Edit Button for Event Author */}
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditEvent(event, e)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-700 text-xs font-bold transition cursor-pointer shadow-xs"
                            title="Edit Event & Geocoordinates"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-orange-600" />
                            <span>Edit</span>
                          </button>
                        )}

                        {/* Delete Button for Event Author */}
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
                                await deleteCampusEvent(event.id)
                              }
                            }}
                            className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2 py-1.5 text-xs font-bold text-rose-600 transition cursor-pointer shadow-xs"
                            title="Delete Event"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onNavigateToEvent({
                              lng: event.longitude,
                              lat: event.latitude,
                              title: event.title,
                              venue: event.venue,
                            })
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                        >
                          <NavIcon className="h-3 w-3" />
                          <span>Navigate</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
      </div>

      {/* Post or Edit Event Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl max-h-[92vh] bg-[#fffdfb] border border-orange-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#fff5ec]/80 border-b border-orange-200/60">
              <div className="flex items-center gap-2">
                <span className="text-xl">{editingEventId ? '✏️' : '📢'}</span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingEventId ? 'Edit Campus Event & Coordinates' : 'Publish Campus Event'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Club Lead: <strong>{clubProfile?.clubName || 'Club Admin'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  handleResetForm()
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-orange-100/50 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateOrUpdateEventSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., CodeStorm Hackathon 2026, One World Cultural Gala"
                  className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2.5 text-xs sm:text-sm text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                  >
                    {EVENT_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Event Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={newEventDate}
                      onChange={(e) => setNewEventDate(e.target.value)}
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                      Start Time
                    </label>
                    <input
                      type="text"
                      value={newEventTime}
                      onChange={(e) => setNewEventTime(e.target.value)}
                      placeholder="e.g., 10:00 AM"
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Event Description
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the agenda, who can attend, prizes, and key instructions..."
                  className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                />
              </div>

              {/* Venue & Geocoordinates Selector */}
              <div className="rounded-2xl bg-[#fff5ec] border border-orange-200/70 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-orange-900 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-orange-600" />
                    Campus Venue & Navigation Coordinates
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Choose on Map Button */}
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className="flex items-center gap-1 text-[11px] font-bold text-orange-800 bg-white border border-orange-300 px-2.5 py-1 rounded-xl shadow-xs hover:bg-orange-100 transition cursor-pointer"
                    >
                      <Map className="h-3.5 w-3.5 text-orange-600" />
                      <span>Choose on Map</span>
                    </button>

                    {/* GPS Button */}
                    <button
                      type="button"
                      onClick={handleCaptureLiveGps}
                      disabled={isCapturingGps}
                      className="flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-white border border-orange-200 px-2.5 py-1 rounded-xl shadow-xs hover:bg-orange-50 transition cursor-pointer"
                    >
                      {isCapturingGps ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crosshair className="h-3.5 w-3.5 text-orange-600" />
                      )}
                      <span>{isCapturingGps ? 'Reading...' : 'My GPS'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Select LPU Campus Venue Preset or Type Custom Venue Name
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={newVenueName}
                      onChange={(e) => handleVenuePresetChange(e.target.value)}
                      className="flex-1 rounded-xl border border-orange-200 bg-white p-2 text-xs text-slate-800 focus:border-orange-500 shadow-xs"
                    >
                      {VENUE_PRESETS.map((vp) => (
                        <option key={vp.name} value={vp.name}>
                          {vp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={newVenueName}
                    onChange={(e) => setNewVenueName(e.target.value)}
                    placeholder="Or type specific venue room / gate..."
                    className="w-full mt-1.5 rounded-xl border border-orange-200 bg-white p-2 text-xs text-slate-800 shadow-xs focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={newLat}
                      onChange={(e) => setNewLat(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-orange-200 bg-white p-2 text-xs text-slate-800 shadow-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={newLng}
                      onChange={(e) => setNewLng(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-orange-200 bg-white p-2 text-xs text-slate-800 shadow-xs font-mono"
                    />
                  </div>
                </div>

                {gpsCapturedInfo && (
                  <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {gpsCapturedInfo}
                  </p>
                )}
              </div>

              {/* Poster Upload or URL */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Event Poster Image
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Paste image link or upload below..."
                    className="flex-1 rounded-xl border border-orange-200/80 bg-[#fffcf9] p-2.5 text-xs text-slate-800 shadow-xs"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-3 py-2 rounded-xl border border-orange-200 bg-[#fff5ec] hover:bg-orange-100 text-orange-800 text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4 text-orange-600" />
                    )}
                    <span>{isUploadingImage ? 'Uploading...' : 'Upload'}</span>
                  </button>
                </div>
              </div>

              {/* Registration / RSVP URL */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                  Registration / RSVP Link (Optional)
                </label>
                <div className="relative">
                  <ExternalLink className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                  <input
                    type="url"
                    value={newRegUrl}
                    onChange={(e) => setNewRegUrl(e.target.value)}
                    placeholder="https://unstop.com or Google Form link"
                    className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2.5 pl-10 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-xs transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving Event in Real-Time...</span>
                  </>
                ) : editingEventId ? (
                  <span>Update Event Changes</span>
                ) : (
                  <span>Publish Campus Event</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Map Location Picker Modal */}
      <MapLocationPickerModal
        isOpen={isMapPickerOpen}
        initialLat={newLat}
        initialLng={newLng}
        initialVenue={newVenueName}
        onClose={() => setIsMapPickerOpen(false)}
        onSelectLocation={({ lat, lng, venueSuggestion }) => {
          setNewLat(lat)
          setNewLng(lng)
          if (venueSuggestion) {
            setNewVenueName(venueSuggestion)
          }
          setGpsCapturedInfo(`Map Selected: ${lat}, ${lng}${venueSuggestion ? ` (Near ${venueSuggestion})` : ''}`)
        }}
      />

      {/* Event Details Modal: LostAndFound Styled */}
      {selectedEventForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[90vh] bg-[#fffdfb] border border-orange-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
            {/* Modal Image Header */}
            <div className="relative h-48 sm:h-56 w-full bg-[#f6eee3] overflow-hidden">
              {selectedEventForDetails.imageUrl ? (
                <img
                  src={selectedEventForDetails.imageUrl}
                  alt={selectedEventForDetails.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-[#fff7ef] to-[#f4ebe1] text-slate-400">
                  <span className="text-5xl mb-1">🎪</span>
                  <span className="text-xs font-semibold text-slate-500">Official Campus Event</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedEventForDetails(null)}
                className="absolute top-3 right-3 rounded-full bg-slate-950/60 p-2 text-white hover:bg-slate-950/80 transition cursor-pointer backdrop-blur-xs"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="absolute top-3 left-3 bg-[#fffcf9]/95 border border-orange-200/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-800 shadow-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>{selectedEventForDetails.clubName}</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 border border-orange-200 text-orange-800">
                  {selectedEventForDetails.clubCategory}
                </span>

                {/* Edit & Delete directly from Details Modal if author */}
                {clubProfile &&
                  clubProfile.adminEmail.toLowerCase() ===
                    selectedEventForDetails.postedByEmail.toLowerCase() && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const evt = selectedEventForDetails
                          setSelectedEventForDetails(null)
                          handleOpenEditEvent(evt)
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-700 text-xs font-bold transition cursor-pointer shadow-2xs"
                      >
                        <Edit3 className="h-3 w-3 text-orange-600" />
                        <span>Edit Post</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            confirm(
                              `Delete "${selectedEventForDetails.title}" from campus events?`,
                            )
                          ) {
                            await deleteCampusEvent(selectedEventForDetails.id)
                            setSelectedEventForDetails(null)
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition cursor-pointer shadow-2xs"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                {selectedEventForDetails.title}
              </h2>

              {/* Date, Time & Venue */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#fff5ec] border border-orange-200/60">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Scheduled Date & Time
                  </span>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-orange-600" />
                    <span>{selectedEventForDetails.eventDate}</span>
                  </div>
                  <div className="text-slate-600 font-medium mt-0.5 pl-5">
                    {selectedEventForDetails.startTime}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#fff5ec] border border-orange-200/60">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Venue & Location
                  </span>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                    <MapPin className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                    <span className="truncate">{selectedEventForDetails.venue}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 pl-5">
                    {selectedEventForDetails.latitude}, {selectedEventForDetails.longitude}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-600 mb-1">Event Overview</h4>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-[#fffcf9] p-3 rounded-2xl border border-orange-200/60">
                  {selectedEventForDetails.description || 'No additional description provided.'}
                </p>
              </div>

              {/* Actions in Details Modal */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const evt = selectedEventForDetails
                    setSelectedEventForDetails(null)
                    onNavigateToEvent({
                      lng: evt.longitude,
                      lat: evt.latitude,
                      title: evt.title,
                      venue: evt.venue,
                    })
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm shadow-xs transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <NavIcon className="h-4 w-4" />
                  <span>Start Navigation Route on Campus Map</span>
                </button>

                {selectedEventForDetails.registrationUrl && (
                  <a
                    href={selectedEventForDetails.registrationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-orange-200 bg-[#fff5ec] hover:bg-orange-100 text-orange-800 font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-orange-600" />
                    <span>Open Registration / RSVP Link</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Club Lead Auth Modal */}
      <ClubAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(profile) => {
          setClubProfile(profile)
          setViewScope('my_posts')
        }}
      />
    </div>
  )
}
