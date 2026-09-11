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
  Car,
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
} from 'lucide-react'
import type { User as FirebaseUser } from 'firebase/auth'
import type { FeatureCollection, Feature } from 'geojson'

import NavigatorHeader from './NavigatorHeader'
import AuthModal from './AuthModal'
import CharacterOverlay from './CharacterOverlay'
import { subscribeToAuthChanges, logoutUser } from '../services/firebase'
import {
  MAPBOX_PUBLIC_TOKEN,
  LPU_CENTER_COORDS,
  fetchPlaces,
  savePlace,
  updatePlace,
  getOriginalPlace,
  clearAllCampusData,
  fetchRoads,
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

export default function CampusNavigator({ onBackToHome }: CampusNavigatorProps) {
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

  // Places & Roads data
  const [places, setPlaces] = useState<Place[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  // Tabs state
  const [activeTab, setActiveTab] = useState<TabType>('explore')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Directions state
  const [travelMode, setTravelMode] = useState<TravelMode>('walking')
  const [originId, setOriginId] = useState<string>('gps')
  const [destinationId, setDestinationId] = useState<string>('')
  const [currentGps, setCurrentGps] = useState<[number, number] | null>(null)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

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
    return () => cancelAnimationFrame(anim)
  }, [])

  // Listen to Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load campus data
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
  }, [])

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: LPU_CENTER_COORDS,
      zoom: 16,
      pitch: 40,
      bearing: -15,
      attributionControl: false,
    })

    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    })
    map.addControl(geolocate, 'top-right')

    geolocate.on('geolocate', (e: any) => {
      const { longitude, latitude } = e.coords
      setCurrentGps([longitude, latitude])
      const state = mapInteractionRef.current
      if (state.isPickingLocation && state.editingPlace) {
        setEditPlaceLng(longitude.toFixed(6))
        setEditPlaceLat(latitude.toFixed(6))
      } else if (state.activeTab === 'contribute' && state.contributeMode === 'place') {
        setNewPlaceLng(longitude.toFixed(6))
        setNewPlaceLat(latitude.toFixed(6))
      }
    })

    map.on('load', () => {
      setMapLoaded(true)
      setup3dBuildings(map)
      setupRoadsSourceAndLayer(map, roads)
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

  // 3D Buildings setup
  const setup3dBuildings = (map: mapboxgl.Map) => {
    const layers = map.getStyle()?.layers || []
    const labelLayerId = layers.find(
      (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field'],
    )?.id

    if (!map.getLayer('3d-buildings')) {
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#cbd5e1',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.6,
          },
        },
        labelLayerId,
      )
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
      ;(map.getSource('campus-roads') as mapboxgl.GeoJSONSource).setData(geojsonData)
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
          'line-color': '#0284c7',
          'line-width': 4,
          'line-opacity': 0.8,
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

      // Custom marker DOM element container positioned by Mapbox GL
      const el = document.createElement('div')
      el.className = 'campus-pin-marker-container'
      el.style.position = 'relative'
      el.style.width = '32px'
      el.style.height = '32px'
      el.style.cursor = 'pointer'
      el.style.userSelect = 'none'

      // Inner pin icon (scales on hover without affecting Mapbox's translate transform on el)
      const pin = document.createElement('div')
      pin.className = 'campus-pin-marker'
      pin.style.width = '32px'
      pin.style.height = '32px'
      pin.style.borderRadius = '50%'
      pin.style.backgroundColor = color
      pin.style.border = '2px solid #ffffff'
      pin.style.boxShadow = '0 3px 12px rgba(0,0,0,0.25)'
      pin.style.display = 'flex'
      pin.style.alignItems = 'center'
      pin.style.justifyContent = 'center'
      pin.style.color = '#ffffff'
      pin.style.fontSize = '15px'
      pin.style.transition = 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease'
      pin.innerHTML = CATEGORY_ICONS[place.category] || '📍'

      // Floating location name tag
      const tag = document.createElement('div')
      tag.className = 'campus-pin-tag'
      tag.textContent = place.name
      tag.style.position = 'absolute'
      tag.style.top = '36px'
      tag.style.left = '50%'
      tag.style.transform = 'translateX(-50%)'
      tag.style.padding = '2px 8px'
      tag.style.borderRadius = '10px'
      tag.style.backgroundColor = 'rgba(15, 23, 42, 0.88)'
      tag.style.backdropFilter = 'blur(4px)'
      tag.style.color = '#ffffff'
      tag.style.fontSize = '11px'
      tag.style.fontWeight = '600'
      tag.style.whiteSpace = 'nowrap'
      tag.style.pointerEvents = 'none'
      tag.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
      tag.style.transition = 'transform 0.18s ease, background-color 0.18s ease'

      el.appendChild(pin)
      el.appendChild(tag)

      // Hover scaling applied exclusively to inner elements
      el.addEventListener('mouseenter', () => {
        pin.style.transform = 'scale(1.2)'
        pin.style.boxShadow = '0 6px 18px rgba(0,0,0,0.45)'
        tag.style.transform = 'translateX(-50%) scale(1.05)'
        tag.style.backgroundColor = 'rgba(15, 23, 42, 0.98)'
      })
      el.addEventListener('mouseleave', () => {
        pin.style.transform = 'scale(1)'
        pin.style.boxShadow = '0 3px 12px rgba(0,0,0,0.25)'
        tag.style.transform = 'translateX(-50%) scale(1)'
        tag.style.backgroundColor = 'rgba(15, 23, 42, 0.88)'
      })

      // Popup
      const popupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px; max-width: 230px;">
          ${
            place.image_url
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

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml)

      popup.on('open', () => {
        const routeBtn = document.getElementById(`pin-route-btn-${place.id}`)
        if (routeBtn) {
          routeBtn.addEventListener('click', () => {
            setDestinationId(place.id)
            setActiveTab('directions')
            setMobileDrawerOpen(true)
            popup.remove()
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

      const marker = new mapboxgl.Marker(el)
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

      const m = new mapboxgl.Marker(el).setLngLat(pt).addTo(mapRef.current!)
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
      ;(mapRef.current.getSource('live-draw-line') as mapboxgl.GeoJSONSource).setData(lineData)
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
      const m = new mapboxgl.Marker({ element: el, draggable: true })
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
    const newStyle = isSatellite
      ? 'mapbox://styles/mapbox/streets-v12'
      : 'mapbox://styles/mapbox/satellite-streets-v12'
    mapRef.current.setStyle(newStyle)
    setIsSatellite(!isSatellite)

    mapRef.current.once('style.load', () => {
      if (mapRef.current) {
        setup3dBuildings(mapRef.current)
        setupRoadsSourceAndLayer(mapRef.current, roads)
      }
    })
  }

  // Handle Calculate Route
  const handleCalculateRoute = async () => {
    setRouteError(null)
    setRouteResult(null)

    let originCoords: [number, number] | null = null
    if (originId === 'gps') {
      if (currentGps) {
        originCoords = currentGps
      } else {
        setRouteError('Current GPS location not available yet. Please select an origin place or allow location access.')
        return
      }
    } else {
      const orig = places.find((p) => p.id === originId)
      if (orig) originCoords = [orig.longitude, orig.latitude]
    }

    const dest = places.find((p) => p.id === destinationId)
    if (!dest) {
      setRouteError('Please select a valid campus destination.')
      return
    }
    const destCoords: [number, number] = [dest.longitude, dest.latitude]

    if (!originCoords) {
      setRouteError('Please select a valid origin point.')
      return
    }

    setRouteLoading(true)
    try {
      const result = await fetchMapboxRoute(originCoords, destCoords, travelMode)
      setRouteResult(result)
      renderRouteOnMap(result.geometry, originCoords, destCoords)
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
  ) => {
    if (!mapRef.current) return
    const map = mapRef.current

    const routeData: Feature = {
      type: 'Feature',
      properties: {},
      geometry,
    }

    if (map.getSource('navigation-route')) {
      ;(map.getSource('navigation-route') as mapboxgl.GeoJSONSource).setData(routeData)
    } else {
      map.addSource('navigation-route', {
        type: 'geojson',
        data: routeData,
      })

      // Outer glow line
      map.addLayer({
        id: 'navigation-route-glow',
        type: 'line',
        source: 'navigation-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f97316',
          'line-width': 9,
          'line-opacity': 0.4,
        },
      })

      // Core route line
      map.addLayer({
        id: 'navigation-route-core',
        type: 'line',
        source: 'navigation-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ea580c',
          'line-width': 5,
        },
      })
    }

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
    setRouteResult(null)
    setRouteError(null)
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

  // Clear all saved data from browser
  const handleClearAllData = () => {
    if (window.confirm('Clear all saved campus landmarks and custom pathways from your browser?')) {
      clearAllCampusData()
      setPlaces([])
      setRoads([])
      setSelectedPlace(null)
      setDestinationId('')
      setRouteResult(null)
      handleCloseEditPlace()
      if (mapRef.current) {
        setupRoadsSourceAndLayer(mapRef.current, [])
      }
    }
  }

  // Close place editing modal/mode
  const handleCloseEditPlace = () => {
    setEditingPlace(null)
    setIsPickingLocation(false)
    setEditSuccessMsg(null)
    setEditErrorMsg(null)
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
      const updated: Place = {
        ...editingPlace,
        name: editPlaceName.trim() || editingPlace.name,
        category: editPlaceCategory,
        description: editPlaceDesc.trim(),
        latitude: lat,
        longitude: lng,
      }

      await updatePlace(updated)

      // Update state
      setPlaces((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      )

      setEditSuccessMsg(`"${updated.name}" updated successfully!`)

      setTimeout(() => {
        handleCloseEditPlace()
      }, 1200)
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
      className={`relative flex h-screen w-full flex-col overflow-hidden bg-slate-100 transition-all duration-500 ease-out ${
        pageVisible && !isExiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
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
        onClearData={handleClearAllData}
      />

      {/* Main Workspace: Sidebar & Map */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Interactive Sidebar (Responsive: floating sheet on mobile, fixed panel on desktop) */}
        <aside
          className={`absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-2xl transition-all duration-300 sm:relative sm:inset-auto sm:h-full sm:w-[420px] sm:border-r sm:border-t-0 ${
            mobileDrawerOpen ? 'h-[75vh] sm:h-full' : 'h-16 sm:h-full'
          }`}
        >
          {/* Mobile Drawer Drag Handle & Toggle */}
          <div className="flex sm:hidden items-center justify-between border-b border-slate-100 px-4 py-2 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-10 rounded-full bg-slate-300" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {activeTab}
              </span>
            </div>
            <button
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 cursor-pointer"
            >
              {mobileDrawerOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>

          {/* Feature Navigation Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-200/80 bg-slate-50/80 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => {
                setActiveTab('explore')
                setMobileDrawerOpen(true)
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeTab === 'explore'
                  ? 'bg-white text-orange-600 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
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
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeTab === 'directions'
                  ? 'bg-white text-orange-600 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
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
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeTab === 'contribute'
                  ? 'bg-white text-orange-600 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
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
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search campus blocks, labs, cafes..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
                {['all', 'academic', 'library', 'student_spot', 'hostel', 'sports'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Places List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {filteredPlaces.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                    No places found matching "{searchQuery}".
                  </div>
                ) : (
                  filteredPlaces.map((place) => (
                    <div
                      key={place.id}
                      onClick={() => handleFocusPlace(place)}
                      className={`group rounded-xl border p-3 transition-all cursor-pointer ${
                        selectedPlace?.id === place.id
                          ? 'border-orange-500 bg-orange-50/50 shadow-sm ring-1 ring-orange-400/40'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex gap-3">
                        {place.image_url && (
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
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
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {place.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartEditPlace(place)
                          }}
                          className="flex items-center gap-1 font-semibold text-slate-500 hover:text-orange-600 transition cursor-pointer"
                          title="Correct inaccurate coordinates or details"
                        >
                          <Edit3 className="h-3 w-3 text-slate-400 group-hover:text-orange-500" />
                          <span>Fix Location</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDestinationId(place.id)
                            setActiveTab('directions')
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
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setTravelMode('walking')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                    travelMode === 'walking'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Footprints className="h-3.5 w-3.5" />
                  <span>Walking</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('cycling')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                    travelMode === 'cycling'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bike className="h-3.5 w-3.5" />
                  <span>Cycling</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('driving')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                    travelMode === 'driving'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Car className="h-3.5 w-3.5" />
                  <span>Driving</span>
                </button>
              </div>

              {/* Origin & Destination Pickers */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 mb-3">
                {/* Origin */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                      Starting Point
                    </label>
                    <select
                      value={originId}
                      onChange={(e) => setOriginId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="gps">📍 My Current Location (GPS)</option>
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Swap Button */}
                <div className="flex justify-center -my-1">
                  <button
                    type="button"
                    onClick={handleSwapRoute}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-orange-600 transition shadow-xs cursor-pointer"
                    title="Swap Start and Destination"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Destination */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-600 ring-4 ring-orange-100 shrink-0" />
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                      Destination
                    </label>
                    <select
                      value={destinationId}
                      onChange={(e) => setDestinationId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2 text-xs font-semibold text-slate-800 focus:border-orange-500 focus:outline-none"
                    >
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleCalculateRoute}
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
                    className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
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
                    <h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      Turn-by-Turn Guidance ({routeResult.steps.length} steps)
                    </h5>
                    <div className="space-y-2">
                      {routeResult.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800"
                        >
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 font-bold text-[10px]">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium leading-relaxed">{step.instruction}</p>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {step.distance} meters
                            </span>
                          </div>
                        </div>
                      ))}
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
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setContributeMode('place')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${
                    contributeMode === 'place'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📍 Add Place
                </button>
                <button
                  type="button"
                  onClick={() => setContributeMode('update')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${
                    contributeMode === 'update'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ✏️ Fix Location
                </button>
                <button
                  type="button"
                  onClick={() => setContributeMode('road')}
                  className={`rounded-lg py-1.5 text-[11px] font-bold transition cursor-pointer ${
                    contributeMode === 'road'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🛣️ Draw Road
                </button>
              </div>

              {/* Auth Notice if guest */}
              {!currentUser && (
                <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
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

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                        className="w-full rounded-xl border border-slate-300 bg-white py-1.5 px-2 text-xs font-mono text-slate-800"
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
                        className="w-full rounded-xl border border-slate-300 bg-white py-1.5 px-2 text-xs font-mono text-slate-800"
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
                      className="w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-orange-700 hover:file:bg-orange-100"
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                    🎯 <b>Fix inaccurate landmarks:</b> Select any campus location below to adjust its coordinates, name, or description.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Choose Location to Fix
                    </label>
                    <select
                      value={editingPlace?.id || ''}
                      onChange={(e) => {
                        const p = places.find((item) => item.id === e.target.value)
                        if (p) handleStartEditPlace(p)
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="" disabled>-- Select a campus landmark --</option>
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.category.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>

                  {editingPlace ? (
                    <form onSubmit={handleSaveEditedPlace} className="space-y-3 pt-2 border-t border-slate-100">
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
                          className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                          className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                      <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5 space-y-2">
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
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                              isPickingLocation
                                ? 'bg-orange-600 text-white shadow-xs'
                                : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-100'
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
                              className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                            >
                              📍 My GPS
                            </button>
                          )}

                          {getOriginalPlace(editingPlace.id) && (
                            <button
                              type="button"
                              onClick={handleResetToOriginalCoords}
                              className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
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
                              className="w-full rounded-lg border border-slate-300 bg-white py-1 px-2 text-xs font-mono text-slate-800"
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
                              className="w-full rounded-lg border border-slate-300 bg-white py-1 px-2 text-xs font-mono text-slate-800"
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
                          className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCloseEditPlace}
                          className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
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
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
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

                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
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
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Undo Point
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawnPoints([])}
                      disabled={drawnPoints.length === 0}
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer disabled:opacity-50"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs text-slate-800 focus:border-orange-500 focus:outline-none"
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

          {/* Map Top Floating Controls: Satellite Toggle */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button
              onClick={toggleMapStyle}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur-md hover:bg-white hover:text-orange-600 transition cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{isSatellite ? 'Streets View' : 'Satellite View'}</span>
            </button>
          </div>

          {/* Active Repositioning Non-blocking Floating Dock */}
          {editingPlace && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[92vw] sm:max-w-md w-full pointer-events-auto">
              <div className="flex items-center gap-2 rounded-full bg-slate-900/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md border border-orange-500/60 animate-pulse">
                <Crosshair className="h-4 w-4 text-orange-400" />
                <span>Click anywhere on the map or drag 🎯 pin</span>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md w-full">
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
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      title="Use live GPS location"
                    >
                      📍 GPS
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCloseEditPlace}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
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

          {/* Interactive 3D Mascot Character in the Corner (Requirement 3) */}
          <CharacterOverlay
            places={places}
            onOpenContribute={() => {
              setActiveTab('contribute')
              setContributeMode('place')
            }}
            onQuickNavigate={(destId) => {
              setDestinationId(destId)
              setActiveTab('directions')
              handleCalculateRoute()
            }}
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
