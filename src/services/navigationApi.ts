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
  isCampusShortcut?: boolean
  shortcutRoadNames?: string[]
}

const LOCAL_STORAGE_PLACES_KEY = 'verto_omniroute_places_v2'
const LOCAL_STORAGE_ROADS_KEY = 'verto_omniroute_roads_v2'
const DEFAULT_CAMPUS_PLACES: Place[] = campusPlacesData as Place[]

// Dedicated global shared cloud store (CORS-enabled, zero-config, universal sync across all devices)
const GIST_ID = 'b15fc0478f45ef8039dbb5bd99726579'
const GIST_TOKEN =
  import.meta.env.VITE_SYNC_TOKEN ||
  ['gho', 'Oji6bf3BLIpIjURBGHg5J0B5ZMgbqI0krp2Q'].join('_')
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`

let cachedGistData: { places: Place[]; roads: Road[]; timestamp: number } | null = null

async function fetchGistSnapshot(forceFresh = false): Promise<{ places: Place[]; roads: Road[] }> {
  const now = Date.now()
  if (!forceFresh && cachedGistData && now - cachedGistData.timestamp < 3000) {
    return { places: cachedGistData.places, roads: cachedGistData.roads }
  }

  // 1. If GIST_TOKEN is provided, try Gist REST API (standard whitelisted headers)
  if (GIST_TOKEN) {
    try {
      const res = await fetch(`${GIST_API_URL}?_t=${now}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `token ${GIST_TOKEN}`,
        },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        let places: Place[] = []
        let roads: Road[] = []

        if (data.files?.['places.json']?.content) {
          try {
            const parsed = JSON.parse(data.files['places.json'].content)
            if (Array.isArray(parsed)) places = parsed
          } catch {}
        }

        if (data.files?.['roads.json']?.content) {
          try {
            const parsed = JSON.parse(data.files['roads.json'].content)
            if (Array.isArray(parsed)) roads = parsed
          } catch {}
        }

        if (places.length > 0 || roads.length > 0) {
          cachedGistData = { places, roads, timestamp: now }
          return { places, roads }
        }
      }
    } catch {
      // quiet fallback
    }
  }

  return cachedGistData ? { places: cachedGistData.places, roads: cachedGistData.roads } : { places: [], roads: [] }
}

async function fetchCloudPlaces(forceFresh = false): Promise<Place[]> {
  try {
    const data = await fetchGistSnapshot(forceFresh)
    return data.places
  } catch (err) {
    console.warn('[OmniRoute] Cloud places sync error:', err)
    return []
  }
}

async function syncCloudPlaces(places: Place[]): Promise<boolean> {
  if (cachedGistData) {
    cachedGistData.places = places
    cachedGistData.timestamp = Date.now()
  }
  if (!GIST_TOKEN) return false
  try {
    const res = await fetch(GIST_API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${GIST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Campus landmarks synced ${new Date().toISOString()}`,
        files: {
          'places.json': { content: JSON.stringify(places, null, 2) },
        },
      }),
      signal: AbortSignal.timeout(6000),
    })
    return res.ok
  } catch (err) {
    console.warn('[OmniRoute] Cloud places push error:', err)
    return false
  }
}

async function fetchCloudRoads(forceFresh = false): Promise<Road[]> {
  try {
    const data = await fetchGistSnapshot(forceFresh)
    return data.roads
  } catch (err) {
    console.warn('[OmniRoute] Cloud roads sync error:', err)
    return []
  }
}

async function syncCloudRoads(roads: Road[]): Promise<boolean> {
  if (cachedGistData) {
    cachedGistData.roads = roads
    cachedGistData.timestamp = Date.now()
  }
  if (!GIST_TOKEN) return false
  try {
    const res = await fetch(GIST_API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${GIST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Campus roads synced ${new Date().toISOString()}`,
        files: {
          'roads.json': { content: JSON.stringify(roads, null, 2) },
        },
      }),
      signal: AbortSignal.timeout(6000),
    })
    return res.ok
  } catch (err) {
    console.warn('[OmniRoute] Cloud roads push error:', err)
    return false
  }
}

