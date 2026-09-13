import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  Compass,
  PlusCircle,
  Search,
  Navigation as NavIcon,
  Layers,
  ArrowUpDown,
  Bike,
  Footprints,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3,
  Crosshair,
  MapPin,
  RefreshCw,
  X,
  Volume2,
  VolumeX,
  Play,
  Square,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  Pause,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
} from 'lucide-react'
import type { User as FirebaseUser } from 'firebase/auth'
import type { FeatureCollection } from 'geojson'

import NavigatorHeader from './NavigatorHeader'
import AuthModal from './AuthModal'
import CharacterOverlay from './CharacterOverlay'
import { subscribeToAuthChanges, logoutUser } from '../services/firebase'
import {
  speakText,
  stopSpeaking,
  buildRouteStartSpeech,
  buildStepSpeech,
  buildTurnAlertSpeech,
} from '../services/voiceAssistant'
import {
  MAPBOX_PUBLIC_TOKEN,
  LPU_CENTER_COORDS,
  fetchPlaces,
  subscribeToPlaces,
  savePlace,
  updatePlace,
  getOriginalPlace,
  fetchRoads,
  subscribeToRoads,
  saveRoad,
  uploadImageFile,
  fetchMapboxRoute,
  type Place,
  type Road,
  type RouteResult,
} from '../services/navigationApi'

mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN

interface CampusNavigatorProps {
  onBackToHome: () => void
  initialCategory?: string
  initialLocationFocus?: { lng: number; lat: number; label?: string } | null
  onBackToLostFound?: () => void
  initialEventFocus?: { lng: number; lat: number; title: string; venue: string } | null
  onBackToEvents?: () => void
}

type TabType = 'explore' | 'directions' | 'contribute'
type TravelMode = 'walking' | 'cycling' | 'driving'

const CATEGORY_COLORS: Record<string, string> = {
  academic: '#2563eb', // blue
  library: '#7c3aed', // purple
  student_spot: '#ea580c', // orange
  hostel: '#059669', // emerald
  gate: '#dc2626', // red
  sports: '#0284c7', // sky
  hospital: '#e11d48', // rose
}

const CATEGORY_ICONS: Record<string, string> = {
  academic: '🎓',
  library: '📚',
  student_spot: '☕',
  hostel: '🏢',
  gate: '🚪',
  sports: '⚽',
  hospital: '🏥',
}

function getDistanceMeters(coord1: [number, number], coord2: [number, number]): number {
  const [lng1, lat1] = coord1
  const [lng2, lat2] = coord2
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getBearing(coord1: [number, number], coord2: [number, number]): number {
  const [lng1, lat1] = coord1
  const [lng2, lat2] = coord2
  const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lng2 - lng1) * Math.PI) / 180)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function getManeuverIcon(maneuverType?: string, instruction?: string) {
  const text = (instruction || '').toLowerCase()
  if (text.includes('arrive') || maneuverType === 'arrive') {
    return <CheckCircle2 className="h-6 w-6 text-emerald-300" />
  }
  if (text.includes('left') || maneuverType?.includes('left')) {
    return <CornerUpLeft className="h-6 w-6 text-white" />
  }
  if (text.includes('right') || maneuverType?.includes('right')) {
    return <CornerUpRight className="h-6 w-6 text-white" />
  }
  return <ArrowUp className="h-6 w-6 text-white" />
}

