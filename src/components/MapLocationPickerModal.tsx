import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { X, MapPin, Check, Crosshair, Sparkles } from 'lucide-react'
import { MAPBOX_PUBLIC_TOKEN, LPU_CENTER_COORDS } from '../services/navigationApi'

mapboxgl.accessToken = MAPBOX_PUBLIC_TOKEN

interface MapLocationPickerModalProps {
  isOpen: boolean
  initialLat?: number
  initialLng?: number
  initialVenue?: string
  onClose: () => void
  onSelectLocation: (location: { lat: number; lng: number; venueSuggestion?: string }) => void
}

const LANDMARK_SHORTCUTS = [
  { name: 'Shanti Devi Mittal Audi (Block 32)', lat: 31.2529, lng: 75.7034 },
  { name: 'Baldev Raj Mittal Audi (Block 38)', lat: 31.2552, lng: 75.7061 },
  { name: 'Uni-Mall Open Stage & Atrium', lat: 31.2523, lng: 75.7032 },
  { name: 'Central Library Lawn & Plaza', lat: 31.2546, lng: 75.7056 },
  { name: 'Block 34 Robotics & Tech Arena', lat: 31.25382, lng: 75.70425 },
  { name: 'Indoor Sports Complex & Gym', lat: 31.2561, lng: 75.7018 },
  { name: 'Open Air Amphitheatre (Block 25)', lat: 31.2541, lng: 75.7048 },
  { name: 'Student Center Food Street Lawn', lat: 31.2515, lng: 75.7021 },
]

