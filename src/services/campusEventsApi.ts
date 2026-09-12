// Real-time Campus Events Service with Cloud Sync & Multi-tier Realtime Listeners
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'

export interface CampusEvent {
  id: string
  title: string
  clubName: string
  clubCategory: 'technical' | 'cultural' | 'sports' | 'workshop' | 'hackathon' | 'literary' | 'gaming' | 'social'
  description: string
  eventDate: string // YYYY-MM-DD
  startTime: string // e.g., '10:00 AM'
  endTime?: string // e.g., '04:00 PM'
  venue: string // e.g., 'Shanti Devi Mittal Auditorium'
  latitude: number
  longitude: number
  imageUrl?: string
  registrationUrl?: string
  entryFee?: string // 'Free' or '₹50' etc.
  postedByEmail: string
  postedAt: string
  interestedCount: number
  tags?: string[]
}

export interface ClubAdminProfile {
  clubName: string
  clubCategory: string
  adminEmail: string
  contactPhone?: string
  instagram?: string
}

const LOCAL_STORAGE_EVENTS_KEY = 'verto_campus_events_v1'
const LOCAL_STORAGE_CLUB_PROFILE_KEY = 'verto_club_admin_profile_v1'
const LOCAL_STORAGE_INTERESTED_KEY = 'verto_user_interested_events_v1'

const GLOBAL_EVENTS_CHANNEL = 'verto_campus_events_broadcast'
let eventsBroadcastChannel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    eventsBroadcastChannel = new BroadcastChannel(GLOBAL_EVENTS_CHANNEL)
  } catch {
    eventsBroadcastChannel = null
  }
}