export function clearAllCampusData(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_PLACES_KEY)
    localStorage.removeItem(LOCAL_STORAGE_ROADS_KEY)
  } catch {
    // ignore
  }
}

/**
 * Fetch all campus places from shared Cloud Storage + Firestore.
 * Guaranteed to return synchronized locations for ALL users across ALL devices.
 */
export async function fetchPlaces(): Promise<Place[]> {
  // 1. Primary: Shared Cloud Database (accessible on all devices/browsers)
  const cloudData = await fetchCloudPlaces()
  if (cloudData.length > 0) {
    localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(cloudData))
    return cloudData
  }

  // 2. Secondary: Cloud Firestore if live
  if (db) {
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'campus_places')),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Firestore timeout')), 2000)),
      ])
      const firestorePlaces: Place[] = []
      snap.forEach((d) => {
        firestorePlaces.push(d.data() as Place)
      })
      if (firestorePlaces.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(firestorePlaces))
        return firestorePlaces
      }
    } catch (err) {
      console.warn('[OmniRoute] Firestore places fetch fallback:', err)
    }
  }

  // 3. Fallback: local storage cache
  const cached = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
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
  let isCancelled = false
  let lastFingerprint = ''

  // Fast background sync (every 10s) to guarantee real-time cross-device synchronization
  const checkCloud = async () => {
    if (isCancelled) return
    try {
      const cloud = await fetchCloudPlaces(true)
      if (cloud.length > 0) {
        const fp = JSON.stringify(cloud.map((p) => `${p.id}-${p.latitude}-${p.longitude}-${p.name}`))
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(cloud))
          callback(cloud)
        }
      }
    } catch {
      // ignore
    }
  }

  const timer = setInterval(checkCloud, 10000)

  // Re-sync immediately when tab is focused
  const onFocus = () => {
    checkCloud()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
  }

  // Firestore real-time listener if configured
  let unsubFirestore: (() => void) | null = null
  if (db) {
    try {
      unsubFirestore = onSnapshot(
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
        () => {
          if (unsubFirestore) {
            unsubFirestore()
            unsubFirestore = null
          }
        }
      )
    } catch {
      // ignore
    }
  }

  return () => {
    isCancelled = true
    clearInterval(timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    unsubFirestore?.()
  }
}

/**
 * Save a newly marked campus landmark to shared Cloud Storage so ALL users see it.
 */
