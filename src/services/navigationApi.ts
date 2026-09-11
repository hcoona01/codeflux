import campusPlacesData from '../data/campusPlaces.json'
import campusRoadsData from '../data/campusRoads.json'
import { getCurrentUserToken } from './firebase'

export const MAPBOX_PUBLIC_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN || ''

export const LPU_CENTER_COORDS: [number, number] = [75.704900, 31.253827]

export interface Place {
  id: string
  name: string
  description: string
  latitude: number
  longitude: number
  category: 'academic' | 'library' | 'student_spot' | 'hostel' | 'gate' | 'sports' | 'hospital' | string
  image_url?: string
  created_by?: string
  created_at?: string
}

export interface Road {
  id: string
  name: string
  category: 'walkway' | 'bike_lane' | 'road' | 'service_lane' | string
  description?: string
  coordinates: [number, number][]
  length_m: number
  created_by?: string
  created_at?: string
}

export interface RouteStep {
  instruction: string
  distance: number
  duration: number
  maneuverType?: string
}

export interface RouteResult {
  distance: number
  duration: number
  geometry: any
  steps: RouteStep[]
}

const LOCAL_STORAGE_PLACES_KEY = 'verto_omniroute_places_cache'
const LOCAL_STORAGE_ROADS_KEY = 'verto_omniroute_roads_cache'

export async function fetchPlaces(): Promise<Place[]> {
  try {
    const res = await fetch('/api/places', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(data))
        return data
      }
    }
  } catch (err) {
    console.log('[Info] API places not reachable, loading cached campus landmarks.', err)
  }

  // Fallback to local storage or bundled dataset
  const cached = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      // ignore
    }
  }
  return campusPlacesData as Place[]
}

export async function savePlace(
  placeData: Omit<Place, 'id' | 'created_at'>,
): Promise<Place> {
  const token = await getCurrentUserToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const newPlace: Place = {
    ...placeData,
    id: `place-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  try {
    const res = await fetch('/api/places', {
      method: 'POST',
      headers,
      body: JSON.stringify(placeData),
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const saved = await res.json()
      updateLocalPlacesCache(saved)
      return saved
    }
  } catch (err) {
    console.log('[Info] Saved place to local campus storage fallback.', err)
  }

  updateLocalPlacesCache(newPlace)
  return newPlace
}

function updateLocalPlacesCache(place: Place) {
  const existing = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  let list: Place[] = campusPlacesData as Place[]
  if (existing) {
    try {
      list = JSON.parse(existing)
    } catch {
      // ignore
    }
  }
  const index = list.findIndex((p) => p.id === place.id)
  if (index >= 0) {
    list[index] = { ...list[index], ...place }
  } else {
    list.unshift(place)
  }
  localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(list))
}

export async function updatePlace(
  place: Place,
): Promise<Place> {
  const token = await getCurrentUserToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await fetch(`/api/places/${place.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(place),
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const saved = await res.json()
      updateLocalPlacesCache(saved)
      return saved
    }
  } catch (err) {
    console.log('[Info] Updated place in local campus storage fallback.', err)
  }

  updateLocalPlacesCache(place)
  return place
}

export function getOriginalPlace(placeId: string): Place | undefined {
  return (campusPlacesData as Place[]).find((p) => p.id === placeId)
}

export function resetPlaceToDefault(placeId: string): Place | null {
  const original = getOriginalPlace(placeId)
  if (!original) return null
  updateLocalPlacesCache(original)
  return original
}

export async function fetchRoads(): Promise<Road[]> {
  try {
    const res = await fetch('/api/roads', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(data))
        return data
      }
    }
  } catch (err) {
    console.log('[Info] API roads not reachable, loading cached roads.', err)
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      // ignore
    }
  }
  return campusRoadsData as Road[]
}

export async function saveRoad(
  roadData: Omit<Road, 'id' | 'created_at'>,
): Promise<Road> {
  const token = await getCurrentUserToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const newRoad: Road = {
    ...roadData,
    id: `road-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  try {
    const res = await fetch('/api/roads', {
      method: 'POST',
      headers,
      body: JSON.stringify(roadData),
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const saved = await res.json()
      updateLocalRoadsCache(saved)
      return saved
    }
  } catch (err) {
    console.log('[Info] Saved road to local campus storage fallback.', err)
  }

  updateLocalRoadsCache(newRoad)
  return newRoad
}

function updateLocalRoadsCache(road: Road) {
  const existing = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
  let list: Road[] = campusRoadsData as Road[]
  if (existing) {
    try {
      list = JSON.parse(existing)
    } catch {
      // ignore
    }
  }
  const filtered = list.filter((r) => r.id !== road.id)
  filtered.unshift(road)
  localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(filtered))
}

export async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.imageUrl) return data.imageUrl
    }
  } catch (err) {
    console.log('[Info] Upload API fallback to client DataURL', err)
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(reader.result as string)
    }
    reader.readAsDataURL(file)
  })
}

export async function fetchMapboxRoute(
  origin: [number, number],
  destination: [number, number],
  mode: 'walking' | 'cycling' | 'driving' = 'walking',
): Promise<RouteResult> {
  const profileMap = {
    walking: 'walking',
    cycling: 'cycling',
    driving: 'driving',
  }
  const profile = profileMap[mode] || 'walking'
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_PUBLIC_TOKEN}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Could not compute directions on campus')
  }
  const data = await res.json()
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found between these locations')
  }

  const route = data.routes[0]
  const steps: RouteStep[] = []
  if (route.legs && route.legs[0] && route.legs[0].steps) {
    route.legs[0].steps.forEach((step: any) => {
      steps.push({
        instruction: step.maneuver ? step.maneuver.instruction : 'Continue straight',
        distance: Math.round(step.distance),
        duration: Math.round(step.duration),
        maneuverType: step.maneuver?.type,
      })
    })
  }

  return {
    distance: Math.round(route.distance),
    duration: Math.round(route.duration / 60),
    geometry: route.geometry,
    steps,
  }
}