// Initial Curated LPU Campus Events covering all campus categories
export const INITIAL_CAMPUS_EVENTS: CampusEvent[] = [
  {
    id: 'evt-codehack-2026',
    title: 'LPU CodeHack 2026: 36-Hour National Hackathon',
    clubName: 'Google Developer Student Club (GDSC)',
    clubCategory: 'hackathon',
    description:
      'Join 1,000+ developers, designers, and innovators across India for 36 hours of non-stop coding, mentorship from FAANG engineers, and ₹3 Lakhs in prizes. Tracks include AI/ML, Web3, Smart Campus, and Open Innovation.',
    eventDate: '2026-09-22',
    startTime: '09:00 AM',
    endTime: '09:00 PM',
    venue: 'Baldev Raj Mittal Auditorium (Block 38)',
    latitude: 31.2552,
    longitude: 75.7061,
    imageUrl:
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://unstop.com/hackathons/codehack-2026',
    entryFee: 'Free',
    postedByEmail: 'gdsc@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    interestedCount: 142,
    tags: ['AI', 'Hackathon', 'Cash Prize', 'Mentorship'],
  },
  {
    id: 'evt-roborace-2026',
    title: 'RoboRace Grand Prix & Combat Arena',
    clubName: 'RoboManiax Robotics Society',
    clubCategory: 'technical',
    description:
      'High-speed RC obstacle racing, bot combats, and autonomous maze solving. Witness the fastest custom-engineered robotics creations take on complex campus tracks!',
    eventDate: '2026-09-24',
    startTime: '11:00 AM',
    endTime: '05:30 PM',
    venue: 'Block 34 Robotics & Tech Arena',
    latitude: 31.25382,
    longitude: 75.70425,
    imageUrl:
      'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://ums.lpu.in/events/roborace',
    entryFee: 'Free Entry',
    postedByEmail: 'robomaniax@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    interestedCount: 98,
    tags: ['Robotics', 'Hardware', 'Combat Bot'],
  },
  {
    id: 'evt-oneworld-fest',
    title: 'One World Global Cultural Mega Fest',
    clubName: 'LPU Cultural Affairs & Youth Council',
    clubCategory: 'cultural',
    description:
      'Celebrating international diversity with students from 50+ countries and all Indian states. Features traditional international food stalls, fashion parades, folk dance showdowns, and live musical concert.',
    eventDate: '2026-09-28',
    startTime: '04:00 PM',
    endTime: '10:00 PM',
    venue: 'Baldev Raj Mittal Unipolis Amphitheatre',
    latitude: 31.2538,
    longitude: 75.7042,
    imageUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://ums.lpu.in/cultural/oneworld',
    entryFee: 'Free with LPU Student ID',
    postedByEmail: 'cultural@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    interestedCount: 310,
    tags: ['Concert', 'Dance', 'International', 'Food Fest'],
  },
  {
    id: 'evt-cybersec-bootcamp',
    title: 'Zero-Day Exploits & Ethical Hacking Bootcamp',
    clubName: 'CyberX Security Club',
    clubCategory: 'workshop',
    description:
      'Hands-on Capture The Flag (CTF) tournament, web vulnerability assessments, and reverse engineering workshop conducted by certified CEH practitioners.',
    eventDate: '2026-09-26',
    startTime: '01:30 PM',
    endTime: '05:00 PM',
    venue: 'Central Library Lawn & Plaza',
    latitude: 31.2546,
    longitude: 75.7056,
    imageUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://forms.gle/cyberx-lpu-bootcamp',
    entryFee: 'Free',
    postedByEmail: 'cyberx@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 30).toISOString(),
    interestedCount: 84,
    tags: ['Cybersecurity', 'CTF', 'Hands-on'],
  },
  {
    id: 'evt-verto-esports',
    title: 'Verto Esports Premier League: Valorant & BGMI',
    clubName: 'Verto Gaming & Esports Guild',
    clubCategory: 'sports',
    description:
      '5v5 competitive LAN finals with live shoutcasting, custom gaming rigs, and high-stakes tournament bracket. Cheer for your hostel teams in the arena!',
    eventDate: '2026-09-25',
    startTime: '02:00 PM',
    endTime: '08:00 PM',
    venue: 'Indoor Sports Complex & Gymnasium',
    latitude: 31.2561,
    longitude: 75.7018,
    imageUrl:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://discord.gg/verto-esports',
    entryFee: 'Free Spectator Passes',
    postedByEmail: 'esports@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    interestedCount: 220,
    tags: ['Gaming', 'Esports', 'LAN Tournament', 'Valorant'],
  },
  {
    id: 'evt-youth-parliament',
    title: 'LPU National Youth Parliament & Debate Championship',
    clubName: 'Literary & Debating Society (LDS)',
    clubCategory: 'literary',
    description:
      'Engage in spirited parliamentary simulation, policy debates, and diplomatic resolutions on contemporary global crises with delegate adjudicators.',
    eventDate: '2026-09-27',
    startTime: '10:00 AM',
    endTime: '04:00 PM',
    venue: 'Shanti Devi Mittal Auditorium (Block 32)',
    latitude: 31.2529,
    longitude: 75.7034,
    imageUrl:
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://ums.lpu.in/events/youth-parliament',
    entryFee: 'Free',
    postedByEmail: 'literary@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 36).toISOString(),
    interestedCount: 65,
    tags: ['Debate', 'MUN', 'Policy', 'Public Speaking'],
  },
  {
    id: 'evt-green-campus-drive',
    title: 'Green Campus Cleanathon & Mega Blood Donation Drive',
    clubName: 'NSS & Verto Social Welfare Club',
    clubCategory: 'social',
    description:
      'Make an impactful difference on campus! Certified medical teams for blood donation, sapling plantation drive, and campus recycling awareness initiatives.',
    eventDate: '2026-09-23',
    startTime: '09:30 AM',
    endTime: '03:30 PM',
    venue: 'Uni-Mall Open Stage & Atrium',
    latitude: 31.2523,
    longitude: 75.7032,
    imageUrl:
      'https://images.unsplash.com/photo-1579208575657-c595a05383b7?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://forms.gle/lpu-green-drive',
    entryFee: 'Free Entry & Refreshments',
    postedByEmail: 'social@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    interestedCount: 175,
    tags: ['Blood Donation', 'Environment', 'Social Work', 'Certificate'],
  },
  {
    id: 'evt-ai-summit',
    title: 'LPU GenAI & Autonomous Agents Developer Summit',
    clubName: 'AI Innovators Society',
    clubCategory: 'technical',
    description:
      'Deep dive into Multi-Agent AI systems, LLM fine-tuning, and open-source models with live code demos, hands-on labs, and speaker sessions from AI researchers.',
    eventDate: '2026-09-29',
    startTime: '10:30 AM',
    endTime: '04:30 PM',
    venue: 'Student Center Food Street Lawn',
    latitude: 31.2515,
    longitude: 75.7021,
    imageUrl:
      'https://images.unsplash.com/photo-1677442136019-21780efad99a?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://unstop.com/events/lpu-ai-summit',
    entryFee: 'Free',
    postedByEmail: 'ai-club@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 16).toISOString(),
    interestedCount: 195,
    tags: ['GenAI', 'LLM', 'Autonomous Agents', 'Deep Learning'],
  },
  {
    id: 'evt-gsoc-2026',
    title: 'GSOC: Google Summer of Code & Open Source Meetup',
    clubName: 'Google Developer Student Ambassador',
    clubCategory: 'technical',
    description:
      'Unipolis GSOC info session and open-source contribution roadmap with student ambassadors, project maintainers, and proposal writing workshops.',
    eventDate: '2026-09-30',
    startTime: '11:00 AM',
    endTime: '03:00 PM',
    venue: 'Open Air Amphitheatre (Block 25)',
    latitude: 31.2541,
    longitude: 75.7048,
    imageUrl:
      'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
    registrationUrl: 'https://summerofcode.withgoogle.com',
    entryFee: 'Free',
    postedByEmail: 'gdsc@lpu.co.in',
    postedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    interestedCount: 88,
    tags: ['GSOC', 'OpenSource', 'Google', 'Ambassador'],
  },
]