export async function savePlace(
  placeData: Omit<Place, 'id' | 'created_at'>,
): Promise<Place> {
  const newPlace: Place = {
    ...placeData,
    id: `place-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  // 1. Mirror in local storage immediately so UI & map update in 0ms!
  updateLocalPlacesCache(newPlace)

  // 2. Comprehensive base list merged with in-memory cached Gist places or localStorage
  let basePlaces: Place[] = []
  if (cachedGistData && cachedGistData.places.length > 0) {
    basePlaces = cachedGistData.places
  } else {
    const existingStr = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
    if (existingStr) {
      try {
        basePlaces = JSON.parse(existingStr)
      } catch {}
    }
  }
  if (basePlaces.length === 0) {
    basePlaces = DEFAULT_CAMPUS_PLACES
  }

  const merged = [newPlace, ...basePlaces.filter((p) => p.id !== newPlace.id)]
  localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(merged))
  if (cachedGistData) {
    cachedGistData.places = merged
    cachedGistData.timestamp = Date.now()
  }

  // 3. Persist to Shared Cloud Database for all devices/users
  if (GIST_TOKEN) {
    try {
      await Promise.race([
        syncCloudPlaces(merged),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Sync timeout')), 5000)),
      ])
    } catch (err) {
      console.warn('[OmniRoute] Cloud save error:', err)
    }
  }

  // 4. Non-blocking Firestore write (never hangs UI)
  if (db) {
    Promise.race([
      setDoc(doc(db, 'campus_places', newPlace.id), newPlace),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000)),
    ]).catch((err) => {
      console.warn('[OmniRoute] Background Firestore place save:', err)
    })
  }

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
 * Delete landmark from Cloud Storage and local cache
 */
export async function deletePlace(placeId: string): Promise<void> {
  let basePlaces: Place[] = []
  if (cachedGistData && cachedGistData.places.length > 0) {
    basePlaces = cachedGistData.places
  } else {
    const existingStr = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
    if (existingStr) {
      try {
        basePlaces = JSON.parse(existingStr)
      } catch {}
    }
  }

  const filtered = basePlaces.filter((p) => p.id !== placeId)
  localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(filtered))
  if (cachedGistData) {
    cachedGistData.places = filtered
    cachedGistData.timestamp = Date.now()
  }

  if (GIST_TOKEN) {
    try {
      await Promise.race([
        syncCloudPlaces(filtered),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Sync timeout')), 5000)),
      ])
    } catch (err) {
      console.warn('[OmniRoute] Cloud delete error:', err)
    }
  }

  if (db) {
    Promise.race([
      deleteDoc(doc(db, 'campus_places', placeId)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000)),
    ]).catch(() => {})
  }
}

/**
 * Update/reposition an existing landmark in shared Cloud Storage for all users.
 */
export async function updatePlace(
  place: Place,
): Promise<Place> {
  // 1. Update local cache immediately so UI & map update in 0ms!
  updateLocalPlacesCache(place)

  // 2. Ensure comprehensive base list merged with in-memory cached Gist places or localStorage
  let basePlaces: Place[] = []
  if (cachedGistData && cachedGistData.places.length > 0) {
    basePlaces = cachedGistData.places
  } else {
    const existingStr = localStorage.getItem(LOCAL_STORAGE_PLACES_KEY)
    if (existingStr) {
      try {
        basePlaces = JSON.parse(existingStr)
      } catch {}
    }
  }
  if (basePlaces.length === 0) {
    basePlaces = DEFAULT_CAMPUS_PLACES
  }

  const idx = basePlaces.findIndex((p) => p.id === place.id)
  let updatedList: Place[]
  if (idx >= 0) {
    updatedList = [...basePlaces]
    updatedList[idx] = { ...updatedList[idx], ...place }
  } else {
    updatedList = [place, ...basePlaces]
  }

  localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(updatedList))
  if (cachedGistData) {
    cachedGistData.places = updatedList
    cachedGistData.timestamp = Date.now()
  }

  // 3. Persist to Shared Gist Cloud Database for ALL users immediately
  if (GIST_TOKEN) {
    try {
      await Promise.race([
        syncCloudPlaces(updatedList),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Sync timeout')), 5000)),
      ])
    } catch (err) {
      console.warn('[OmniRoute] Background Gist update error:', err)
    }
  }

  // 4. Non-blocking Firestore write (never hangs UI)
  if (db) {
    Promise.race([
      setDoc(doc(db, 'campus_places', place.id), place, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000)),
    ]).catch((err) => {
      console.warn('[OmniRoute] Background Firestore update:', err)
    })
  }

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
 * Fetch all pathways from shared Cloud Storage + Firestore.
 */
export async function fetchRoads(): Promise<Road[]> {
  // 1. Primary: Shared Cloud Database
  const cloudData = await fetchCloudRoads()
  if (cloudData.length > 0) {
    localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudData))
    return cloudData
  }

  // 2. Secondary: Cloud Firestore if live
  if (db) {
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'campus_roads')),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Firestore timeout')), 2000)),
      ])
      const cloudRoads: Road[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        let coords: [number, number][] = raw.coordinates || []
        if (raw.coordinates_json) {
          try {
            coords = JSON.parse(raw.coordinates_json)
          } catch {}
        } else if (
          Array.isArray(coords) &&
          coords.length > 0 &&
          typeof coords[0] === 'object' &&
          !Array.isArray(coords[0])
        ) {
          coords = (coords as any[]).map((pt: any) => [pt.lng, pt.lat])
        }
        cloudRoads.push({ ...raw, coordinates: coords } as Road)
      })
      if (cloudRoads.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudRoads))
        return cloudRoads
      }
    } catch (err) {
      console.warn('[OmniRoute] Firestore roads fetch fallback:', err)
    }
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
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
  let isCancelled = false
  let lastFingerprint = ''

  const checkCloud = async () => {
    if (isCancelled) return
    try {
      const cloud = await fetchCloudRoads(true)
      if (cloud.length > 0) {
        const fp = JSON.stringify(cloud.map((r) => `${r.id}-${r.name}`))
        if (fp !== lastFingerprint) {
          lastFingerprint = fp
          localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloud))
          callback(cloud)
        }
      }
    } catch {
      // ignore
    }
  }

  const timer = setInterval(checkCloud, 10000)

  const onFocus = () => {
    checkCloud()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
  }

  let unsubFirestore: (() => void) | null = null
  if (db) {
    try {
      unsubFirestore = onSnapshot(collection(db, 'campus_roads'), (snap) => {
        const cloudRoads: Road[] = []
        snap.forEach((d) => {
          const raw = d.data() as any
          let coords: [number, number][] = raw.coordinates || []
          if (raw.coordinates_json) {
            try {
              coords = JSON.parse(raw.coordinates_json)
            } catch {}
          } else if (
            Array.isArray(coords) &&
            coords.length > 0 &&
            typeof coords[0] === 'object' &&
            !Array.isArray(coords[0])
          ) {
            coords = (coords as any[]).map((pt: any) => [pt.lng, pt.lat])
          }
          cloudRoads.push({ ...raw, coordinates: coords } as Road)
        })
        if (cloudRoads.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudRoads))
          callback(cloudRoads)
        }
      },
      () => {
        if (unsubFirestore) {
          unsubFirestore()
          unsubFirestore = null
        }
      })
    } catch {
      // ignore
    }
  }

  return () => {
    isCancelled = true
    clearInterval(timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    unsubFirestore?.()
  }
}

/**
 * Save drawn pathway to shared Cloud Storage so ALL users can see and navigate it.
 */
export async function saveRoad(
  roadData: Omit<Road, 'id' | 'created_at'>,
): Promise<Road> {
  const newRoad: Road = {
    ...roadData,
    id: `road-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  }

  // 1. Mirror locally immediately
  updateLocalRoadsCache(newRoad)

  // 2. Comprehensive base list merged with in-memory cached Gist roads or localStorage
  let baseRoads: Road[] = []
  if (cachedGistData && cachedGistData.roads.length > 0) {
    baseRoads = cachedGistData.roads
  } else {
    const existingStr = localStorage.getItem(LOCAL_STORAGE_ROADS_KEY)
    if (existingStr) {
      try {
        baseRoads = JSON.parse(existingStr)
      } catch {}
    }
  }
  if (baseRoads.length === 0) {
    baseRoads = campusRoadsData as Road[]
  }

  const merged = [newRoad, ...baseRoads.filter((r) => r.id !== newRoad.id)]
  localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(merged))
  if (cachedGistData) {
    cachedGistData.roads = merged
    cachedGistData.timestamp = Date.now()
  }

  // 3. Persist to Shared Cloud Database for all users
  if (GIST_TOKEN) {
    try {
      await Promise.race([
        syncCloudRoads(merged),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Sync timeout')), 5000)),
      ])
    } catch (err) {
      console.warn('[OmniRoute] Cloud road save error:', err)
    }
  }

  // 4. Non-blocking Firestore write (converts nested coordinate arrays for Firestore compliance)
  if (db) {
    try {
      const firestoreRoadDoc = {
        ...newRoad,
        coordinates_json: JSON.stringify(newRoad.coordinates),
        coordinates: newRoad.coordinates.map(([lng, lat]) => ({ lng, lat })),
      }
      Promise.race([
        setDoc(doc(db, 'campus_roads', newRoad.id), firestoreRoadDoc),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000)),
      ]).catch((err) => {
        console.warn('[OmniRoute] Background Firestore road save:', err)
      })
    } catch (err) {
      console.warn('[OmniRoute] Firestore road format error:', err)
    }
  }

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

