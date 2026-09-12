import campusPlacesData from '../data/campusPlaces.json'
import campusRoadsData from '../data/campusRoads.json'
import { db } from './firebase'
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore'

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

const LOCAL_STORAGE_PLACES_KEY = 'verto_omniroute_places_v2'
const LOCAL_STORAGE_ROADS_KEY = 'verto_omniroute_roads_v2'

export function clearAllCampusData(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_PLACES_KEY)
    localStorage.removeItem(LOCAL_STORAGE_ROADS_KEY)
  } catch {
    // ignore
  }
}

/**
 * Fetch all campus places from shared Cloud Firestore.
 * Seamlessly falls back to local cache or bundled data if Firestore is offline.
 */
export async function fetchPlaces(): Promise<Place[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'campus_places'))
      const cloudPlaces: Place[] = []
      snap.forEach((d) => {
        cloudPlaces.push(d.data() as Place)
      })
      if (cloudPlaces.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(cloudPlaces))
        return cloudPlaces
      }
    } catch (err) {
      console.warn('[OmniRoute] Firestore places fetch fallback to local cache:', err)
    }
  }

  // Fallback to local storage or bundled dataset
  const cached = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // ignore
    }
  }
  return campusPlacesData as Place[]
}

/**
 * Real-time listener: updates map and list when ANY user creates or updates a place.
 */
export function subscribeToPlaces(callback: (places: Place[]) => void): () => void {
  if (!db) return () => {}

  try {
    const unsubscribe = onSnapshot(
      collection(db, 'campus_places'),
      (snap) => {
        const cloudPlaces: Place[] = []
        snap.forEach((d) => {
          cloudPlaces.push(d.data() as Place)
        })
        if (cloudPlaces.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(cloudPlaces))
          callback(cloudPlaces)
        }
      },
      (err) => {
        console.warn('[OmniRoute] Real-time places subscription notice (check Firestore rules):', err)
      }
    )
    return unsubscribe
  } catch (err) {
    console.warn('[OmniRoute] Real-time places subscription init failed:', err)
    return () => {}
  }
}

/**
 * Save a newly marked campus landmark to shared Cloud Firestore so all users see it.
 */
export async function savePlace(
  placeData: Omit<Place, 'id' | 'created_at'>,
): Promise<Place> {
  const newPlace: Place = {
    ...placeData,
    id: `place-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  // 1. Write to shared Cloud Firestore
  if (db) {
    try {
      await setDoc(doc(db, 'campus_places', newPlace.id), newPlace)
    } catch (err) {
      console.warn('[OmniRoute] Could not write place to Firestore (check Firestore rules):', err)
    }
  }

  // 2. Mirror in local storage
  updateLocalPlacesCache(newPlace)
  return newPlace
}

function updateLocalPlacesCache(place: Place) {
  const existing = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  let list: Place[] = []
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

/**
 * Delete landmark from Cloud Firestore and local storage
 */
export async function deletePlace(placeId: string): Promise<void> {
  if (db) {
    try {
      await deleteDoc(doc(db, 'campus_places', placeId))
    } catch (err) {
      console.warn('[OmniRoute] Could not delete place from Firestore:', err)
    }
  }

  const existing = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  if (existing) {
    try {
      const list: Place[] = JSON.parse(existing)
      const filtered = list.filter((p) => p.id !== placeId)
      localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(filtered))
    } catch {
      // ignore
    }
  }
}

/**
 * Update/reposition an existing landmark in shared Cloud Firestore for all users.
 */
export async function updatePlace(
  place: Place,
): Promise<Place> {
  if (db) {
    try {
      await setDoc(doc(db, 'campus_places', place.id), place, { merge: true })
    } catch (err) {
      console.warn('[OmniRoute] Could not update place in Firestore (check Firestore rules):', err)
    }
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
  updatePlace(original)
  return original
}

/**
 * Fetch all pathways from shared Cloud Firestore.
 */
export async function fetchRoads(): Promise<Road[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'campus_roads'))
      const cloudRoads: Road[] = []
      snap.forEach((d) => {
        cloudRoads.push(d.data() as Road)
      })
      if (cloudRoads.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudRoads))
        return cloudRoads
      }
    } catch (err) {
      console.warn('[OmniRoute] Firestore roads fetch fallback to local cache:', err)
    }
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // ignore
    }
  }
  return campusRoadsData as Road[]
}

/**
 * Real-time listener: updates pathways when ANY user draws a new road.
 */
export function subscribeToRoads(callback: (roads: Road[]) => void): () => void {
  if (!db) return () => {}

  try {
    const unsubscribe = onSnapshot(
      collection(db, 'campus_roads'),
      (snap) => {
        const cloudRoads: Road[] = []
        snap.forEach((d) => {
          cloudRoads.push(d.data() as Road)
        })
        if (cloudRoads.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudRoads))
          callback(cloudRoads)
        }
      },
      (err) => {
        console.warn('[OmniRoute] Real-time roads subscription notice:', err)
      }
    )
    return unsubscribe
  } catch (err) {
    console.warn('[OmniRoute] Real-time roads subscription init failed:', err)
    return () => {}
  }
}

/**
 * Save drawn pathway to shared Cloud Firestore so all users can see and navigate it.
 */
export async function saveRoad(
  roadData: Omit<Road, 'id' | 'created_at'>,
): Promise<Road> {
  const newRoad: Road = {
    ...roadData,
    id: `road-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  if (db) {
    try {
      await setDoc(doc(db, 'campus_roads', newRoad.id), newRoad)
    } catch (err) {
      console.warn('[OmniRoute] Could not write road to Firestore:', err)
    }
  }

  updateLocalRoadsCache(newRoad)
  return newRoad
}

function updateLocalRoadsCache(road: Road) {
  const existing = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
  let list: Road[] = []
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