export default function CampusNavigator({
  onBackToHome,
  initialCategory = 'all',
  initialLocationFocus = null,
  onBackToLostFound,
  initialEventFocus = null,
  onBackToEvents,
}: CampusNavigatorProps) {
  const [pageVisible, setPageVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // Map & Navigation state
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isSatellite, setIsSatellite] = useState(false)
  const [is3dMode, setIs3dMode] = useState(true)

  // Places & Roads data
  const [places, setPlaces] = useState<Place[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const meetingMarkerRef = useRef<mapboxgl.Marker | null>(null)

  // Tabs state
  const [activeTab, setActiveTab] = useState<TabType>('explore')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('student_spot') || hash.includes('spots')) {
        return 'student_spot'
      }
    }
    return initialCategory || 'all'
  })

  useEffect(() => {
    if (initialCategory && initialCategory !== 'all') {
      setCategoryFilter(initialCategory)
      setActiveTab('explore')
    }
  }, [initialCategory])

  // Directions state
  const [travelMode, setTravelMode] = useState<TravelMode>('walking')
  const [originId, setOriginId] = useState<string>('gps')
  const [destinationId, setDestinationId] = useState<string>('')
  const [currentGps, setCurrentGps] = useState<[number, number] | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'ready' | 'denied' | 'error'>('acquiring')
  const currentGpsRef = useRef<[number, number] | null>(null)
  currentGpsRef.current = currentGps

  const userGpsMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeOriginMarkerRef = useRef<mapboxgl.Marker | null>(null)

  // Dedicated helper to fetch the user's specific GPS location with high precision
  const fetchSpecificGps = async (): Promise<[number, number]> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error')
      throw new Error('Geolocation is not supported by your browser.')
    }
    setGpsStatus('acquiring')
    return new Promise<[number, number]>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude]
          setCurrentGps(coords)
          currentGpsRef.current = coords
          setGpsAccuracy(pos.coords.accuracy)
          setGpsStatus('ready')
          resolve(coords)
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsStatus('denied')
            reject(
              new Error(
                'Location permission was denied. Please allow location access in your browser to start navigation from your exact GPS.',
              ),
            )
          } else {
            setGpsStatus('error')
            reject(
              new Error(
                'Unable to detect your specific GPS location. Please check device location settings.',
              ),
            )
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      )
    })
  }

  // Continuous real-time GPS acquisition so navigation always defaults to live GPS
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      fetchSpecificGps().catch((err) => {
        console.warn('Initial specific GPS probe:', err.message)
      })

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const gps: [number, number] = [pos.coords.longitude, pos.coords.latitude]
          setCurrentGps(gps)
          currentGpsRef.current = gps
          setGpsAccuracy(pos.coords.accuracy)
          setGpsStatus('ready')
        },
        (err) => {
          console.warn('Live GPS watch notice:', err.message)
          if (err.code === err.PERMISSION_DENIED) setGpsStatus('denied')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
      )

      return () => {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  // Render or update User's Live GPS pin on Mapbox
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !currentGps) return

    if (!userGpsMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'user-live-gps-pin cursor-pointer'
      el.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(2, 132, 199, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 18px; height: 18px; border-radius: 50%; background: #0284c7; border: 3px solid #ffffff; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 900;">
            📍
          </div>
        </div>
      `
      const accText = gpsAccuracy ? ` (±${Math.round(gpsAccuracy)}m)` : ''
      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(`
        <div style="padding: 4px 6px; font-size: 11px; font-weight: 700; color: #0369a1; text-align: center;">
          📍 Your Current GPS Location
          <div style="font-size: 9px; font-weight: 500; color: #64748b; margin-top: 2px;">
            ${currentGps[1].toFixed(5)}°, ${currentGps[0].toFixed(5)}°${accText}
          </div>
        </div>
      `)

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(currentGps)
        .setPopup(popup)
        .addTo(mapRef.current)

      userGpsMarkerRef.current = marker
    } else {
      userGpsMarkerRef.current.setLngLat(currentGps)
    }
  }, [currentGps, gpsAccuracy, mapLoaded])
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  // Voice Guidance & Guide Character Speech state
  const [voiceAssistanceEnabled, setVoiceAssistanceEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('omniroute_voice_enabled') !== 'false'
    }
    return true
  })
  const [isGuideSpeaking, setIsGuideSpeaking] = useState(false)
  const [guideSpeakingText, setGuideSpeakingText] = useState<string | null>(null)
  const [activeSpeechStepIdx, setActiveSpeechStepIdx] = useState<number | null>(null)

  // Live Turn-by-Turn Navigation state
  const [isNavigatingLive, setIsNavigatingLive] = useState(false)
  const [activeNavStepIndex, setActiveNavStepIndex] = useState(0)
  const [isAutoSimulating, setIsAutoSimulating] = useState(false)
  const turnMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const navSimIntervalRef = useRef<any>(null)
  const lastSpokenTurnIndexRef = useRef<number | null>(null)

  // Mutable ref for geolocate progress tracking
  const liveNavStateRef = useRef({
    isNavigatingLive: false,
    routeResult: null as RouteResult | null,
    activeNavStepIndex: 0,
  })
  liveNavStateRef.current = {
    isNavigatingLive,
    routeResult,
    activeNavStepIndex,
  }

  // Contribute state
  const [contributeMode, setContributeMode] = useState<'place' | 'road' | 'update'>('place')
  const [newPlaceName, setNewPlaceName] = useState('')
  const [newPlaceCategory, setNewPlaceCategory] = useState('academic')
  const [newPlaceDesc, setNewPlaceDesc] = useState('')
  const [newPlaceLat, setNewPlaceLat] = useState('')
  const [newPlaceLng, setNewPlaceLng] = useState('')
  const [newPlaceFile, setNewPlaceFile] = useState<File | null>(null)
  const [placeSubmitting, setPlaceSubmitting] = useState(false)
  const [placeSuccessMsg, setPlaceSuccessMsg] = useState<string | null>(null)

  // Edit / Update Place state
  const [editingPlace, setEditingPlace] = useState<Place | null>(null)
  const [editPlaceName, setEditPlaceName] = useState('')
  const [editPlaceCategory, setEditPlaceCategory] = useState('academic')
  const [editPlaceDesc, setEditPlaceDesc] = useState('')
  const [editPlaceLat, setEditPlaceLat] = useState('')
  const [editPlaceLng, setEditPlaceLng] = useState('')
  const [editPlaceFile, setEditPlaceFile] = useState<File | null>(null)
  const [editPlaceImageUrl, setEditPlaceImageUrl] = useState('')
  const [fixSearchQuery, setFixSearchQuery] = useState('')
  const [isPickingLocation, setIsPickingLocation] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null)
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null)
  const editMarkerPreviewRef = useRef<mapboxgl.Marker | null>(null)

  // Road Drawing state
  const [newRoadName, setNewRoadName] = useState('')
  const [newRoadCategory, setNewRoadCategory] = useState('walkway')
  const [newRoadDesc, setNewRoadDesc] = useState('')
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([])
  const [roadSubmitting, setRoadSubmitting] = useState(false)
  const [roadSuccessMsg, setRoadSuccessMsg] = useState<string | null>(null)
  const roadMarkersRef = useRef<mapboxgl.Marker[]>([])

  // Mutable ref to always have latest tab/edit state in map callbacks
  const mapInteractionRef = useRef({
    activeTab,
    contributeMode,
    isPickingLocation,
    editingPlace,
  })
  mapInteractionRef.current = {
    activeTab,
    contributeMode,
    isPickingLocation,
    editingPlace,
  }

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(true)

  // Smooth entrance transition matching LiveHRAgentPage
  useEffect(() => {
    const anim = requestAnimationFrame(() => {
      setPageVisible(true)
    })
    return () => {
      cancelAnimationFrame(anim)
      stopSpeaking()
      if (navSimIntervalRef.current) {
        clearInterval(navSimIntervalRef.current)
      }
      if (turnMarkerRef.current) {
        turnMarkerRef.current.remove()
      }
    }
  }, [])

  // Listen to Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load campus data & subscribe to real-time live updates across all users
  useEffect(() => {
    fetchPlaces().then((data) => {
      setPlaces(data)
      if (data.length > 0 && !destinationId) {
        setDestinationId(data[0].id)
      }
    })
    fetchRoads().then((data) => {
      setRoads(data)
    })

    const unsubPlaces = subscribeToPlaces((livePlaces) => {
      setPlaces(livePlaces)
    })

    const unsubRoads = subscribeToRoads((liveRoads) => {
      setRoads(liveRoads)
    })

    return () => {
      unsubPlaces()
      unsubRoads()
    }
  }, [])

  // Handle meeting location focus from Lost and Found handover
  useEffect(() => {
    if (!initialLocationFocus || !mapRef.current || !mapLoaded) return

    const { lng, lat, label } = initialLocationFocus

    const focusPlace: Place = {
      id: 'meeting-focus-spot',
      name: label || 'Tagged Meeting Point',
      description: 'Lost & Found handover location',
      latitude: lat,
      longitude: lng,
      category: 'student_spot',
    }

    setPlaces((prev) => {
      const filtered = prev.filter((p) => p.id !== 'meeting-focus-spot')
      return [focusPlace, ...filtered]
    })

    setDestinationId('meeting-focus-spot')
    setActiveTab('directions')

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 17.5,
      pitch: 35,
      essential: true,
      duration: 1500,
    })

    if (meetingMarkerRef.current) {
      meetingMarkerRef.current.remove()
      meetingMarkerRef.current = null
    }

    const el = document.createElement('div')
    el.className = 'campus-meeting-marker relative flex flex-col items-center cursor-pointer pointer-events-auto group'
    el.innerHTML = `
      <div class="campus-pin-tag" style="background: linear-gradient(135deg, #f43f5e, #f97316); color: white; font-weight: 800; font-size: 11px; padding: 4px 8px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(244,63,94,0.4); border: 2px solid white; white-space: nowrap; margin-bottom: 4px;">
        📍 Handover: ${label || 'Meeting Point'}
      </div>
      <div style="width: 24px; height: 24px; border-radius: 50% 50% 50% 0; background: #f43f5e; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: white;"></div>
      </div>
    `

    const marker = new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(mapRef.current)

    meetingMarkerRef.current = marker

    return () => {
      if (meetingMarkerRef.current) {
        meetingMarkerRef.current.remove()
        meetingMarkerRef.current = null
      }
    }
  }, [initialLocationFocus, mapLoaded])

  // Handle Event location focus from Campus Events Hub
  const [eventFocusState, setEventFocusState] = useState<{ lng: number; lat: number; title: string; venue: string } | null>(initialEventFocus || null)
  const eventMarkerRef = useRef<mapboxgl.Marker | null>(null)

  useEffect(() => {
    if (initialEventFocus) {
      setEventFocusState(initialEventFocus)
    }
  }, [initialEventFocus])

  useEffect(() => {
    if (!eventFocusState || !mapRef.current || !mapLoaded) return

    const { lng, lat, title, venue } = eventFocusState

    const eventPlace: Place = {
      id: 'event-focus-spot',
      name: `🎉 ${title} (@ ${venue})`,
      description: `Campus Event Venue: ${venue}`,
      latitude: lat,
      longitude: lng,
      category: 'academic',
    }

    setPlaces((prev) => {
      const filtered = prev.filter((p) => p.id !== 'event-focus-spot')
      return [eventPlace, ...filtered]
    })

    setDestinationId('event-focus-spot')
    setOriginId('gps')
    setActiveTab('directions')
    setMobileDrawerOpen(true)

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 17,
      pitch: 45,
      essential: true,
      duration: 1200,
    })

    if (eventMarkerRef.current) {
      eventMarkerRef.current.remove()
      eventMarkerRef.current = null
    }

    const el = document.createElement('div')
    el.className = 'campus-event-marker relative flex flex-col items-center cursor-pointer pointer-events-auto group'
    el.innerHTML = `
      <div class="campus-pin-tag" style="background: linear-gradient(135deg, #ea580c, #f97316); color: white; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(234,88,12,0.4); border: 2px solid white; white-space: nowrap; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
        <span>🎉 Event:</span> <span>${title}</span>
      </div>
      <div style="width: 26px; height: 26px; border-radius: 50% 50% 50% 0; background: #ea580c; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: white;"></div>
      </div>
    `

    const marker = new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat([lng, lat])
      .addTo(mapRef.current)

    eventMarkerRef.current = marker

    // Automatically calculate route from user's GPS/entrance to event coordinates
    handleCalculateRoute('event-focus-spot', 'gps', [lng, lat], eventPlace)

    return () => {
      if (eventMarkerRef.current) {
        eventMarkerRef.current.remove()
        eventMarkerRef.current = null
      }
    }
  }, [eventFocusState, mapLoaded])

  // Re-render custom roads whenever roads data changes from any user
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    setupRoadsSourceAndLayer(mapRef.current, roads)
  }, [roads, mapLoaded])

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: LPU_CENTER_COORDS,
      zoom: 16.2,
      pitch: 52,
      bearing: -15,
      attributionControl: false,
    })

    mapRef.current = map

    // Zoom-reactive tag scaling and text fading
    const updatePinZoomStyles = () => {
      if (!map) return
      const z = map.getZoom()
      const container = map.getContainer()
      if (!container) return

      // Tag opacity: 1.0 at zoom >= 15.8, smoothly fading to 0 by zoom 14.2
      const rawTagOpacity = (z - 14.2) / (15.8 - 14.2)
      const tagOpacity = Math.max(0, Math.min(1, rawTagOpacity))

      // Tag text opacity: fades slightly earlier so text softens cleanly as map zooms out
      const rawTextOpacity = (z - 14.6) / (15.8 - 14.6)
      const textOpacity = Math.max(0, Math.min(1, rawTextOpacity))

      // Tag scale: 1.0 at zoom >= 16.2, scaling down to 0.55 at zoom 14.0
      const rawTagScale = 0.55 + 0.45 * ((z - 14.0) / (16.2 - 14.0))
      const tagScale = Math.max(0.52, Math.min(1.05, rawTagScale))

      // Pin marker scale: 1.0 at zoom >= 16.0, scaling down to 0.58 at zoom 13.0
      const rawPinScale = 0.58 + 0.42 * ((z - 13.0) / (16.0 - 13.0))
      const pinScale = Math.max(0.55, Math.min(1.05, rawPinScale))

      const visibility = tagOpacity <= 0.02 ? 'hidden' : 'visible'

      container.style.setProperty('--pin-tag-opacity', tagOpacity.toFixed(3))
      container.style.setProperty('--pin-tag-text-opacity', textOpacity.toFixed(3))
      container.style.setProperty('--pin-tag-scale', tagScale.toFixed(3))
      container.style.setProperty('--pin-tag-visibility', visibility)
      container.style.setProperty('--pin-scale', pinScale.toFixed(3))
    }

    map.on('zoom', updatePinZoomStyles)
    map.on('load', updatePinZoomStyles)
    updatePinZoomStyles()

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    })
    map.addControl(geolocate, 'top-right')

    geolocate.on('geolocate', (e: any) => {
      const { longitude, latitude } = e.coords
      const coords: [number, number] = [longitude, latitude]
      setCurrentGps(coords)
      currentGpsRef.current = coords
      const state = mapInteractionRef.current
      if (state.isPickingLocation && state.editingPlace) {
        setEditPlaceLng(longitude.toFixed(6))
        setEditPlaceLat(latitude.toFixed(6))
      } else if (state.activeTab === 'contribute' && state.contributeMode === 'place') {
        setNewPlaceLng(longitude.toFixed(6))
        setNewPlaceLat(latitude.toFixed(6))
      }

      // Check live turn progress if currently navigating
      const liveNav = liveNavStateRef.current
      if (liveNav.isNavigatingLive && liveNav.routeResult && liveNav.routeResult.steps) {
        const curIdx = liveNav.activeNavStepIndex
        const curStep = liveNav.routeResult.steps[curIdx]
        if (curStep && curStep.location) {
          const distToTurn = getDistanceMeters([longitude, latitude], curStep.location)
          if (distToTurn < 25 && curIdx < liveNav.routeResult.steps.length - 1) {
            advanceToTurnRef.current(curIdx + 1, true)
          }
        }
      }
    })

    map.on('load', () => {
      setMapLoaded(true)
      setup3dTerrain(map)
      setup3dBuildings(map, false)
      setupRoadsSourceAndLayer(map, roads)
      try {
        // Automatically trigger live GPS lock on campus load
        geolocate.trigger()
      } catch (e) {
        // Fallback gracefully if browser requires interaction
      }
    })

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat
      const state = mapInteractionRef.current

      // If in Reposition / Edit mode
      if (state.isPickingLocation && state.editingPlace) {
        setEditPlaceLng(lng.toFixed(6))
        setEditPlaceLat(lat.toFixed(6))
        return
      }

      // If in Contribute Place mode
      if (state.activeTab === 'contribute' && state.contributeMode === 'place') {
        setNewPlaceLng(lng.toFixed(6))
        setNewPlaceLat(lat.toFixed(6))
      }

      // If in Contribute Road mode
      if (state.activeTab === 'contribute' && state.contributeMode === 'road') {
        setDrawnPoints((prev) => [...prev, [lng, lat]])
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 3D Terrain mesh without foggy haze
  const setup3dTerrain = (map: mapboxgl.Map) => {
    try {
      // 1. Add 3D Terrain DEM mesh
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        })
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 })

      // 2. Completely remove any foggy/hazy effect for 100% crisp visibility
      try {
        map.setFog(null as any)
      } catch { }
    } catch (err) {
      console.warn('[OmniRoute] 3D Terrain initialization skipped:', err)
    }
  }

  // 3D Buildings setup directly according to 2D Map building footprints
  const setup3dBuildings = (map: mapboxgl.Map, isSat: boolean) => {
    const layers = map.getStyle()?.layers || []
    const labelLayerId = layers.find(
      (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field'],
    )?.id

    // Remove legacy custom overlays if present
    if (map.getLayer('lpu-3d-landmarks-layer')) {
      map.removeLayer('lpu-3d-landmarks-layer')
    }
    if (map.getSource('lpu-3d-landmarks')) {
      map.removeSource('lpu-3d-landmarks')
    }

    // Remove existing 3D layers on style reload
    if (map.getLayer('3d-buildings-outline')) {
      map.removeLayer('3d-buildings-outline')
    }
    if (map.getLayer('3d-buildings')) {
      map.removeLayer('3d-buildings')
    }

    // 3D structures configured from the 2D map's actual vector building footprints
    if (map.getSource('composite')) {
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            // Bold, high-contrast architectural colors
            'fill-extrusion-color': isSat
              ? [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'height'], 20],
                0, '#ffffff',
                16, '#f1f5f9',
                28, '#e2e8f0',
                45, '#cbd5e1',
              ]
              : [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'height'], 20],
                0, '#ffffff',
                16, '#f8fafc',
                28, '#e2e8f0',
                45, '#cbd5e1',
              ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['coalesce', ['get', 'height'], 22],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['coalesce', ['get', 'min_height'], 0],
            ],
            // Solid, prominent opacity - eliminates any faded or washed-out appearance
            'fill-extrusion-opacity': 0.9,
            'fill-extrusion-vertical-gradient': true,
          },
        },
        labelLayerId,
      )

      // Sharp architectural perimeter lines so building footprints pop with crisp definition
      map.addLayer(
        {
          id: '3d-buildings-outline',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'line',
          minzoom: 14,
          paint: {
            'line-color': isSat ? '#803d0dff' : '#ea580c',
            'line-width': 2,
            'line-opacity': 1,
          },
        },
        labelLayerId,
      )
    }

    // High-contrast directional sun lighting for dramatic 3D facade depth and shadows
    try {
      if (typeof (map as any).setLights === 'function') {
        (map as any).setLights([
          {
            id: 'flat_sun',
            type: 'flat',
            properties: {
              anchor: 'viewport',
              color: '#ffffff',
              intensity: 0.72,
              position: [1.3, 210, 32],
            },
          },
        ])
      } else if (typeof map.setLight === 'function') {
        map.setLight({
          anchor: 'viewport',
          color: '#ffffff',
          intensity: 0.72,
          position: [1.3, 210, 32],
        })
      }
    } catch {
      // quiet
    }
  }

  // Setup Custom Roads Layer
  const setupRoadsSourceAndLayer = (map: mapboxgl.Map, roadsList: Road[]) => {
    const geojsonData: FeatureCollection = {
      type: 'FeatureCollection',
      features: roadsList.map((r) => ({
        type: 'Feature',
        properties: {
          id: r.id,
          name: r.name,
          category: r.category,
        },
        geometry: {
          type: 'LineString',
          coordinates: r.coordinates,
        },
      })),
    }

    if (map.getSource('campus-roads')) {
      ; (map.getSource('campus-roads') as mapboxgl.GeoJSONSource).setData(geojsonData)
    } else {
      map.addSource('campus-roads', {
        type: 'geojson',
        data: geojsonData,
      })

      map.addLayer({
        id: 'campus-roads-line',
        type: 'line',
        source: 'campus-roads',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#955507',
          'line-width': 4,
          'line-opacity': 0.2,
        },
      })
    }
  }

  // Update places markers whenever places change or map loads
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    // Clear existing place markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    places.forEach((place) => {
      const color = CATEGORY_COLORS[place.category] || '#ea580c'

      // Custom marker DOM element container with exact bottom anchor
      const el = document.createElement('div')
      el.className = 'campus-pin-marker-container group'
      el.style.display = 'flex'
      el.style.flexDirection = 'column'
      el.style.alignItems = 'center'
      el.style.cursor = 'pointer'
      el.style.userSelect = 'none'
      el.style.pointerEvents = 'auto'

      // 1. Floating location name tag (positioned directly ABOVE the pin)
      const tag = document.createElement('div')
      tag.className = 'campus-pin-tag'
      tag.textContent = place.name
      tag.style.padding = '2px 8px'
      tag.style.borderRadius = '8px'
      tag.style.backgroundColor = 'rgba(15, 23, 42, 0.92)'
      tag.style.backdropFilter = 'blur(4px)'
      tag.style.fontSize = '11px'
      tag.style.fontWeight = '700'
      tag.style.whiteSpace = 'nowrap'
      tag.style.pointerEvents = 'none'
      tag.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
      tag.style.border = '1px solid rgba(255,255,255,0.18)'
      tag.style.marginBottom = '2px'

      // 2. Pin Pinpoint Body (Circular Head + Sharp Needle Tip pointing directly to the ground coordinate)
      const pinWrapper = document.createElement('div')
      pinWrapper.className = 'campus-pin-wrapper'
      pinWrapper.style.position = 'relative'
      pinWrapper.style.display = 'flex'
      pinWrapper.style.flexDirection = 'column'
      pinWrapper.style.alignItems = 'center'

      // 2a. Pin Head Circle
      const pinHead = document.createElement('div')
      pinHead.className = 'campus-pin-head'
      pinHead.style.width = '30px'
      pinHead.style.height = '30px'
      pinHead.style.borderRadius = '50%'
      pinHead.style.backgroundColor = color
      pinHead.style.border = '2.5px solid #ffffff'
      pinHead.style.boxShadow = '0 3px 10px rgba(0,0,0,0.35)'
      pinHead.style.display = 'flex'
      pinHead.style.alignItems = 'center'
      pinHead.style.justifyContent = 'center'
      pinHead.style.color = '#ffffff'
      pinHead.style.fontSize = '14px'
      pinHead.style.zIndex = '2'
      pinHead.innerHTML = CATEGORY_ICONS[place.category] || '📍'

      // 2b. Pin Needle Point (Sharp tip points to exact ground coordinate [0, 0])
      const pinNeedle = document.createElement('div')
      pinNeedle.className = 'campus-pin-needle'
      pinNeedle.style.width = '0'
      pinNeedle.style.height = '0'
      pinNeedle.style.borderLeft = '6px solid transparent'
      pinNeedle.style.borderRight = '6px solid transparent'
      pinNeedle.style.borderTop = `8px solid ${color}`
      pinNeedle.style.marginTop = '-3px'
      pinNeedle.style.zIndex = '1'
      pinNeedle.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))'

      pinWrapper.appendChild(pinHead)
      pinWrapper.appendChild(pinNeedle)

      el.appendChild(tag)
      el.appendChild(pinWrapper)

      // Popup
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px; max-width: 230px;">
          ${place.image_url
          ? `<img src="${place.image_url}" style="width: 100%; height: 95px; object-fit: cover; border-radius: 8px; margin-bottom: 6px;" />`
          : ''
        }
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">${place.name}</div>
          <div style="font-size: 11px; color: #64748b; line-height: 1.4; margin-bottom: 8px;">${place.description}</div>
          <div style="display: flex; gap: 6px;">
            <button id="pin-edit-btn-${place.id}" style="flex: 1; background: #f1f5f9; color: #334155; font-weight: 600; font-size: 11px; padding: 6px 6px; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              ✏️ Fix Location
            </button>
            <button id="pin-route-btn-${place.id}" style="flex: 1; background: #ea580c; color: #fff; font-weight: 600; font-size: 11px; padding: 6px 6px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              🧭 Directions
            </button>
          </div>
        </div>
      `

      const popup = new mapboxgl.Popup({
        offset: [0, -42],
        closeButton: true,
        closeOnClick: true,
        maxWidth: '260px',
      }).setHTML(popupHtml)

      popup.on('open', () => {
        const routeBtn = document.getElementById(`pin-route-btn-${place.id}`)
        if (routeBtn) {
          routeBtn.addEventListener('click', () => {
            setDestinationId(place.id)
            setOriginId('gps')
            setActiveTab('directions')
            setMobileDrawerOpen(true)
            popup.remove()
            handleCalculateRoute(place.id, 'gps')
          })
        }
        const editBtn = document.getElementById(`pin-edit-btn-${place.id}`)
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            handleStartEditPlace(place)
            popup.remove()
          })
        }
      })

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(popup)
        .addTo(mapRef.current!)

      markersRef.current.push(marker)
    })
  }, [places, mapLoaded])

  const roadMarkersRefClear = () => {
    roadMarkersRef.current.forEach((m) => m.remove())
    roadMarkersRef.current = []
  }

  // Update drawn road waypoints
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    // Clear old road point markers
    roadMarkersRefClear()

    // Add markers for current drawn points
    drawnPoints.forEach((pt) => {
      const el = document.createElement('div')
      el.style.width = '12px'
      el.style.height = '12px'
      el.style.borderRadius = '50%'
      el.style.backgroundColor = '#0d9488'
      el.style.border = '2px solid white'
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'

      const m = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(pt).addTo(mapRef.current!)
      roadMarkersRef.current.push(m)
    })

    // Update active drawing line layer
    const lineData: FeatureCollection = {
      type: 'FeatureCollection',
      features:
        drawnPoints.length > 1
          ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: drawnPoints,
              },
            },
          ]
          : [],
    }

    if (mapRef.current.getSource('live-draw-line')) {
      ; (mapRef.current.getSource('live-draw-line') as mapboxgl.GeoJSONSource).setData(lineData)
    } else {
      mapRef.current.addSource('live-draw-line', {
        type: 'geojson',
        data: lineData,
      })
      mapRef.current.addLayer({
        id: 'live-draw-line-layer',
        type: 'line',
        source: 'live-draw-line',
        paint: {
          'line-color': '#0d9488',
          'line-width': 4,
          'line-dasharray': [2, 1],
        },
      })
    }
  }, [drawnPoints, mapLoaded])

  // Preview / draggable marker for updating place location
  useEffect(() => {
    if (!mapRef.current || !editingPlace) {
      if (editMarkerPreviewRef.current) {
        editMarkerPreviewRef.current.remove()
        editMarkerPreviewRef.current = null
      }
      return
    }

    const lat = parseFloat(editPlaceLat)
    const lng = parseFloat(editPlaceLng)
    if (isNaN(lat) || isNaN(lng)) return

    if (!editMarkerPreviewRef.current) {
      const el = document.createElement('div')
      el.className = 'edit-preview-marker'
      el.style.cursor = 'grab'
      el.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(234, 88, 12, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 34px; height: 34px; border-radius: 50%; background: #ea580c; border: 3px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff;">
            🎯
          </div>
        </div>
      `
      const m = new mapboxgl.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)

      m.on('dragend', () => {
        const coords = m.getLngLat()
        setEditPlaceLng(coords.lng.toFixed(6))
        setEditPlaceLat(coords.lat.toFixed(6))
      })

      editMarkerPreviewRef.current = m
    } else {
      editMarkerPreviewRef.current.setLngLat([lng, lat])
    }
  }, [editingPlace, editPlaceLat, editPlaceLng])

  // Satellite Style Toggle
  const toggleMapStyle = () => {
    if (!mapRef.current) return
    const nextIsSat = !isSatellite
    const newStyle = nextIsSat
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/streets-v12'
    mapRef.current.setStyle(newStyle)
    setIsSatellite(nextIsSat)

    mapRef.current.once('style.load', () => {
      if (mapRef.current) {
        setup3dTerrain(mapRef.current)
        setup3dBuildings(mapRef.current, nextIsSat)
        setupRoadsSourceAndLayer(mapRef.current, roads)
      }
    })
  }

  // 3D Perspective Pitch Toggle
  const toggle3dPitch = () => {
    if (!mapRef.current) return
    const next = !is3dMode
    setIs3dMode(next)
    mapRef.current.easeTo({
      pitch: next ? 52 : 0,
      bearing: next ? -15 : 0,
      duration: 1000,
    })
  }

  // Voice Guidance Handlers
  const toggleVoiceAssistance = () => {
    const next = !voiceAssistanceEnabled
    setVoiceAssistanceEnabled(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem('omniroute_voice_enabled', next ? 'true' : 'false')
    }
    if (!next) {
      stopSpeaking()
      setIsGuideSpeaking(false)
      setGuideSpeakingText(null)
      setActiveSpeechStepIdx(null)
    } else {
      const greeting =
        "Hey! Voice guidance is on! I'm ready to guide you around campus!"
      setGuideSpeakingText(greeting)
      speakText(greeting, {
        onStart: () => setIsGuideSpeaking(true),
        onEnd: () => {
          setIsGuideSpeaking(false)
        },
      })
    }
  }

  const handleStopGuideSpeaking = () => {
    stopSpeaking()
    setIsGuideSpeaking(false)
    setGuideSpeakingText(null)
    setActiveSpeechStepIdx(null)
  }

  const speakRouteGuidance = (resultToSpeak?: RouteResult | null, targetDestId?: string) => {
    const targetRoute = resultToSpeak || routeResult
    if (!targetRoute) return

    const dest = places.find((p) => p.id === (targetDestId || destinationId))
    const destName = dest ? dest.name : 'your destination'
    const firstStep =
      targetRoute.steps && targetRoute.steps.length > 0
        ? targetRoute.steps[0].instruction
        : undefined

    const speech = buildRouteStartSpeech(
      destName,
      targetRoute.duration,
      targetRoute.distance,
      firstStep,
      targetRoute.isCampusShortcut,
    )

    setGuideSpeakingText(speech)
    setActiveSpeechStepIdx(-1)
    speakText(speech, {
      onStart: () => setIsGuideSpeaking(true),
      onEnd: () => {
        setIsGuideSpeaking(false)
      },
      onError: () => {
        setIsGuideSpeaking(false)
      },
    })
  }

  const speakSingleStep = (stepIdx: number) => {
    if (!routeResult || !routeResult.steps || !routeResult.steps[stepIdx]) return
    const step = routeResult.steps[stepIdx]
    const speech = buildStepSpeech(
      stepIdx,
      routeResult.steps.length,
      step.instruction,
      step.distance,
    )

    setGuideSpeakingText(speech)
    setActiveSpeechStepIdx(stepIdx)
    speakText(speech, {
      onStart: () => setIsGuideSpeaking(true),
      onEnd: () => {
        setIsGuideSpeaking(false)
      },
      onError: () => {
        setIsGuideSpeaking(false)
      },
    })
  }

  // Advance to a specific turn, focus map camera with 3D driver's perspective, and speak directions in kid voice
  const advanceToTurn = (stepIndex: number, shouldSpeak: boolean = true) => {
    if (!routeResult || !routeResult.steps || routeResult.steps.length === 0) return
    const totalSteps = routeResult.steps.length
    const clampedIndex = Math.max(0, Math.min(stepIndex, totalSteps - 1))
    setActiveNavStepIndex(clampedIndex)
    setActiveSpeechStepIdx(clampedIndex)

    const step = routeResult.steps[clampedIndex]
    const isArrival = clampedIndex >= totalSteps - 1 || (step.instruction || '').toLowerCase().includes('arrive')

    // Update Turn Beacon Marker on Map
    if (mapRef.current) {
      let turnLocation: [number, number] | null = step.location || null
      if (!turnLocation && routeResult.geometry?.coordinates) {
        const coords = routeResult.geometry.coordinates
        const sampleIdx = Math.min(
          Math.floor((clampedIndex / totalSteps) * coords.length),
          coords.length - 1,
        )
        turnLocation = coords[sampleIdx]
      }

      if (turnLocation) {
        if (!turnMarkerRef.current) {
          const el = document.createElement('div')
          el.className = 'turn-beacon-marker pointer-events-none'
          el.innerHTML = `
            <div class="relative flex items-center justify-center">
              <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-orange-400 opacity-75"></span>
              <div class="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-xl ring-4 ring-white/90 font-black text-sm">
                ${isArrival ? '🏁' : '🧭'}
              </div>
            </div>
          `
          turnMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(turnLocation)
            .addTo(mapRef.current)
        } else {
          turnMarkerRef.current.setLngLat(turnLocation)
        }

        // Camera follows the turn smoothly
        const nextStep = clampedIndex < totalSteps - 1 ? routeResult.steps[clampedIndex + 1] : null
        const nextCoord = nextStep?.location || null
        const bearing = nextCoord ? getBearing(turnLocation, nextCoord) : undefined

        mapRef.current.easeTo({
          center: turnLocation,
          zoom: 18,
          pitch: 54,
          bearing: bearing !== undefined ? bearing : -15,
          duration: 1200,
        })
      }
    }

    // Accurately speak turn direction in male kid voice
    if (shouldSpeak && voiceAssistanceEnabled) {
      const speech = buildTurnAlertSpeech(
        clampedIndex,
        totalSteps,
        step.instruction,
        step.distance,
        isArrival,
      )
      setGuideSpeakingText(speech)
      lastSpokenTurnIndexRef.current = clampedIndex
      speakText(speech, {
        onStart: () => setIsGuideSpeaking(true),
        onEnd: () => setIsGuideSpeaking(false),
        onError: () => setIsGuideSpeaking(false),
      })
    }
  }

  // Ref to always have latest advanceToTurn in geolocate callback
  const advanceToTurnRef = useRef(advanceToTurn)
  advanceToTurnRef.current = advanceToTurn

  // Start Live Turn-by-Turn Navigation
  const startLiveNavigation = () => {
    if (!routeResult || !routeResult.steps || routeResult.steps.length === 0) return
    setIsNavigatingLive(true)
    advanceToTurn(0, true)
  }

  // Stop Live Navigation
  const stopLiveNavigation = () => {
    setIsNavigatingLive(false)
    setIsAutoSimulating(false)
    if (navSimIntervalRef.current) {
      clearInterval(navSimIntervalRef.current)
      navSimIntervalRef.current = null
    }
    if (turnMarkerRef.current) {
      turnMarkerRef.current.remove()
      turnMarkerRef.current = null
    }
    handleStopGuideSpeaking()
  }

  // Auto-simulate turn walkthrough
  const toggleAutoSimulation = () => {
    if (!isNavigatingLive) {
      setIsNavigatingLive(true)
    }

    if (isAutoSimulating) {
      setIsAutoSimulating(false)
      if (navSimIntervalRef.current) {
        clearInterval(navSimIntervalRef.current)
        navSimIntervalRef.current = null
      }
    } else {
      setIsAutoSimulating(true)
      if (navSimIntervalRef.current) {
        clearInterval(navSimIntervalRef.current)
      }

      navSimIntervalRef.current = setInterval(() => {
        setActiveNavStepIndex((prev) => {
          if (!routeResult || !routeResult.steps) return prev
          if (prev >= routeResult.steps.length - 1) {
            clearInterval(navSimIntervalRef.current)
            navSimIntervalRef.current = null
            setIsAutoSimulating(false)
            return prev
          }
          const nextIdx = prev + 1
          advanceToTurn(nextIdx, true)
          return nextIdx
        })
      }, 5500)
    }
  }

  // Handle Calculate Route
  const handleCalculateRoute = async (
    overrideDestId?: string,
    overrideOriginId?: string,
    overrideDestCoords?: [number, number],
    overrideDestPlace?: Place,
  ) => {
    setRouteError(null)
    setRouteResult(null)

    // Strictly default navigation to start from current live GPS location every time unless an explicit place origin was intentionally passed
    const effectiveOriginId = overrideOriginId !== undefined ? overrideOriginId : (originId || 'gps')
    if (effectiveOriginId === 'gps') {
      setOriginId('gps')
    }

    let originCoords: [number, number] | null = null
    if (effectiveOriginId === 'gps') {
      let activeGps = currentGpsRef.current || currentGps
      if (!activeGps) {
        setRouteLoading(true)
        try {
          activeGps = await fetchSpecificGps()
        } catch (err: any) {
          setRouteError(err.message || 'Could not detect your specific GPS location. Please allow location permissions in your browser.')
          setRouteLoading(false)
          return
        }
      }
      originCoords = activeGps
    } else {
      const orig = places.find((p) => p.id === effectiveOriginId)
      if (orig) originCoords = [orig.longitude, orig.latitude]
    }

    const effectiveDestId = overrideDestId || destinationId
    const dest = overrideDestPlace || places.find((p) => p.id === effectiveDestId)
    const destCoords: [number, number] | null =
      overrideDestCoords || (dest ? [dest.longitude, dest.latitude] : null)

    if (!dest || !destCoords) {
      setRouteError('Please select a valid campus destination.')
      return
    }

    if (!originCoords) {
      setRouteError('Please select a valid origin point.')
      return
    }

    setRouteLoading(true)
    try {
      const result = await fetchMapboxRoute(originCoords, destCoords, travelMode, roads)
      setRouteResult(result)
      renderRouteOnMap(result.geometry, originCoords, destCoords, effectiveOriginId === 'gps')

      // Accurately speak directions when navigation starts
      if (voiceAssistanceEnabled) {
        speakRouteGuidance(result, dest.id)
      }
    } catch (err: any) {
      setRouteError(err.message || 'Failed to calculate directions. Check network.')
    } finally {
      setRouteLoading(false)
    }
  }

  // Render Route Line on Mapbox
  const renderRouteOnMap = (
    geometry: any,
    origin: [number, number],
    destination: [number, number],
    isFromGps: boolean = true,
  ) => {
    if (!mapRef.current) return
    const map = mapRef.current

    // Remove existing route layers and source if present
    if (map.getLayer('navigation-route-core')) map.removeLayer('navigation-route-core')
    if (map.getLayer('navigation-route-glow')) map.removeLayer('navigation-route-glow')
    if (map.getSource('navigation-route')) map.removeSource('navigation-route')

    // Add source
    map.addSource('navigation-route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry,
      },
    })

    // Outer glow layer
    map.addLayer({
      id: 'navigation-route-glow',
      type: 'line',
      source: 'navigation-route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#ea580c',
        'line-width': 10,
        'line-opacity': 0.35,
        'line-blur': 4,
      },
    })

    // Core sharp line layer
    map.addLayer({
      id: 'navigation-route-core',
      type: 'line',
      source: 'navigation-route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#f97316',
        'line-width': 5,
        'line-opacity': 0.95,
      },
    })

    // Place or update an Origin Marker pin at start
    if (routeOriginMarkerRef.current) {
      routeOriginMarkerRef.current.remove()
      routeOriginMarkerRef.current = null
    }

    const startEl = document.createElement('div')
    startEl.className = 'route-start-pin cursor-pointer group'
    startEl.innerHTML = `
      <div class="campus-pin-tag" style="background: #059669; color: white; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 9999px; box-shadow: 0 2px 8px rgba(5,150,105,0.4); border: 1.5px solid white; white-space: nowrap; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
        <span>${isFromGps ? '📍 Start (Your GPS)' : '📍 Start Origin'}</span>
      </div>
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #059669; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); margin: 0 auto;"></div>
    `
    const startMarker = new mapboxgl.Marker({ element: startEl, anchor: 'bottom' })
      .setLngLat(origin)
      .addTo(map)
    routeOriginMarkerRef.current = startMarker

    // Fit map bounds to show full route
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend(origin)
    bounds.extend(destination)
    map.fitBounds(bounds, {
      padding: { top: 90, bottom: 90, left: 90, right: 90 },
      maxZoom: 17,
      duration: 1200,
    })
  }

  // Clear Route
  const handleClearRoute = () => {
    stopLiveNavigation()
    setRouteResult(null)
    setRouteError(null)
    setOriginId('gps')
    if (routeOriginMarkerRef.current) {
      routeOriginMarkerRef.current.remove()
      routeOriginMarkerRef.current = null
    }
    if (mapRef.current) {
      if (mapRef.current.getLayer('navigation-route-core')) {
        mapRef.current.removeLayer('navigation-route-core')
      }
      if (mapRef.current.getLayer('navigation-route-glow')) {
        mapRef.current.removeLayer('navigation-route-glow')
      }
      if (mapRef.current.getSource('navigation-route')) {
        mapRef.current.removeSource('navigation-route')
      }
    }
  }

  // Swap Origin and Destination
  const handleSwapRoute = () => {
    if (originId === 'gps') return
    const temp = originId
    setOriginId(destinationId)
    setDestinationId(temp)
  }

  // Focus Place on Map
  const handleFocusPlace = (place: Place) => {
    setSelectedPlace(place)
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [place.longitude, place.latitude],
        zoom: 17.5,
        pitch: 50,
        essential: true,
        duration: 1500,
      })
    }
  }

  // Submit New Place
  const handleSubmitPlace = async (e: React.FormEvent) => {
    e.preventDefault()
    setPlaceSuccessMsg(null)

    if (!newPlaceName.trim()) return
    const lat = parseFloat(newPlaceLat)
    const lng = parseFloat(newPlaceLng)
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please set valid Latitude and Longitude coordinates on map.')
      return
    }

    setPlaceSubmitting(true)
    try {
      let imageUrl: string | undefined = undefined
      if (newPlaceFile) {
        imageUrl = await uploadImageFile(newPlaceFile)
      }

      const saved = await savePlace({
        name: newPlaceName.trim(),
        description: newPlaceDesc.trim(),
        latitude: lat,
        longitude: lng,
        category: newPlaceCategory,
        image_url: imageUrl,
        created_by: currentUser?.email || 'Student Verto',
      })

      setPlaces((prev) => [saved, ...prev])
      setPlaceSuccessMsg(`Successfully added "${saved.name}" to campus map!`)
      setNewPlaceName('')
      setNewPlaceDesc('')
      setNewPlaceFile(null)
      handleFocusPlace(saved)
    } catch (err: any) {
      alert(err.message || 'Failed to save place.')
    } finally {
      setPlaceSubmitting(false)
    }
  }

  // Submit New Road / Path
  const handleSubmitRoad = async (e: React.FormEvent) => {
    e.preventDefault()
    setRoadSuccessMsg(null)

    if (!newRoadName.trim()) return
    if (drawnPoints.length < 2) {
      alert('Please click at least 2 points along the pathway on the map to define a road.')
      return
    }

    setRoadSubmitting(true)
    try {
      const saved = await saveRoad({
        name: newRoadName.trim(),
        category: newRoadCategory,
        description: newRoadDesc.trim(),
        coordinates: drawnPoints,
        length_m: Math.round(drawnPoints.length * 35),
        created_by: currentUser?.email || 'Student Verto',
      })

      setRoads((prev) => [saved, ...prev])
      if (mapRef.current) {
        setupRoadsSourceAndLayer(mapRef.current, [saved, ...roads])
      }
      setRoadSuccessMsg(`Pathway "${saved.name}" successfully created!`)
      setNewRoadName('')
      setNewRoadDesc('')
      setDrawnPoints([])
    } catch (err: any) {
      alert(err.message || 'Failed to save pathway.')
    } finally {
      setRoadSubmitting(false)
    }
  }

  // Start editing a place
  const handleStartEditPlace = (place: Place) => {
    setEditingPlace(place)
    setEditPlaceName(place.name)
    setEditPlaceCategory(place.category)
    setEditPlaceDesc(place.description)
    setEditPlaceLat(place.latitude.toFixed(6))
    setEditPlaceLng(place.longitude.toFixed(6))
    setEditPlaceImageUrl(place.image_url || '')
    setEditPlaceFile(null)
    setFixSearchQuery(place.name)
    setIsPickingLocation(true)
    setEditSuccessMsg(null)
    setEditErrorMsg(null)

    // Switch to Contribute tab so editing controls are cleanly docked in sidebar
    setActiveTab('contribute')
    setContributeMode('update')
    setMobileDrawerOpen(false)

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [place.longitude, place.latitude],
        zoom: 17.5,
        duration: 1000,
      })
    }
  }


  // Close place editing modal/mode
  const handleCloseEditPlace = () => {
    setEditingPlace(null)
    setIsPickingLocation(false)
    setEditSuccessMsg(null)
    setEditErrorMsg(null)
    setEditPlaceFile(null)
    setEditPlaceImageUrl('')
    setFixSearchQuery('')
    if (editMarkerPreviewRef.current) {
      editMarkerPreviewRef.current.remove()
      editMarkerPreviewRef.current = null
    }
  }

  // Reset coordinates to bundled default
  const handleResetToOriginalCoords = () => {
    if (!editingPlace) return
    const orig = getOriginalPlace(editingPlace.id)
    if (orig) {
      setEditPlaceLat(orig.latitude.toFixed(6))
      setEditPlaceLng(orig.longitude.toFixed(6))
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [orig.longitude, orig.latitude],
          zoom: 17.5,
          duration: 900,
        })
      }
    }
  }

  // Save edited place
  const handleSaveEditedPlace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!editingPlace) return
    setEditErrorMsg(null)
    setEditSuccessMsg(null)

    const lat = parseFloat(editPlaceLat)
    const lng = parseFloat(editPlaceLng)
    if (isNaN(lat) || isNaN(lng)) {
      setEditErrorMsg('Please provide valid numerical Latitude and Longitude values.')
      return
    }

    setEditSubmitting(true)
    try {
      let imageUrl = editPlaceImageUrl || editingPlace.image_url
      if (editPlaceFile) {
        try {
          imageUrl = await uploadImageFile(editPlaceFile)
        } catch (imgErr) {
          console.warn('[OmniRoute] Image processing fallback:', imgErr)
        }
      }

      const updated: Place = {
        ...editingPlace,
        name: editPlaceName.trim() || editingPlace.name,
        category: editPlaceCategory,
        description: editPlaceDesc.trim(),
        latitude: lat,
        longitude: lng,
        image_url: imageUrl,
      }

      // 1. Immediately update UI and state so the map reflects changes in 0ms!
      setPlaces((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      )

      // 2. Persist to shared storage
      await updatePlace(updated)

      setEditSuccessMsg(`"${updated.name}" updated successfully!`)

      setTimeout(() => {
        handleCloseEditPlace()
      }, 900)
    } catch (err: any) {
      setEditErrorMsg(err.message || 'Failed to update place location.')
    } finally {
      setEditSubmitting(false)
    }
  }

  // Smooth exit transition matching LiveHRAgentPage handleGoHome
  const handleGoHome = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsExiting(true)
    setPageVisible(false)
    setTimeout(() => {
      onBackToHome()
    }, 450)
  }

  // Filtered places
  const filteredPlaces = places.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div
      className={`relative flex h-[100dvh] h-full max-h-[100dvh] w-full flex-col overflow-hidden bg-[#fff8f2] text-slate-900 transition-all duration-500 ease-out ${pageVisible && !isExiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* 1. Header with LPU Branding & Auth Button (Reference style) */}
      <NavigatorHeader
        currentUser={currentUser}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={async () => {
          await logoutUser()
        }}
        onGoHome={handleGoHome}
      />

      {/* Main Workspace: Sidebar & Map */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Interactive Sidebar (Responsive: floating sheet on mobile, fixed panel on desktop) */}
        <aside
          className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t border-orange-200/60 bg-[#fffbf8]/98 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 sm:rounded-none sm:relative sm:inset-auto sm:h-full sm:w-[420px] sm:border-r sm:border-t-0 sm:border-orange-200/50 ${mobileDrawerOpen
            ? 'h-[76dvh] max-h-[82dvh] sm:h-full sm:max-h-none'
            : 'h-[calc(86px+env(safe-area-inset-bottom,0px))] sm:h-full pb-[env(safe-area-inset-bottom,0px)]'
            }`}
        >
          {/* Mobile Drawer Drag Handle & Toggle */}
          <div
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="flex sm:hidden items-center justify-between border-b border-orange-200/40 px-4 py-2 bg-[#fff4eb]/90 cursor-pointer active:bg-orange-100/70 select-none shrink-0"
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-10 rounded-full bg-orange-300" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {activeTab}
              </span>
              {!mobileDrawerOpen && (
                <span className="text-[10px] font-semibold text-orange-600 bg-orange-100/70 px-1.5 py-0.5 rounded-full">
                  Tap to expand
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMobileDrawerOpen(!mobileDrawerOpen)
              }}
              className="rounded-lg p-1 text-slate-500 hover:bg-orange-100 cursor-pointer active:scale-95 transition"
              aria-label={mobileDrawerOpen ? 'Collapse menu' : 'Expand menu'}
            >
              {mobileDrawerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>

          {/* Feature Navigation Tabs */}
          <div className="grid grid-cols-3 border-b border-orange-200/50 bg-[#fff5ec]/80 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => {
                setActiveTab('explore')
                setMobileDrawerOpen(true)
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${activeTab === 'explore'
                ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-orange-100/50'
                }`}
            >
              <Compass className="h-4 w-4" />
              <span>Explore</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('directions')
                setMobileDrawerOpen(true)
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${activeTab === 'directions'
                ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-orange-100/50'
                }`}
            >
              <NavIcon className="h-4 w-4" />
              <span>Directions</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('contribute')
                setMobileDrawerOpen(true)
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${activeTab === 'contribute'
                ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-orange-100/50'
                }`}
            >
              <PlusCircle className="h-4 w-4" />
              <span>Contribute</span>
            </button>
          </div>

          {/* TAB 1: EXPLORE PANEL */}
          {activeTab === 'explore' && (
            <div className="flex flex-1 flex-col overflow-hidden p-3 sm:p-4">
              {/* Search Bar */}
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search campus blocks, labs, cafes..."
                  className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
                {['all', 'academic', 'library', 'student_spot', 'hostel', 'sports'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${categoryFilter === cat
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-[#fff3e8] border border-orange-200/60 text-slate-700 hover:bg-orange-100/80'
                      }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Places List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {filteredPlaces.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-orange-200/80 bg-[#fff9f4]/60 p-8 text-center text-xs text-slate-500">
                    No places found matching "{searchQuery}".
                  </div>
                ) : (
                  filteredPlaces.map((place) => (
                    <div
                      key={place.id}
                      onClick={() => handleFocusPlace(place)}
                      className={`group rounded-xl border p-3 transition-all cursor-pointer ${selectedPlace?.id === place.id
                        ? 'border-orange-500 bg-orange-50/80 shadow-sm ring-1 ring-orange-400/40'
                        : 'border-orange-200/60 bg-[#fffcf9] hover:border-orange-300 hover:bg-white hover:shadow-xs'
                        }`}
                    >
                      <div className="flex gap-3">
                        {place.image_url && (
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-orange-100/40 border border-orange-100">
                            <img
                              src={place.image_url}
                              alt={place.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span
                              className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                              style={{
                                backgroundColor: `${CATEGORY_COLORS[place.category] || '#ea580c'}18`,
                                color: CATEGORY_COLORS[place.category] || '#ea580c',
                              }}
                            >
                              {place.category.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs text-slate-900 truncate">
                            {place.name}
                          </h4>
                          <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                            {place.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-orange-100/80 pt-2 text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartEditPlace(place)
                          }}
                          className="flex items-center gap-1 font-semibold text-slate-600 hover:text-orange-600 transition cursor-pointer"
                          title="Correct inaccurate coordinates or details"
                        >
                          <Edit3 className="h-3 w-3 text-slate-400 group-hover:text-orange-500" />
                          <span>Fix Location</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDestinationId(place.id)
                            setOriginId('gps')
                            setActiveTab('directions')
                            handleCalculateRoute(place.id, 'gps')
                          }}
                          className="flex items-center gap-1 font-bold text-orange-600 hover:text-orange-700 transition cursor-pointer"
                        >
                          <span>Directions</span>
                          <NavIcon className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DIRECTIONS & ROUTING PANEL */}
          {activeTab === 'directions' && (
            <div className="flex flex-1 flex-col overflow-y-auto p-3 sm:p-4">
              {/* Travel Mode Chips */}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#fff3e8] border border-orange-200/50 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setTravelMode('walking')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${travelMode === 'walking'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <Footprints className="h-3.5 w-3.5" />
                  <span>Walking</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('cycling')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${travelMode === 'cycling'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <Bike className="h-3.5 w-3.5" />
                  <span>E-Rickshaw / Bike</span>
                </button>
              </div>

              {/* Origin & Destination Pickers */}
              <div className="rounded-2xl border border-orange-200/70 bg-[#fff9f4]/90 p-3 mb-3">
                {/* Origin */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                        Starting Point
                      </label>
                      {originId === 'gps' && (
                        <button
                          type="button"
                          onClick={() => {
                            fetchSpecificGps()
                              .then((coords) => {
                                if (mapRef.current) {
                                  mapRef.current.flyTo({ center: coords, zoom: 17, duration: 1000 })
                                }
                                if (destinationId) {
                                  handleCalculateRoute(destinationId, 'gps')
                                }
                              })
                              .catch(() => {})
                          }}
                          className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer transition active:scale-95"
                          title="Refresh your exact GPS coordinates"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${gpsStatus === 'acquiring' ? 'animate-spin' : ''}`} />
                          <span>Refresh GPS</span>
                        </button>
                      )}
                    </div>
                    <select
                      value={originId}
                      onChange={(e) => setOriginId(e.target.value)}
                      className="w-full rounded-lg border border-orange-200/80 bg-[#fffcf9] py-1.5 px-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="gps">
                        📍 My Specific GPS Location {currentGps ? `(${currentGps[1].toFixed(4)}°, ${currentGps[0].toFixed(4)}°)` : '• Detecting...'}
                      </option>
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    {originId === 'gps' && (
                      <div className="mt-1.5 flex items-center justify-between text-[10px] px-1 text-slate-500">
                        {currentGps ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                            <span className="truncate">
                              Live GPS: {currentGps[1].toFixed(5)}° N, {currentGps[0].toFixed(5)}° E {gpsAccuracy ? `(±${Math.round(gpsAccuracy)}m)` : ''}
                            </span>
                          </div>
                        ) : gpsStatus === 'acquiring' ? (
                          <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
                            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                            <span>Detecting your exact GPS coordinates...</span>
                          </div>
                        ) : gpsStatus === 'denied' ? (
                          <div className="flex items-center gap-1 text-rose-600 font-semibold">
                            <span>⚠️ Location access blocked. Allow GPS in browser.</span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center -my-1">
                  <button
                    type="button"
                    onClick={handleSwapRoute}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-orange-200/80 bg-[#fffcf9] text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition shadow-xs cursor-pointer"
                    title="Swap Start and Destination"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Destination */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-600 ring-4 ring-orange-100 shrink-0" />
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-0.5">
                      Destination
                    </label>
                    <select
                      value={destinationId}
                      onChange={(e) => setDestinationId(e.target.value)}
                      className="w-full rounded-lg border border-orange-200/80 bg-[#fffcf9] py-1.5 px-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:outline-none"
                    >
                      {eventFocusState && destinationId === 'event-focus-spot' && (
                        <option value="event-focus-spot">
                          🎉 {eventFocusState.title} (@ {eventFocusState.venue})
                        </option>
                      )}
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Voice Assistance Option Switch */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-orange-200/70 bg-[#fffbf7] px-3 py-2 text-xs mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                      voiceAssistanceEnabled
                        ? isGuideSpeaking
                          ? 'bg-orange-600 text-white animate-pulse'
                          : 'bg-orange-100 text-orange-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {voiceAssistanceEnabled ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="text-slate-800 font-bold text-[11px] flex items-center gap-1.5">
                      <span>Voice Assistance</span>
                      {isGuideSpeaking && (
                        <span className="rounded-full bg-orange-600 px-1.5 py-0.2 text-[8px] font-extrabold uppercase text-white animate-pulse">
                          Speaking
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {voiceAssistanceEnabled
                        ? 'Speaks navigation directions automatically'
                        : 'Voice guidance is muted'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleVoiceAssistance}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition cursor-pointer shadow-2xs ${
                    voiceAssistanceEnabled
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                  title={voiceAssistanceEnabled ? 'Mute Voice Assistance' : 'Enable Voice Assistance'}
                >
                  {voiceAssistanceEnabled ? 'Voice ON' : 'Voice OFF'}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => handleCalculateRoute()}
                  disabled={routeLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-orange-700 active:scale-95 transition disabled:opacity-60 cursor-pointer"
                >
                  {routeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Computing Route...</span>
                    </>
                  ) : (
                    <>
                      <NavIcon className="h-4 w-4" />
                      <span>Get Directions</span>
                    </>
                  )}
                </button>

                {routeResult && (
                  <button
                    onClick={handleClearRoute}
                    className="flex items-center justify-center rounded-xl border border-orange-200/80 bg-[#fffcf9] px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-orange-50 transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {routeError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>{routeError}</span>
                </div>
              )}

              {/* Route Summary Card & Turn-by-Turn Steps */}
              {routeResult && (
                <div className="space-y-3 animate-fadeIn">
                  {routeResult.isCampusShortcut && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200/90 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-xs">
                      <span className="text-base">✨</span>
                      <div>
                        <div className="font-bold">Optimized via Campus Pathway</div>
                        {routeResult.shortcutRoadNames && routeResult.shortcutRoadNames.length > 0 && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            Traversing: {routeResult.shortcutRoadNames.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Active Voice Guidance Controls */}
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-orange-50/90 border border-orange-200 p-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                          isGuideSpeaking
                            ? 'bg-orange-600 text-white shadow-sm animate-pulse'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {isGuideSpeaking ? (
                          <Volume2 className="h-4 w-4 animate-bounce" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>Guide Audio</span>
                          {isGuideSpeaking && (
                            <span className="text-[9px] font-extrabold uppercase text-orange-600 bg-white px-1.5 py-0.5 rounded-full border border-orange-200">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {isGuideSpeaking
                            ? 'Accurately speaking turn-by-turn...'
                            : 'Click Speak to hear spoken guidance'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isGuideSpeaking ? (
                        <button
                          type="button"
                          onClick={handleStopGuideSpeaking}
                          className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-xs"
                          title="Stop voice guidance"
                        >
                          <Square className="h-3 w-3 fill-current" />
                          <span>Stop</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => speakRouteGuidance()}
                          className="flex items-center gap-1 rounded-xl bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-xs"
                          title="Speak route directions"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Speak</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Start Live Turn-by-Turn Navigation Button */}
                  <button
                    type="button"
                    onClick={startLiveNavigation}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-600 p-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-orange-500/25 hover:from-orange-700 hover:to-amber-700 active:scale-95 transition cursor-pointer"
                  >
                    <NavIcon className="h-4 w-4" />
                    <span>🚀 Start Live Turn Navigation</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-4 text-white shadow-md">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-white/80">
                        Estimated Time
                      </span>
                      <span className="text-2xl font-black">{routeResult.duration} min</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-white/80">
                        Distance
                      </span>
                      <span className="text-2xl font-black">
                        {routeResult.distance > 1000
                          ? `${(routeResult.distance / 1000).toFixed(1)} km`
                          : `${routeResult.distance} m`}
                      </span>
                    </div>
                  </div>

                  {/* Steps List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Turn-by-Turn Guidance ({routeResult.steps.length} steps)
                      </h5>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Click step to navigate
                      </span>
                    </div>

                    <div className="space-y-2">
                      {routeResult.steps.map((step, idx) => {
                        const isThisStepActive = isNavigatingLive && activeNavStepIndex === idx
                        const isThisStepSpeaking = isGuideSpeaking && activeSpeechStepIdx === idx
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              advanceToTurn(idx, true)
                              if (!isNavigatingLive) {
                                setIsNavigatingLive(true)
                              }
                            }}
                            className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-xs transition-all cursor-pointer ${
                              isThisStepActive
                                ? 'border-orange-500 bg-orange-50/95 shadow-sm ring-2 ring-orange-400/40'
                                : 'border-orange-200/60 bg-[#fffcf9] text-slate-800 hover:border-orange-300 hover:bg-orange-50/40'
                            }`}
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px] ${
                                isThisStepActive
                                  ? 'bg-orange-600 text-white shadow-xs'
                                  : 'bg-orange-100 text-orange-600'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium leading-relaxed">{step.instruction}</p>
                              <span className="text-[10px] font-semibold text-slate-400">
                                {step.distance} meters
                              </span>
                            </div>

                            {/* Audio Step Trigger Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isThisStepSpeaking) {
                                  handleStopGuideSpeaking()
                                } else {
                                  advanceToTurn(idx, true)
                                }
                              }}
                              className={`shrink-0 rounded-lg p-1.5 transition cursor-pointer ${
                                isThisStepSpeaking
                                  ? 'bg-orange-600 text-white shadow-xs'
                                  : 'text-slate-400 hover:text-orange-600 hover:bg-orange-100/60'
                              }`}
                              title={isThisStepSpeaking ? 'Stop speaking step' : 'Speak this turn in kid voice'}
                            >
                              {isThisStepSpeaking ? (
                                <Square className="h-3.5 w-3.5 fill-current" />
                              ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONTRIBUTE PANEL */}
          {activeTab === 'contribute' && (
            <div className="flex flex-1 flex-col overflow-y-auto p-3 sm:p-4">
              {/* Sub-tab Switcher: Add Place vs Fix Location vs Draw Road */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#fff3e8] border border-orange-200/50 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setContributeMode('place')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${contributeMode === 'place'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  📍 Add Place
                </button>
                <button
                  type="button"
                  onClick={() => setContributeMode('update')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${contributeMode === 'update'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  ✏️ Fix Location
                </button>
                <button
                  type="button"
                  onClick={() => setContributeMode('road')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${contributeMode === 'road'
                    ? 'bg-[#fffcf9] text-orange-600 shadow-xs ring-1 ring-orange-200/70'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  🛣️ Draw Road
                </button>
              </div>

              {/* Auth Notice if guest */}
              {!currentUser && (
                <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/90 p-3 text-xs text-orange-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-orange-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Student Login Recommended</span>
                  </div>
                  <p className="leading-relaxed">
                    Sign in with your student account to record your contributions to the official LPU database.
                  </p>
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="mt-2 rounded-lg bg-orange-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-orange-700 cursor-pointer"
                  >
                    Sign In Now
                  </button>
                </div>
              )}

              {/* Subpanel 1: Add Place */}
              {contributeMode === 'place' && (
                <form onSubmit={handleSubmitPlace} className="space-y-3">
                  {placeSuccessMsg && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{placeSuccessMsg}</span>
                    </div>
                  )}

                  <div className="rounded-xl border border-orange-200/70 bg-[#fff5ec] p-2.5 text-xs text-slate-700">
                    💡 <b>Tip:</b> Click anywhere on the map to automatically pick Latitude and Longitude coordinates.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Place Name
                    </label>
                    <input
                      type="text"
                      value={newPlaceName}
                      onChange={(e) => setNewPlaceName(e.target.value)}
                      placeholder="e.g. Block 36 Robotics Lab"
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={newPlaceCategory}
                      onChange={(e) => setNewPlaceCategory(e.target.value)}
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                    >
                      <option value="academic">Academic Block / Lab</option>
                      <option value="library">Library / Study Zone</option>
                      <option value="student_spot">Student Spot / Plaza / Cafe</option>
                      <option value="hostel">Hostel Residence</option>
                      <option value="sports">Sports Arena</option>
                      <option value="hospital">Medical / Healthcare</option>
                      <option value="gate">Campus Gate / Entrance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description / Landmarks
                    </label>
                    <textarea
                      value={newPlaceDesc}
                      onChange={(e) => setNewPlaceDesc(e.target.value)}
                      rows={2}
                      placeholder="Floor number, nearby gates, landmarks..."
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Latitude
                      </label>
                      <input
                        type="text"
                        value={newPlaceLat}
                        onChange={(e) => setNewPlaceLat(e.target.value)}
                        placeholder="31.25..."
                        className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-1.5 px-2 text-xs font-mono text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Longitude
                      </label>
                      <input
                        type="text"
                        value={newPlaceLng}
                        onChange={(e) => setNewPlaceLng(e.target.value)}
                        placeholder="75.70..."
                        className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-1.5 px-2 text-xs font-mono text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Attach Photo (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setNewPlaceFile(e.target.files ? e.target.files[0] : null)}
                      className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-orange-100/70 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-orange-800 hover:file:bg-orange-200/70 cursor-pointer"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={placeSubmitting}
                    className="w-full rounded-xl bg-orange-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-orange-700 transition cursor-pointer disabled:opacity-60"
                  >
                    {placeSubmitting ? 'Saving to Map...' : 'Save Place to Campus Map'}
                  </button>
                </form>
              )}

              {/* Subpanel 2: Fix / Update Existing Location */}
              {contributeMode === 'update' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-orange-200/70 bg-[#fff5ec] p-2.5 text-xs text-slate-700">
                    🎯 <b>Fix inaccurate landmarks:</b> Select any campus location below to adjust its coordinates, name, or description.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Choose Location to Fix</span>
                      <span className="text-[10px] font-normal text-orange-600">Type or select landmark</span>
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={fixSearchQuery}
                        onChange={(e) => {
                          const val = e.target.value
                          setFixSearchQuery(val)
                          const exact = places.find(
                            (p) => p.name.toLowerCase() === val.trim().toLowerCase()
                          )
                          if (exact) {
                            handleStartEditPlace(exact)
                          }
                        }}
                        placeholder="Type location name (e.g. Unipolis, Block 34)..."
                        className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none shadow-xs"
                      />
                      {fixSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setFixSearchQuery('')
                          }}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          title="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Quick suggestions when typing */}
                    {fixSearchQuery.trim() && !editingPlace && (
                      <div className="mt-1.5 max-h-36 overflow-y-auto rounded-xl border border-orange-200/80 bg-white p-1 shadow-sm space-y-0.5">
                        {places.filter((p) =>
                          p.name.toLowerCase().includes(fixSearchQuery.toLowerCase())
                        ).length > 0 ? (
                          places
                            .filter((p) =>
                              p.name.toLowerCase().includes(fixSearchQuery.toLowerCase())
                            )
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setFixSearchQuery(p.name)
                                  handleStartEditPlace(p)
                                }}
                                className="w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-orange-50 text-slate-700 transition cursor-pointer"
                              >
                                <span className="font-semibold truncate">{p.name}</span>
                                <span className="text-[10px] text-slate-400 capitalize">
                                  {p.category.replace('_', ' ')}
                                </span>
                              </button>
                            ))
                        ) : (
                          <div className="px-2.5 py-2 text-[11px] text-slate-500 italic">
                            No match found. Use "Add Place" tab to mark this new location.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dropdown fallback to pick from all landmarks */}
                    <div className="mt-2">
                      <select
                        value={editingPlace?.id || ''}
                        onChange={(e) => {
                          const p = places.find((item) => item.id === e.target.value)
                          if (p) {
                            setFixSearchQuery(p.name)
                            handleStartEditPlace(p)
                          }
                        }}
                        className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-1.5 px-3 text-[11px] text-slate-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>-- Or choose from all {places.length} landmarks --</option>
                        {places.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.category.replace('_', ' ')})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editingPlace ? (
                    <form onSubmit={handleSaveEditedPlace} className="space-y-3 pt-2 border-t border-orange-100">
                      {editSuccessMsg && (
                        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{editSuccessMsg}</span>
                        </div>
                      )}

                      {editErrorMsg && (
                        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                          <span>{editErrorMsg}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Landmark Name
                        </label>
                        <input
                          type="text"
                          value={editPlaceName}
                          onChange={(e) => setEditPlaceName(e.target.value)}
                          className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Category
                        </label>
                        <select
                          value={editPlaceCategory}
                          onChange={(e) => setEditPlaceCategory(e.target.value)}
                          className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                        >
                          <option value="academic">Academic Block / Lab</option>
                          <option value="library">Library / Study Zone</option>
                          <option value="student_spot">Student Spot / Plaza / Cafe</option>
                          <option value="hostel">Hostel Residence</option>
                          <option value="sports">Sports Arena</option>
                          <option value="hospital">Medical / Healthcare</option>
                          <option value="gate">Campus Gate / Entrance</option>
                        </select>
                      </div>

                      {/* Map picker tools */}
                      <div className="rounded-xl border border-orange-200/90 bg-[#fff5ec]/80 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-orange-900 flex items-center gap-1">
                            <Crosshair className="h-3 w-3 text-orange-600" />
                            Target Coordinates
                          </span>
                          <span className="text-[9px] text-orange-700">Click map or drag 🎯 pin</span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsPickingLocation(!isPickingLocation)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${isPickingLocation
                              ? 'bg-orange-600 text-white shadow-xs'
                              : 'bg-[#fffcf9] border border-orange-300 text-orange-800 hover:bg-orange-100'
                              }`}
                          >
                            {isPickingLocation ? '🎯 Map Click Active' : 'Click Map to Pick'}
                          </button>

                          {currentGps && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditPlaceLng(currentGps[0].toFixed(6))
                                setEditPlaceLat(currentGps[1].toFixed(6))
                              }}
                              className="rounded-lg bg-[#fffcf9] border border-orange-200/80 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-orange-50 transition cursor-pointer"
                            >
                              📍 My GPS
                            </button>
                          )}

                          {getOriginalPlace(editingPlace.id) && (
                            <button
                              type="button"
                              onClick={handleResetToOriginalCoords}
                              className="rounded-lg bg-[#fffcf9] border border-orange-200/80 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-orange-50 transition cursor-pointer"
                              title="Restore factory default coordinates"
                            >
                              ↺ Reset Default
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">Latitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editPlaceLat}
                              onChange={(e) => setEditPlaceLat(e.target.value)}
                              className="w-full rounded-lg border border-orange-200/80 bg-[#fffcf9] py-1 px-2 text-xs font-mono text-slate-800"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-semibold text-slate-600 mb-0.5">Longitude</label>
                            <input
                              type="number"
                              step="any"
                              value={editPlaceLng}
                              onChange={(e) => setEditPlaceLng(e.target.value)}
                              className="w-full rounded-lg border border-orange-200/80 bg-[#fffcf9] py-1 px-2 text-xs font-mono text-slate-800"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={editPlaceDesc}
                          onChange={(e) => setEditPlaceDesc(e.target.value)}
                          className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      {/* Photo Attachment for Fix Location */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                          <span>Landmark Photo (Optional)</span>
                          {editPlaceImageUrl && (
                            <span className="text-[10px] text-emerald-600 font-medium">Photo attached</span>
                          )}
                        </label>

                        {editPlaceImageUrl && (
                          <div className="relative mb-2 inline-block rounded-xl overflow-hidden border border-orange-200/80 shadow-xs">
                            <img
                              src={editPlaceImageUrl}
                              alt="Landmark preview"
                              className="h-20 w-32 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditPlaceImageUrl('')
                                setEditPlaceFile(null)
                              }}
                              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition cursor-pointer"
                              title="Remove photo"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files ? e.target.files[0] : null
                            setEditPlaceFile(file)
                            if (file) {
                              try {
                                const preview = await uploadImageFile(file)
                                setEditPlaceImageUrl(preview)
                              } catch (err) {
                                console.warn('Preview error:', err)
                              }
                            }
                          }}
                          className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-orange-100/70 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-orange-800 hover:file:bg-orange-200/70 cursor-pointer"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCloseEditPlace}
                          className="flex-1 rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 text-xs font-semibold text-slate-600 hover:bg-orange-50 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={editSubmitting}
                          className="flex-1 rounded-xl bg-orange-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition cursor-pointer disabled:opacity-50"
                        >
                          {editSubmitting ? 'Saving...' : 'Update Location'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-dashed border-orange-200/80 bg-[#fff9f4]/60 p-6 text-center text-xs text-slate-500">
                      Please choose a location above or click <b>"✏️ Fix Location"</b> on any map pin or Explore card to begin editing.
                    </div>
                  )}
                </div>
              )}

              {/* Subpanel 3: Draw Road */}
              {contributeMode === 'road' && (
                <form onSubmit={handleSubmitRoad} className="space-y-3">
                  {roadSuccessMsg && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>{roadSuccessMsg}</span>
                    </div>
                  )}

                  <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3 text-xs text-teal-900">
                    <div className="font-bold mb-1">🛣️ Drawing Mode Active:</div>
                    <p className="leading-relaxed mb-2">
                      Click along the path on the map to add connected waypoints.
                    </p>
                    <div className="flex items-center justify-between border-t border-teal-200 pt-2 font-semibold">
                      <span>Waypoints: <b className="text-teal-700">{drawnPoints.length}</b></span>
                      <span>Approx Length: <b>{drawnPoints.length * 35} m</b></span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDrawnPoints((prev) => prev.slice(0, -1))}
                      disabled={drawnPoints.length === 0}
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 text-xs font-semibold text-slate-700 hover:bg-orange-50 transition cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Undo Point
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawnPoints([])}
                      disabled={drawnPoints.length === 0}
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-red-200/80 bg-[#fff5ec] py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Clear
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Road / Pathway Name
                    </label>
                    <input
                      type="text"
                      value={newRoadName}
                      onChange={(e) => setNewRoadName(e.target.value)}
                      placeholder="e.g. UniMall to Block 32 Walkway"
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={newRoadCategory}
                      onChange={(e) => setNewRoadCategory(e.target.value)}
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                    >
                      <option value="walkway">🚶 Pedestrian Walkway</option>
                      <option value="bike_lane">🚴 Bicycle Lane</option>
                      <option value="road">🚗 Paved Vehicle Road</option>
                      <option value="service_lane">🚜 Service / Maintenance Track</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Description / Access Notes
                    </label>
                    <textarea
                      value={newRoadDesc}
                      onChange={(e) => setNewRoadDesc(e.target.value)}
                      rows={2}
                      placeholder="Lighting, shade, accessibility notes..."
                      className="w-full rounded-xl border border-orange-200/80 bg-[#fffcf9] py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={roadSubmitting || drawnPoints.length < 2}
                    className="w-full rounded-xl bg-teal-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-teal-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {roadSubmitting ? 'Saving Pathway...' : 'Save Pathway to Map'}
                  </button>
                </form>
              )}
            </div>
          )}
        </aside>

        {/* Center/Right Mapbox GL Canvas */}
        <div className="relative flex-1 bg-slate-200">
          <div ref={mapContainerRef} className="h-full w-full" />

          {/* Map Top Floating Controls: Satellite Toggle & 3D Tilt View */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              onClick={toggleMapStyle}
              className="flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-[#fffbf8]/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur-md hover:bg-white hover:text-orange-600 transition cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{isSatellite ? 'Streets View' : 'Satellite View'}</span>
            </button>

            <button
              onClick={toggle3dPitch}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition cursor-pointer ${is3dMode
                ? 'border-orange-500 bg-orange-600 text-white shadow-orange-500/20'
                : 'border-orange-200/80 bg-[#fffbf8]/95 text-slate-800 hover:bg-white hover:text-orange-600'
                }`}
              title="Toggle 3D Terrain & Building Perspective"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>{is3dMode ? '3D View (52°)' : '2D Top-Down'}</span>
            </button>
          </div>

          {/* Live Turn-by-Turn Navigation HUD (Updates every turn and speaks via kid voice) */}
          {isNavigatingLive && routeResult && routeResult.steps && routeResult.steps.length > 0 && (
            <div className="absolute top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[500px] z-30 animate-in slide-in-from-top duration-300">
              <div className="rounded-2xl border border-orange-400/40 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-white">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Maneuver Icon */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md ring-2 ring-white/20">
                    {getManeuverIcon(
                      routeResult.steps[activeNavStepIndex]?.maneuverType,
                      routeResult.steps[activeNavStepIndex]?.instruction,
                    )}
                  </div>

                  {/* Center: Turn Instructions & Distance */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-orange-600/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-200">
                        Turn {activeNavStepIndex + 1} of {routeResult.steps.length}
                      </span>
                      {routeResult.steps[activeNavStepIndex]?.distance > 0 && (
                        <span className="text-xs font-black text-amber-400">
                          In {routeResult.steps[activeNavStepIndex].distance} m
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-sm font-black leading-snug text-white line-clamp-2">
                      {routeResult.steps[activeNavStepIndex]?.instruction || 'Continue straight'}
                    </p>

                    {/* Next Turn Preview */}
                    {activeNavStepIndex < routeResult.steps.length - 1 && (
                      <p className="mt-1 text-[11px] font-medium text-slate-400 truncate">
                        Then: {routeResult.steps[activeNavStepIndex + 1]?.instruction}
                      </p>
                    )}
                  </div>

                  {/* Right: Exit Navigation */}
                  <button
                    type="button"
                    onClick={stopLiveNavigation}
                    className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                    title="Exit Navigation"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Bottom Action Bar: Prev Turn, Speak, Next Turn, Auto Sim */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={activeNavStepIndex === 0}
                      onClick={() => advanceToTurn(activeNavStepIndex - 1, true)}
                      className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200 transition cursor-pointer disabled:opacity-40"
                      title="Previous Turn"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>

                    <button
                      type="button"
                      disabled={activeNavStepIndex >= routeResult.steps.length - 1}
                      onClick={() => advanceToTurn(activeNavStepIndex + 1, true)}
                      className="flex items-center gap-1 rounded-lg bg-orange-600 hover:bg-orange-500 px-3 py-1 text-[11px] font-bold text-white transition cursor-pointer disabled:opacity-40 shadow-xs"
                      title="Next Turn"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => advanceToTurn(activeNavStepIndex, true)}
                      className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200 transition cursor-pointer"
                      title="Replay this turn audio in kid voice"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-orange-400" />
                      <span>Replay</span>
                    </button>
                  </div>

                  {/* Auto-Walk Simulator */}
                  <button
                    type="button"
                    onClick={toggleAutoSimulation}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                      isAutoSimulating
                        ? 'bg-amber-500 text-slate-950 font-black animate-pulse'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                    title={isAutoSimulating ? 'Pause Route Simulation' : 'Auto-simulate turn walkthrough'}
                  >
                    {isAutoSimulating ? (
                      <>
                        <Pause className="h-3 w-3 fill-current" />
                        <span>Simulating...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 fill-current" />
                        <span>Simulate Walk</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lost & Found Handover Meeting Point Banner */}
          {initialLocationFocus && (
            <div className="absolute top-4 right-4 z-20 max-w-sm bg-[#111726]/95 backdrop-blur-md border border-rose-500/50 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 text-white animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-md">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                    Lost & Found Meeting Point
                  </p>
                  <p className="text-xs font-bold text-white truncate">
                    {initialLocationFocus.label || 'Handover Point'}
                  </p>
                </div>
              </div>
              {onBackToLostFound && (
                <button
                  type="button"
                  onClick={onBackToLostFound}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-[11px] font-bold text-rose-300 transition cursor-pointer shrink-0"
                >
                  Back to Case
                </button>
              )}
            </div>
          )}

          {/* Active Event Navigation Session Banner */}
          {eventFocusState && (
            <div className="absolute top-4 right-4 z-20 max-w-md bg-[#fffdfb]/95 backdrop-blur-md border border-orange-300 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 text-slate-900 animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                    <Sparkles className="h-3 w-3 text-orange-500" />
                    <span>Event Destination Target</span>
                  </div>
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {eventFocusState.title}
                  </p>
                  <p className="text-[10px] text-slate-600 truncate">
                    📍 {eventFocusState.venue}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!isNavigatingLive && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (routeResult && routeResult.steps && routeResult.steps.length > 0) {
                        startLiveNavigation()
                      } else {
                        await handleCalculateRoute(
                          'event-focus-spot',
                          'gps',
                          [eventFocusState.lng, eventFocusState.lat],
                        )
                        startLiveNavigation()
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-[11px] font-bold text-white shadow-xs transition cursor-pointer"
                  >
                    <NavIcon className="h-3 w-3" />
                    <span>Start Nav</span>
                  </button>
                )}

                {onBackToEvents && (
                  <button
                    type="button"
                    onClick={onBackToEvents}
                    className="px-2.5 py-1.5 rounded-xl bg-[#fff5ec] hover:bg-orange-100 border border-orange-200 text-[11px] font-bold text-orange-800 transition cursor-pointer"
                  >
                    Events
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEventFocusState(null)
                    if (eventMarkerRef.current) {
                      eventMarkerRef.current.remove()
                      eventMarkerRef.current = null
                    }
                    handleClearRoute()
                  }}
                  className="p-1 rounded-full text-slate-400 hover:bg-orange-100 hover:text-slate-700 transition cursor-pointer"
                  title="Clear Event Session"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Active Repositioning Non-blocking Floating Dock */}
          {editingPlace && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[92vw] sm:max-w-md w-full pointer-events-auto">
              <div className="flex items-center gap-2 rounded-full bg-slate-900/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md border border-orange-500/60 animate-pulse">
                <Crosshair className="h-4 w-4 text-orange-400" />
                <span>Click anywhere on the map or drag 🎯 pin</span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-2xl border border-orange-200/80 bg-[#fffbf8]/95 p-3 shadow-2xl backdrop-blur-md w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 font-bold text-sm">
                    🎯
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {editPlaceName || editingPlace.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {editPlaceLat}, {editPlaceLng}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {currentGps && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditPlaceLng(currentGps[0].toFixed(6))
                        setEditPlaceLat(currentGps[1].toFixed(6))
                      }}
                      className="rounded-xl border border-orange-200/80 bg-[#fff5ec] px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-orange-100/70 transition cursor-pointer"
                      title="Use live GPS location"
                    >
                      📍 GPS
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCloseEditPlace}
                    className="rounded-xl border border-orange-200/80 bg-[#fff5ec] px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-orange-100/70 transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveEditedPlace()}
                    disabled={editSubmitting}
                    className="flex items-center gap-1 rounded-xl bg-orange-600 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-orange-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {editSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Save Location</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive 3D Mascot Character in the Corner */}
          <CharacterOverlay
            places={places}
            voiceAssistanceEnabled={voiceAssistanceEnabled}
            onToggleVoiceAssistance={toggleVoiceAssistance}
            isSpeaking={isGuideSpeaking}
            speakingText={guideSpeakingText}
            onStopSpeaking={handleStopGuideSpeaking}
            onReplaySpeech={() => {
              if (activeSpeechStepIdx !== null && activeSpeechStepIdx >= 0) {
                speakSingleStep(activeSpeechStepIdx)
              } else if (routeResult) {
                speakRouteGuidance()
              } else if (guideSpeakingText) {
                speakText(guideSpeakingText, {
                  onStart: () => setIsGuideSpeaking(true),
                  onEnd: () => setIsGuideSpeaking(false),
                })
              }
            }}
            onOpenContribute={() => {
              setActiveTab('contribute')
              setContributeMode('place')
            }}
            onQuickNavigate={(destId) => {
              setDestinationId(destId)
              setOriginId('gps')
              setActiveTab('directions')
              handleCalculateRoute(destId, 'gps')
            }}
            isMobileDrawerOpen={mobileDrawerOpen}
          />
        </div>
      </div>

      {/* Student Authentication Modal (Requirement 1) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          // Success callback
        }}
      />
    </div>
  )
}