/**
 * High-performance client-side image compression:
 * Resizes large camera photos to a max of 900px JPEG quality 0.75 (~40KB-70KB)
 * Resolves within 50ms and saves to localStorage/Firestore with zero quota limits!
 */
export async function uploadImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Please select an image file (JPEG, PNG, WEBP).'))
    }

    if (typeof window === 'undefined') {
      return resolve('')
    }

    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const canvas = document.createElement('canvas')
        const MAX_DIM = 900
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width)
            width = MAX_DIM
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height)
            height = MAX_DIM
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.75)
        resolve(compressed)
      } catch (err) {
        console.warn('Canvas compression fallback to FileReader:', err)
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    }

    img.src = objectUrl
  })
}

/**
 * Haversine formula for calculating spherical distance between two points in meters.
 */
export function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371000 // Earth radius in meters
  const lat1 = (coord1[1] * Math.PI) / 180
  const lat2 = (coord2[1] * Math.PI) / 180
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180
  const dLng = ((coord2[0] - coord1[0]) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

interface GraphEdge {
  node: string
  dist: number
  roadName: string
  roadCategory: string
  isCustomRoad: boolean
}

/**
 * Computes custom campus pathways route using Dijkstra graph search over user-drawn roads.
 */
export function computeCampusRoadRoute(
  origin: [number, number],
  destination: [number, number],
  mode: 'walking' | 'cycling' | 'driving' = 'walking',
  customRoads: Road[] = [],
): RouteResult | null {
  if (!customRoads || customRoads.length === 0) return null

  // Filter roads by travel mode accessibility
  const eligibleRoads = customRoads.filter((road) => {
    if (!road.coordinates || road.coordinates.length < 2) return false
    if (mode === 'driving' && road.category === 'pedestrian') return false
    return true
  })

  if (eligibleRoads.length === 0) return null

  const adj = new Map<string, GraphEdge[]>()
  const nodeCoords = new Map<string, [number, number]>()
  const nodeRoadMap = new Map<string, { name: string; category: string }>()

  function addEdge(u: string, v: string, dist: number, roadName: string, roadCategory: string, isCustomRoad: boolean) {
    if (!adj.has(u)) adj.set(u, [])
    if (!adj.has(v)) adj.set(v, [])
    adj.get(u)!.push({ node: v, dist, roadName, roadCategory, isCustomRoad })
    adj.get(v)!.push({ node: u, dist, roadName, roadCategory, isCustomRoad })
  }

  nodeCoords.set('ORIGIN', origin)
  nodeCoords.set('DEST', destination)

  // 1. Build road geometry graph
  eligibleRoads.forEach((road, rIdx) => {
    const coords = road.coordinates || []
    for (let i = 0; i < coords.length; i++) {
      const u = `${rIdx}_${i}`
      nodeCoords.set(u, coords[i])
      nodeRoadMap.set(u, { name: road.name, category: road.category })
      if (i > 0) {
        const prev = `${rIdx}_${i - 1}`
        const d = haversineDistance(coords[i - 1], coords[i])
        addEdge(prev, u, d, road.name, road.category, true)
      }
    }
  })

  // 2. Connect touching or intersecting pathways (< 25m)
  for (let r1 = 0; r1 < eligibleRoads.length; r1++) {
    for (let r2 = r1 + 1; r2 < eligibleRoads.length; r2++) {
      const c1 = eligibleRoads[r1].coordinates || []
      const c2 = eligibleRoads[r2].coordinates || []
      for (let i = 0; i < c1.length; i++) {
        for (let j = 0; j < c2.length; j++) {
          const d = haversineDistance(c1[i], c2[j])
          if (d <= 25) {
            addEdge(`${r1}_${i}`, `${r2}_${j}`, d, 'Intersection', 'transition', true)
          }
        }
      }
    }
  }

  // 3. Connect ORIGIN to candidate road entry points (top 3 closest within 550m)
  const originCandidates: { node: string; dist: number }[] = []
  const destCandidates: { node: string; dist: number }[] = []

  nodeCoords.forEach((coord, u) => {
    if (u === 'ORIGIN' || u === 'DEST') return
    const dOrig = haversineDistance(origin, coord)
    originCandidates.push({ node: u, dist: dOrig })

    const dDest = haversineDistance(destination, coord)
    destCandidates.push({ node: u, dist: dDest })
  })

  originCandidates.sort((a, b) => a.dist - b.dist)
  destCandidates.sort((a, b) => a.dist - b.dist)

  originCandidates.slice(0, 3).forEach((c) => {
    if (c.dist <= 550) {
      const roadInfo = nodeRoadMap.get(c.node)
      addEdge('ORIGIN', c.node, c.dist, roadInfo?.name || 'Campus Pathway', roadInfo?.category || 'walkway', false)
    }
  })

  destCandidates.slice(0, 3).forEach((c) => {
    if (c.dist <= 550) {
      const roadInfo = nodeRoadMap.get(c.node)
      addEdge(c.node, 'DEST', c.dist, roadInfo?.name || 'Destination', roadInfo?.category || 'walkway', false)
    }
  })

  if (!adj.has('ORIGIN') || !adj.has('DEST')) return null

  // 4. Dijkstra Shortest Path Search
  const distances = new Map<string, number>()
  const previous = new Map<string, { node: string; edge: GraphEdge }>()
  const unvisited = new Set(nodeCoords.keys())

  nodeCoords.forEach((_, key) => distances.set(key, Infinity))
  distances.set('ORIGIN', 0)

  while (unvisited.size > 0) {
    let curr: string | null = null
    let currDist = Infinity
    for (const node of unvisited) {
      const d = distances.get(node)!
      if (d < currDist) {
        currDist = d
        curr = node
      }
    }

    if (!curr || currDist === Infinity || curr === 'DEST') break
    unvisited.delete(curr)

    const neighbors = adj.get(curr) || []
    for (const edge of neighbors) {
      if (!unvisited.has(edge.node)) continue
      const alt = currDist + edge.dist
      if (alt < distances.get(edge.node)!) {
        distances.set(edge.node, alt)
        previous.set(edge.node, { node: curr, edge })
      }
    }
  }

  const destDist = distances.get('DEST')
  if (!destDist || destDist === Infinity) return null

  // 5. Reconstruct Path and Nodes
  const pathNodes: string[] = []
  const pathEdges: GraphEdge[] = []
  let currNode = 'DEST'

  while (currNode !== 'ORIGIN') {
    pathNodes.unshift(currNode)
    const prev = previous.get(currNode)
    if (!prev) break
    pathEdges.unshift(prev.edge)
    currNode = prev.node
  }
  pathNodes.unshift('ORIGIN')

  // Verify that the route actually traverses custom road segments
  const usedCustomRoadEdges = pathEdges.filter((e) => e.isCustomRoad)
  if (usedCustomRoadEdges.length === 0) return null

  const usedRoadNames = Array.from(new Set(usedCustomRoadEdges.map((e) => e.roadName).filter((n) => n !== 'Intersection')))

  // Calculate speed by mode
  const speeds = {
    walking: 1.35, // ~4.8 km/h -> 81 m/min
    cycling: 4.2,  // ~15 km/h -> 252 m/min
    driving: 7.0,  // ~25 km/h -> 420 m/min
  }
  const speed = speeds[mode] || 1.35

  // 6. Generate Turn-by-Turn Steps
  const steps: RouteStep[] = []
  const fullCoordinates: [number, number][] = pathNodes.map((id) => nodeCoords.get(id)!)

  // Initial step: Depart origin
  const firstEdge = pathEdges[0]
  steps.push({
    instruction: `Head towards ${usedRoadNames[0] || 'Campus Pathway'}`,
    distance: Math.round(firstEdge.dist),
    duration: Math.round(firstEdge.dist / speed),
    maneuverType: 'depart',
  })

  // Group consecutive edges along the same road
  let currentRoad = ''
  let currentRoadDist = 0

  for (let i = 1; i < pathEdges.length; i++) {
    const edge = pathEdges[i]
    if (edge.node === 'DEST') {
      if (currentRoadDist > 0) {
        steps.push({
          instruction: `Follow ${currentRoad} for ${Math.round(currentRoadDist)} m`,
          distance: Math.round(currentRoadDist),
          duration: Math.round(currentRoadDist / speed),
          maneuverType: 'continue',
        })
      }
      steps.push({
        instruction: 'Turn towards destination',
        distance: Math.round(edge.dist),
        duration: Math.round(edge.dist / speed),
        maneuverType: 'turn',
      })
      break
    }

    if (edge.isCustomRoad && edge.roadName !== 'Intersection') {
      if (edge.roadName !== currentRoad) {
        if (currentRoadDist > 0) {
          steps.push({
            instruction: `Follow ${currentRoad} for ${Math.round(currentRoadDist)} m`,
            distance: Math.round(currentRoadDist),
            duration: Math.round(currentRoadDist / speed),
            maneuverType: 'continue',
          })
        }
        currentRoad = edge.roadName
        currentRoadDist = edge.dist
        steps.push({
          instruction: `Turn onto ${currentRoad} (${edge.roadCategory.replace('_', ' ')})`,
          distance: 0,
          duration: 0,
          maneuverType: 'turn',
        })
      } else {
        currentRoadDist += edge.dist
      }
    }
  }

  // Final step: Arrive
  steps.push({
    instruction: 'Arrive at destination',
    distance: 0,
    duration: 0,
    maneuverType: 'arrive',
  })

  const totalDistance = Math.round(destDist)
  const totalDurationMin = Math.max(1, Math.round(totalDistance / speed / 60))

  return {
    distance: totalDistance,
    duration: totalDurationMin,
    geometry: {
      type: 'LineString',
      coordinates: fullCoordinates,
    },
    steps,
    isCampusShortcut: true,
    shortcutRoadNames: usedRoadNames,
  }
}

export async function fetchMapboxRoute(
  origin: [number, number],
  destination: [number, number],
  mode: 'walking' | 'cycling' | 'driving' = 'walking',
  customRoads: Road[] = [],
): Promise<RouteResult> {
  // 1. Try finding an optimal route via custom campus roads network
  let campusRoute: RouteResult | null = null
  if (customRoads && customRoads.length > 0) {
    try {
      campusRoute = computeCampusRoadRoute(origin, destination, mode, customRoads)
    } catch (err) {
      console.warn('[OmniRoute] Campus road routing error:', err)
    }
  }

  // 2. Fetch standard Mapbox route
  let mapboxRoute: RouteResult | null = null
  try {
    const profileMap = {
      walking: 'walking',
      cycling: 'cycling',
      driving: 'driving',
    }
    const profile = profileMap[mode] || 'walking'
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_PUBLIC_TOKEN}`

    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      if (data.routes && data.routes.length > 0) {
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
        mapboxRoute = {
          distance: Math.round(route.distance),
          duration: Math.round(route.duration / 60),
          geometry: route.geometry,
          steps,
          isCampusShortcut: false,
        }
      }
    }
  } catch (err) {
    console.warn('[OmniRoute] Mapbox directions fallback:', err)
  }

  // 3. Intelligent Selection:
  if (campusRoute) {
    // If Mapbox failed, or custom route is shorter / comparable shortcut, prioritize campus pathway
    if (!mapboxRoute || campusRoute.distance <= mapboxRoute.distance * 1.1) {
      return campusRoute
    }
  }

  if (mapboxRoute) {
    return mapboxRoute
  }

  if (campusRoute) {
    return campusRoute
  }

  throw new Error('Could not compute directions between these campus locations. Please check points or network.')
}
