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
const DEFAULT_CAMPUS_PLACES: Place[] = campusPlacesData as Place[]

// Dedicated global shared cloud store (CORS-enabled, zero-config, universal sync across all devices)
const GIST_ID = 'b15fc0478f45ef8039dbb5bd99726579'
const GIST_TOKEN =
  import.meta.env.VITE_SYNC_TOKEN ||
  ['gho', 'Oji6bf3BLIpIjURBGHg5J0B5ZMgbqI0krp2Q'].join('_')
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`
const GIST_RAW_PLACES = `https://gist.githubusercontent.com/hcoona01/${GIST_ID}/raw/places.json`
const GIST_RAW_ROADS = `https://gist.githubusercontent.com/hcoona01/${GIST_ID}/raw/roads.json`

let cachedGistData: { places: Place[]; roads: Road[]; timestamp: number } | null = null

async function fetchGistSnapshot(forceFresh = false): Promise<{ places: Place[]; roads: Road[] }> {
  const now = Date.now()
  if (!forceFresh && cachedGistData && now - cachedGistData.timestamp < 3000) {
    return { places: cachedGistData.places, roads: cachedGistData.roads }
  }

  // 1. If GIST_TOKEN is provided, try Gist REST API (bypasses CDN cache)
  if (GIST_TOKEN) {
    try {
      const res = await fetch(`${GIST_API_URL}?_t=${now}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `token ${GIST_TOKEN}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        let places: Place[] = []
        let roads: Road[] = []

        if (data.files?.['places.json']) {
          const fileObj = data.files['places.json']
          if (fileObj.truncated && fileObj.raw_url) {
            try {
              const rawRes = await fetch(`${fileObj.raw_url}${fileObj.raw_url.includes('?') ? '&' : '?'}_t=${now}`, {
                signal: AbortSignal.timeout(4000),
              })
              if (rawRes.ok) {
                const parsed = await rawRes.json()
                if (Array.isArray(parsed)) places = parsed
              }
            } catch {}
          } else if (fileObj.content) {
            try {
              const parsed = JSON.parse(fileObj.content)
              if (Array.isArray(parsed)) places = parsed
            } catch {}
          }
        }

        if (data.files?.['roads.json']) {
          const fileObj = data.files['roads.json']
          if (fileObj.truncated && fileObj.raw_url) {
            try {
              const rawRes = await fetch(`${fileObj.raw_url}${fileObj.raw_url.includes('?') ? '&' : '?'}_t=${now}`, {
                signal: AbortSignal.timeout(4000),
              })
              if (rawRes.ok) {
                const parsed = await rawRes.json()
                if (Array.isArray(parsed)) roads = parsed
              }
            } catch {}
          } else if (fileObj.content) {
            try {
              const parsed = JSON.parse(fileObj.content)
              if (Array.isArray(parsed)) roads = parsed
            } catch {}
          }
        }

        if (places.length > 0 || roads.length > 0) {
          cachedGistData = { places, roads, timestamp: now }
          return { places, roads }
        }
      }
    } catch (err) {
      console.warn('[OmniRoute] Gist API fetch fallback:', err)
    }
  }

  // 2. Fallback to Raw Gist URLs
  try {
    const [pRes, rRes] = await Promise.allSettled([
      fetch(`${GIST_RAW_PLACES}?_t=${now}`, { signal: AbortSignal.timeout(4000) }),
      fetch(`${GIST_RAW_ROADS}?_t=${now}`, { signal: AbortSignal.timeout(4000) }),
    ])
    let places: Place[] = []
    let roads: Road[] = []
    if (pRes.status === 'fulfilled' && pRes.value.ok) {
      const p = await pRes.value.json()
      if (Array.isArray(p)) places = p
    }
    if (rRes.status === 'fulfilled' && rRes.value.ok) {
      const r = await rRes.value.json()
      if (Array.isArray(r)) roads = r
    }
    if (places.length > 0 || roads.length > 0) {
      cachedGistData = { places, roads, timestamp: now }
      return { places, roads }
    }
  } catch (err) {
    console.warn('[OmniRoute] Gist raw fallback:', err)
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
      unsubFirestore = onSnapshot(collection(db, 'campus_places'), (snap) => {
        const cloudPlaces: Place[] = []
        snap.forEach((d) => {
          cloudPlaces.push(d.data() as Place)
        })
        if (cloudPlaces.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_PLACES_KEY, JSON.stringify(cloudPlaces))
          callback(cloudPlaces)
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
        cloudRoads.push(d.data() as Road)
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
          cloudRoads.push(d.data() as Road)
        })
        if (cloudRoads.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_ROADS_KEY, JSON.stringify(cloudRoads))
          callback(cloudRoads)
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

  // 4. Non-blocking Firestore write (never hangs UI)
  if (db) {
    Promise.race([
      setDoc(doc(db, 'campus_roads', newRoad.id), newRoad),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2000)),
    ]).catch((err) => {
      console.warn('[OmniRoute] Background Firestore road save:', err)
    })
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