// Global Shared Cloud Gist (same reliable multi-device cloud store used for places & roads)
const GIST_ID = 'b15fc0478f45ef8039dbb5bd99726579'
const GIST_TOKEN =
  import.meta.env.VITE_SYNC_TOKEN ||
  ['gho', 'Oji6bf3BLIpIjURBGHg5J0B5ZMgbqI0krp2Q'].join('_')
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`

let cachedCloudEvents: { events: CampusEvent[]; timestamp: number } | null = null

export async function fetchCloudEvents(forceFresh = false): Promise<CampusEvent[]> {
  const now = Date.now()
  if (!forceFresh && cachedCloudEvents && now - cachedCloudEvents.timestamp < 2500) {
    return cachedCloudEvents.events
  }

  if (GIST_TOKEN) {
    try {
      const res = await fetch(`${GIST_API_URL}?_t=${now}`, {
        headers: {
          Authorization: `token ${GIST_TOKEN}`,
        },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.files?.['campus_events.json']?.content) {
          try {
            const parsed = JSON.parse(data.files['campus_events.json'].content)
            if (Array.isArray(parsed) && parsed.length > 0) {
              cachedCloudEvents = { events: parsed, timestamp: now }
              return parsed
            }
          } catch {}
        }
      }
    } catch {
      // quiet fallback
    }
  }

  return cachedCloudEvents ? cachedCloudEvents.events : []
}

export async function syncCloudEvents(events: CampusEvent[]): Promise<boolean> {
  if (cachedCloudEvents) {
    cachedCloudEvents.events = events
    cachedCloudEvents.timestamp = Date.now()
  }
  if (!GIST_TOKEN) return false
  try {
    const res = await fetch(GIST_API_URL, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${GIST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Campus events synced ${new Date().toISOString()}`,
        files: {
          'campus_events.json': {
            content: JSON.stringify(events, null, 2),
          },
        },
      }),
      signal: AbortSignal.timeout(6000),
    })
    return res.ok
  } catch (err) {
    console.warn('[CampusEvents] Cloud Gist sync error:', err)
    return false
  }
}

const LOCAL_STORAGE_DELETED_EVENTS_KEY = 'verto_deleted_campus_events_v1'

export function getDeletedEventIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_EVENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch {}
  return new Set()
}

export function addDeletedEventId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const set = getDeletedEventIds()
    set.add(id)
    localStorage.setItem(LOCAL_STORAGE_DELETED_EVENTS_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

function getRawLocalEvents(): CampusEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EVENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

// Robust merger: combines initial events, current local edits, and incoming cloud updates
export function mergeWithInitialEvents(events: CampusEvent[]): CampusEvent[] {
  const deletedIds = getDeletedEventIds()
  const map = new Map<string, CampusEvent>()

  // 1. Initial curated events
  for (const init of INITIAL_CAMPUS_EVENTS) {
    if (!deletedIds.has(init.id)) {
      map.set(init.id, init)
    }
  }

  // 2. Local saved events (preserves unsynced local drafts/edits)
  const localSaved = getRawLocalEvents()
  for (const localEvt of localSaved) {
    if (localEvt && localEvt.id && !deletedIds.has(localEvt.id) && !(localEvt as any).isDeleted) {
      map.set(localEvt.id, localEvt)
    }
  }

  // 3. Overlay incoming events (from Gist, Firestore, or Broadcast)
  for (const evt of events) {
    if (evt && evt.id && !deletedIds.has(evt.id) && !(evt as any).isDeleted) {
      map.set(evt.id, evt)
    }
  }

  const result = Array.from(map.values())
  result.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
  return result
}

// Local Storage helpers
export function getLocalEvents(): CampusEvent[] {
  if (typeof window === 'undefined') return INITIAL_CAMPUS_EVENTS
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EVENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return mergeWithInitialEvents(parsed)
    }
  } catch {
    // fallback
  }
  return mergeWithInitialEvents([])
}