export default function MapLocationPickerModal({
  isOpen,
  initialLat,
  initialLng,
  initialVenue,
  onClose,
  onSelectLocation,
}: MapLocationPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)

  const [selectedLat, setSelectedLat] = useState<number>(() => initialLat || LPU_CENTER_COORDS[1])
  const [selectedLng, setSelectedLng] = useState<number>(() => initialLng || LPU_CENTER_COORDS[0])
  const [selectedVenue, setSelectedVenue] = useState<string>(() => initialVenue || '')
  const [isLocating, setIsLocating] = useState(false)

  // Initialize Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return

    const startLng = initialLng || LPU_CENTER_COORDS[0]
    const startLat = initialLat || LPU_CENTER_COORDS[1]

    setSelectedLat(startLat)
    setSelectedLng(startLng)
    if (initialVenue) setSelectedVenue(initialVenue)

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [startLng, startLat],
      zoom: 16.5,
      pitch: 35,
      bearing: -15,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')

    // Create custom pin element
    const el = document.createElement('div')
    el.className = 'location-picker-pin'
    el.innerHTML = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: grab;">
        <div style="
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, #ea580c, #f97316);
          border: 3px solid #ffffff;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            transform: rotate(45deg);
            width: 14px;
            height: 14px;
            background: #ffffff;
            border-radius: 50%;
          "></div>
        </div>
        <div style="
          width: 12px;
          height: 6px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          filter: blur(2px);
          margin-top: 2px;
        "></div>
      </div>
    `

    const marker = new mapboxgl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([startLng, startLat])
      .addTo(map)

    markerRef.current = marker

    // Handle marker drag
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat()
      const lat = Number(lngLat.lat.toFixed(5))
      const lng = Number(lngLat.lng.toFixed(5))
      setSelectedLat(lat)
      setSelectedLng(lng)
      findClosestLandmark(lat, lng)
    })

    // Handle map click
    map.on('click', (e) => {
      const lat = Number(e.lngLat.lat.toFixed(5))
      const lng = Number(e.lngLat.lng.toFixed(5))
      marker.setLngLat([lng, lat])
      setSelectedLat(lat)
      setSelectedLng(lng)
      findClosestLandmark(lat, lng)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [isOpen])

  // Helper to find nearest landmark for venue suggestion
  const findClosestLandmark = (lat: number, lng: number) => {
    let closest = LANDMARK_SHORTCUTS[0]
    let minD = Infinity
    for (const lm of LANDMARK_SHORTCUTS) {
      const d = Math.hypot(lm.lat - lat, lm.lng - lng)
      if (d < minD) {
        minD = d
        closest = lm
      }
    }
    // If within ~150 meters, suggest the landmark name
    if (minD < 0.0018) {
      setSelectedVenue(closest.name)
    }
  }

  // Handle Landmark Shortcut click
  const handleSelectLandmark = (landmark: (typeof LANDMARK_SHORTCUTS)[0]) => {
    setSelectedLat(landmark.lat)
    setSelectedLng(landmark.lng)
    setSelectedVenue(landmark.name)

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLngLat([landmark.lng, landmark.lat])
      mapRef.current.flyTo({
        center: [landmark.lng, landmark.lat],
        zoom: 17,
        speed: 1.4,
      })
    }
  }

  // Handle GPS Locate
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        const lat = Number(pos.coords.latitude.toFixed(5))
        const lng = Number(pos.coords.longitude.toFixed(5))
        setSelectedLat(lat)
        setSelectedLng(lng)
        findClosestLandmark(lat, lng)

        if (mapRef.current && markerRef.current) {
          markerRef.current.setLngLat([lng, lat])
          mapRef.current.flyTo({
            center: [lng, lat],
            zoom: 17,
            speed: 1.4,
          })
        }
      },
      (err) => {
        setIsLocating(false)
        alert('Could not get GPS location: ' + err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Confirm Selection
  const handleConfirm = () => {
    onSelectLocation({
      lat: selectedLat,
      lng: selectedLng,
      venueSuggestion: selectedVenue || undefined,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl h-[88vh] max-h-[700px] bg-[#fffdfb] border border-orange-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#fff5ec]/80 border-b border-orange-200/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-600 uppercase tracking-wider">
                <Sparkles className="h-3 w-3" />
                <span>Interactive Campus Map</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                Click Map to Choose Event Geocoordinates
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-orange-100/60 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Landmark Shortcuts Bar */}
        <div className="bg-[#fff9f4] border-b border-orange-200/50 px-4 py-2 shrink-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap mr-1">
            Presets:
          </span>
          {LANDMARK_SHORTCUTS.map((lm) => (
            <button
              key={lm.name}
              type="button"
              onClick={() => handleSelectLandmark(lm)}
              className="px-2.5 py-1 rounded-xl bg-white hover:bg-orange-50 border border-orange-200 text-slate-700 hover:text-orange-700 font-semibold whitespace-nowrap transition cursor-pointer shadow-2xs"
            >
              {lm.name.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* Mapbox Container */}
        <div className="relative flex-1 w-full bg-slate-100 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* GPS Quick Button on Map */}
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={isLocating}
            className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-xl bg-[#fffdfb] border border-orange-200/80 px-3 py-2 text-xs font-bold text-slate-800 shadow-md hover:bg-orange-50 transition cursor-pointer disabled:opacity-50"
            title="Snap to Current GPS Location"
          >
            <Crosshair className={`h-4 w-4 text-orange-600 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Acquiring GPS...' : 'My Current Location'}</span>
          </button>

          {/* Map instruction floating pill */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-slate-900/85 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-md pointer-events-none flex items-center gap-1.5">
            <span>📍 Tap anywhere on map or drag pin to position</span>
          </div>
        </div>

        {/* Bottom Coordinates Bar & Confirm Button */}
        <div className="px-5 py-3.5 bg-[#fff9f4] border-t border-orange-200/60 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500">
              Selected Geocoordinates:
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-orange-200/80 shadow-2xs">
                {selectedLat.toFixed(5)}, {selectedLng.toFixed(5)}
              </span>
              {selectedVenue && (
                <span className="text-orange-700 font-semibold truncate max-w-[200px]">
                  Near: {selectedVenue}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs sm:text-sm font-bold shadow-xs transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Confirm Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