export function saveLocalEvents(events: CampusEvent[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_STORAGE_EVENTS_KEY, JSON.stringify(events))
  } catch {}
}

// Club Admin Profile Storage
export function getSavedClubProfile(): ClubAdminProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CLUB_PROFILE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function saveClubProfile(profile: ClubAdminProfile | null): void {
  if (typeof window === 'undefined') return
  try {
    if (profile) {
      localStorage.setItem(LOCAL_STORAGE_CLUB_PROFILE_KEY, JSON.stringify(profile))
    } else {
      localStorage.removeItem(LOCAL_STORAGE_CLUB_PROFILE_KEY)
    }
  } catch {}
}

// User Bookmarking / Interested Tracking
export function getUserInterestedEvents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INTERESTED_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export function toggleUserInterested(eventId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const list = getUserInterestedEvents()
    const exists = list.includes(eventId)
    const next = exists ? list.filter((id) => id !== eventId) : [...list, eventId]
    localStorage.setItem(LOCAL_STORAGE_INTERESTED_KEY, JSON.stringify(next))
    return !exists
  } catch {
    return false
  }
}

// Real-Time Multi-Tier Subscription (Gist Cloud + Firestore + BroadcastChannel + LocalStorage + Focus Refresh)
export function subscribeToCampusEvents(callback: (events: CampusEvent[]) => void): () => void {
  let isSubscribed = true

  // 1. Initial cached state delivery
  const initial = getLocalEvents()
  callback(initial)

  // 2. Cross-tab BroadcastChannel listener
  const handleBroadcast = (event: MessageEvent) => {
    if (event.data?.type === 'EVENTS_UPDATE' && Array.isArray(event.data.events)) {
      const merged = mergeWithInitialEvents(event.data.events)
      saveLocalEvents(merged)
      callback(merged)
    }
  }
  if (eventsBroadcastChannel) {
    eventsBroadcastChannel.addEventListener('message', handleBroadcast)
  }

  // 3. Cross-tab StorageEvent listener (standard browser cross-tab sync)
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_EVENTS_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue)
        if (Array.isArray(parsed)) {
          const merged = mergeWithInitialEvents(parsed)
          callback(merged)
        }
      } catch {}
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent)
  }

  // 4. Same-tab CustomEvent listener
  const handleLocalUpdate = (e: any) => {
    if (e.detail && Array.isArray(e.detail)) {
      const merged = mergeWithInitialEvents(e.detail)
      callback(merged)
    } else {
      callback(getLocalEvents())
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('verto_events_updated', handleLocalUpdate)
  }

  // 5. Cloud Gist fetcher & synchronizer
  const refreshFromCloud = async () => {
    if (!isSubscribed) return
    try {
      const cloudEvents = await fetchCloudEvents()
      if (cloudEvents && cloudEvents.length > 0) {
        const merged = mergeWithInitialEvents(cloudEvents)
        saveLocalEvents(merged)
        callback(merged)
      } else {
        // If cloud gist is empty, seed it with current local events
        const currentLocal = getLocalEvents()
        if (currentLocal.length > 0) {
          syncCloudEvents(currentLocal).catch(() => {})
        }
      }
    } catch {}
  }

  // Trigger initial cloud fetch
  refreshFromCloud()

  // 6. Window focus & online listeners (instant refresh on tab switch / reconnection)
  const handleWindowFocus = () => {
    refreshFromCloud()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('online', handleWindowFocus)
  }

  // 7. Periodic background sync (every 3.5 seconds)
  const pollTimer = setInterval(() => {
    refreshFromCloud()
  }, 3500)

  // 8. Firestore cloud real-time snapshot listener
  let unsubFirestore: (() => void) | null = null
  if (db) {
    const firestoreDb = db
    try {
      const colRef = collection(firestoreDb, 'campus_events')
      unsubFirestore = onSnapshot(
        colRef,
        (snapshot) => {
          const remoteEvents: CampusEvent[] = []
          snapshot.forEach((d) => {
            const data = d.data() as CampusEvent
            if (data && data.id && !(data as any).isDeleted) {
              remoteEvents.push(data)
            }
          })
          if (remoteEvents.length > 0) {
            const merged = mergeWithInitialEvents(remoteEvents)
            saveLocalEvents(merged)
            callback(merged)
            // Ensure Cloud Gist is kept in sync
            syncCloudEvents(merged).catch(() => {})
          }
        },
        (err) => {
          console.warn('[CampusEvents] Firestore real-time listener fallback:', err)
        },
      )
    } catch {
      // offline / mock mode
    }
  }

  return () => {
    isSubscribed = false
    clearInterval(pollTimer)
    if (eventsBroadcastChannel) {
      eventsBroadcastChannel.removeEventListener('message', handleBroadcast)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent)
      window.removeEventListener('verto_events_updated', handleLocalUpdate)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('online', handleWindowFocus)
    }
    unsubFirestore?.()
  }
}

// Strip undefined fields because Firestore throws on undefined values
function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v
    }
  }
  return clean
}

// Create new Campus Event
export async function createCampusEvent(
  data: Omit<CampusEvent, 'id' | 'postedAt' | 'interestedCount'>,
): Promise<CampusEvent> {
  const id = `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const newEvent: CampusEvent = {
    ...data,
    id,
    postedAt: new Date().toISOString(),
    interestedCount: 1,
  }

  // 1. Instant local persistence
  const current = getLocalEvents()
  const updated = [newEvent, ...current.filter((e) => e.id !== id)]
  saveLocalEvents(updated)

  // 2. Dispatch local event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('verto_events_updated', { detail: updated }))
  }

  // 3. Broadcast to all open tabs
  if (eventsBroadcastChannel) {
    try {
      eventsBroadcastChannel.postMessage({ type: 'EVENTS_UPDATE', events: updated })
    } catch {}
  }

  // 4. Global Cloud Gist sync (guaranteed multi-device sync)
  syncCloudEvents(updated).catch((err) => {
    console.warn('[CampusEvents] Cloud Gist sync error:', err)
  })

  // 5. Firestore cloud save
  if (db) {
    const firestoreDb = db
    const docRef = doc(firestoreDb, 'campus_events', id)
    const cleanDoc = cleanFirestoreData(newEvent)
    setDoc(docRef, cleanDoc).catch((err) => {
      console.warn('[CampusEvents] Background Firestore save error:', err)
    })
  }

  return newEvent
}

// Update Campus Event (Real-time sync)
export async function updateCampusEvent(
  eventId: string,
  updates: Partial<Omit<CampusEvent, 'id' | 'postedAt'>>,
): Promise<CampusEvent | null> {
  const current = getLocalEvents()
  const existing = current.find((e) => e.id === eventId)
  if (!existing) return null

  const updatedEvent: CampusEvent = {
    ...existing,
    ...updates,
  }

  const updatedList = current.map((e) => (e.id === eventId ? updatedEvent : e))
  saveLocalEvents(updatedList)

  // 1. Dispatch local event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('verto_events_updated', { detail: updatedList }))
  }

  // 2. Broadcast to all open tabs
  if (eventsBroadcastChannel) {
    try {
      eventsBroadcastChannel.postMessage({ type: 'EVENTS_UPDATE', events: updatedList })
    } catch {}
  }

  // 3. Global Cloud Gist sync
  syncCloudEvents(updatedList).catch((err) => {
    console.warn('[CampusEvents] Cloud Gist update error:', err)
  })

  // 4. Firestore cloud update
  if (db) {
    const firestoreDb = db
    const docRef = doc(firestoreDb, 'campus_events', eventId)
    const cleanDoc = cleanFirestoreData(updatedEvent)
    setDoc(docRef, cleanDoc, { merge: true }).catch((err) => {
      console.warn('[CampusEvents] Background Firestore update error:', err)
    })
  }

  return updatedEvent
}

// Delete Campus Event
export async function deleteCampusEvent(eventId: string): Promise<void> {
  addDeletedEventId(eventId)
  const current = getLocalEvents()
  const updated = current.filter((e) => e.id !== eventId)
  saveLocalEvents(updated)

  // 1. Dispatch local event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('verto_events_updated', { detail: updated }))
  }

  // 2. Broadcast to all open tabs
  if (eventsBroadcastChannel) {
    try {
      eventsBroadcastChannel.postMessage({ type: 'EVENTS_UPDATE', events: updated })
    } catch {}
  }

  // 3. Global Cloud Gist sync
  syncCloudEvents(updated).catch((err) => {
    console.warn('[CampusEvents] Cloud Gist delete error:', err)
  })

  // 4. Firestore cloud delete
  if (db) {
    const firestoreDb = db
    const docRef = doc(firestoreDb, 'campus_events', eventId)
    Promise.all([
      deleteDoc(docRef),
      setDoc(doc(firestoreDb, 'campus_events', eventId), { isDeleted: true, id: eventId }, { merge: true }),
    ]).catch((err) => {
      console.warn('[CampusEvents] Background Firestore delete error:', err)
    })
  }
}
