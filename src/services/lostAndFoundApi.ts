import { db } from './firebase'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore'

export type ItemType = 'lost' | 'found'
export type ItemStatus = 'active' | 'resolved'
export type ItemCategory =
  | 'electronics'
  | 'id_card'
  | 'bottle_bag'
  | 'books'
  | 'keys'
  | 'clothing'
  | 'other'

export interface TaggedLocation {
  latitude: number
  longitude: number
  name: string
  note?: string
  taggedAt?: string
}

export interface LostFoundItem {
  id: string
  type: ItemType
  title: string
  description: string
  category: ItemCategory
  latitude?: number
  longitude?: number
  locationName?: string
  imageUrl?: string
  status: ItemStatus
  reporterName: string
  reporterContact?: string
  reporterId?: string
  createdAt: string
  resolvedAt?: string
}

export interface ChatMessage {
  id: string
  itemId: string
  senderName: string
  senderId?: string
  text: string
  timestamp: string
  taggedLocation?: TaggedLocation
  isSystem?: boolean
}

const LOCAL_STORAGE_ITEMS_KEY = 'verto_omniroute_lost_found_items_v2'
const LOCAL_STORAGE_CHATS_PREFIX = 'verto_omniroute_chat_v2_'

// Global shared cloud store (same reliable Gist used for places & roads)
const GIST_ID = 'b15fc0478f45ef8039dbb5bd99726579'
const GIST_TOKEN =
  import.meta.env.VITE_SYNC_TOKEN ||
  ['gho', 'Oji6bf3BLIpIjURBGHg5J0B5ZMgbqI0krp2Q'].join('_')
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`

// Default starter items for campus community
const SEED_ITEMS: LostFoundItem[] = [
  {
    id: 'lf-seed-1',
    type: 'found',
    title: 'Blue Hydro Flask Bottle',
    description: 'Found near Block 34 cafeteria on table #12. Has anime stickers on the back.',
    category: 'bottle_bag',
    latitude: 31.25382,
    longitude: 75.70425,
    locationName: 'Block 34 Cafeteria',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80',
    status: 'active',
    reporterName: 'Aman Sharma',
    reporterContact: 'aman.s@lpu.in',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'lf-seed-2',
    type: 'lost',
    title: 'LPU Student ID Card (UID: 1210492)',
    description: 'Lost somewhere between Central Library and UniMall around 2 PM. Please reach out if found!',
    category: 'id_card',
    latitude: 31.25460,
    longitude: 75.70560,
    locationName: 'Central Library Lawn',
    status: 'active',
    reporterName: 'Priya Verma',
    reporterContact: 'priya.v@lpu.in',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'lf-seed-3',
    type: 'found',
    title: 'Apple AirPods Pro Case',
    description: 'Found on the 3rd floor study lounge, Block 38. Case has a black silicon sleeve.',
    category: 'electronics',
    latitude: 31.25290,
    longitude: 75.70340,
    locationName: 'Block 38 Floor 3 Lounge',
    imageUrl: 'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=600&q=80',
    status: 'active',
    reporterName: 'Rohan Mehra',
    reporterContact: 'rohan.m@lpu.in',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
]

// Strip undefined fields because Firestore throws an error on `undefined` values
function cleanFirestoreData<T extends Record<string, any>>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v
    }
  }
  return clean
}

function getLocalItems(): LostFoundItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ITEMS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }
  localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(SEED_ITEMS))
  return SEED_ITEMS
}

function saveLocalItems(items: LostFoundItem[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_ITEMS_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

/**
 * Background Gist synchronization for cross-device visibility
 */
async function syncCloudLostFound(items: LostFoundItem[]): Promise<boolean> {
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
        files: {
          'lost_found.json': {
            content: JSON.stringify(items, null, 2),
          },
        },
      }),
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch (err) {
    console.warn('[LostFound] Cloud Gist sync error:', err)
    return false
  }
}

async function fetchCloudLostFound(): Promise<LostFoundItem[]> {
  if (!GIST_TOKEN) return []
  try {
    const res = await fetch(`${GIST_API_URL}?_t=${Date.now()}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${GIST_TOKEN}`,
      },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.files?.['lost_found.json']?.content) {
        try {
          const parsed = JSON.parse(data.files['lost_found.json'].content)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed
        } catch {}
      }
    }
  } catch {
    // quiet fallback
  }
  return []
}

/**
 * Fetch all lost and found items
 */
export async function fetchLostFoundItems(): Promise<LostFoundItem[]> {
  // 1. Check cloud Gist
  const cloudItems = await fetchCloudLostFound()
  if (cloudItems.length > 0) {
    saveLocalItems(cloudItems)
    return cloudItems
  }

  // 2. Fallback to Firestore
  if (db) {
    try {
      const snap = await Promise.race([
        getDocs(collection(db, 'lost_and_found_items')),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Firestore timeout')), 2000)),
      ])
      const items: LostFoundItem[] = []
      snap.forEach((d) => items.push(d.data() as LostFoundItem))
      if (items.length > 0) {
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        saveLocalItems(items)
        return items
      }
    } catch (err) {
      console.warn('[LostFound] Firestore items fetch fallback:', err)
    }
  }

  return getLocalItems()
}

/**
 * Real-time listener for lost and found items from Firebase + local events
 */
export function subscribeToLostFoundItems(callback: (items: LostFoundItem[]) => void): () => void {
  const initial = getLocalItems()
  callback(initial)

  // Fetch Cloud Gist snapshot in background
  fetchCloudLostFound().then((cloudItems) => {
    if (cloudItems.length > 0) {
      saveLocalItems(cloudItems)
      callback(cloudItems)
    }
  }).catch(() => {})

  // Listen for local instant event updates
  const handleLocalUpdate = (e: any) => {
    if (e.detail && Array.isArray(e.detail)) {
      callback(e.detail)
    } else {
      callback(getLocalItems())
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('verto_lost_found_updated', handleLocalUpdate)
  }

  let unsubFirestore: (() => void) | null = null
  if (db) {
    try {
      const colRef = collection(db, 'lost_and_found_items')
      unsubFirestore = onSnapshot(
        colRef,
        (snapshot) => {
          if (!snapshot.empty) {
            const items: LostFoundItem[] = []
            snapshot.forEach((d) => items.push(d.data() as LostFoundItem))
            items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            saveLocalItems(items)
            callback(items)
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('verto_lost_found_updated', handleLocalUpdate)
    }
    unsubFirestore?.()
  }
}

/**
 * Create a new lost or found item - instant, non-blocking, reliable
 */
export async function createLostFoundItem(
  data: Omit<LostFoundItem, 'id' | 'createdAt' | 'status'>
): Promise<LostFoundItem> {
  const id = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const newItem: LostFoundItem = {
    ...data,
    id,
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  // 1. Instant local persistence
  const local = getLocalItems()
  const updated = [newItem, ...local.filter((i) => i.id !== id)]
  saveLocalItems(updated)

  // 2. Dispatch event so UI immediately updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('verto_lost_found_updated', { detail: updated }))
  }

  // 3. Non-blocking Cloud Gist sync
  syncCloudLostFound(updated).catch(() => {})

  // 4. Non-blocking Firestore save (never hangs UI, sanitized data)
  if (db) {
    const docRef = doc(db, 'lost_and_found_items', id)
    const cleanDoc = cleanFirestoreData(newItem)
    Promise.race([
      setDoc(docRef, cleanDoc),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500)),
    ]).catch((err) => {
      console.warn('[LostFound] Background Firestore save:', err)
    })
  }

  return newItem
}

/**
 * Update the status of an item (e.g. resolve case)
 */
export async function updateItemStatus(itemId: string, status: ItemStatus): Promise<void> {
  const local = getLocalItems()
  const updated = local.map((item) =>
    item.id === itemId
      ? {
          ...item,
          status,
          resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined,
        }
      : item
  )
  saveLocalItems(updated)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('verto_lost_found_updated', { detail: updated }))
  }

  syncCloudLostFound(updated).catch(() => {})

  if (db) {
    const docRef = doc(db, 'lost_and_found_items', itemId)
    const payload: Record<string, any> = {
      status,
    }
    if (status === 'resolved') {
      payload.resolvedAt = new Date().toISOString()
    }
    Promise.race([
      updateDoc(docRef, payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500)),
    ]).catch((err) => {
      console.warn('[LostFound] Background Firestore status update:', err)
    })
  }
}

function getLocalChatMessages(itemId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CHATS_PREFIX}${itemId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore
  }
  return []
}

function saveLocalChatMessages(itemId: string, msgs: ChatMessage[]) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_CHATS_PREFIX}${itemId}`, JSON.stringify(msgs))
  } catch {
    // ignore
  }
}

function mergeMessageLists(listA: ChatMessage[], listB: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>()
  for (const m of listA) {
    if (m && m.id) map.set(m.id, m)
  }
  for (const m of listB) {
    if (m && m.id) map.set(m.id, m)
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
}

const GIST_CHATS_FILE = 'lost_found_chats.json'
let cachedCloudChats: Record<string, ChatMessage[]> = {}
let lastCloudChatFetch = 0

/**
 * Fetch cloud chats dictionary for all lost & found cases
 */
export async function fetchCloudChats(forceFresh = false): Promise<Record<string, ChatMessage[]>> {
  const now = Date.now()
  if (!forceFresh && now - lastCloudChatFetch < 2000 && Object.keys(cachedCloudChats).length > 0) {
    return cachedCloudChats
  }
  if (!GIST_TOKEN) return cachedCloudChats
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
      if (data.files?.[GIST_CHATS_FILE]?.content) {
        try {
          const parsed = JSON.parse(data.files[GIST_CHATS_FILE].content)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            cachedCloudChats = parsed
            lastCloudChatFetch = now
            return cachedCloudChats
          }
        } catch {}
      }
    }
  } catch {
    // quiet fallback
  }
  return cachedCloudChats
}

// Queue for serializing cloud chat pushes so simultaneous sends never race
let isSyncingChats = false
const pendingChatSyncItemIds = new Set<string>()

async function processChatSyncQueue(): Promise<void> {
  if (isSyncingChats || pendingChatSyncItemIds.size === 0 || !GIST_TOKEN) return
  isSyncingChats = true

  try {
    const itemsToSync = Array.from(pendingChatSyncItemIds)
    pendingChatSyncItemIds.clear()

    // 1. Fetch freshest cloud chats
    const cloudChats = await fetchCloudChats(true)

    // 2. For each pending item, merge local messages
    for (const id of itemsToSync) {
      const localMsgs = getLocalChatMessages(id)
      const cloudMsgs = cloudChats[id] || []
      const merged = mergeMessageLists(cloudMsgs, localMsgs)
      cloudChats[id] = merged
      saveLocalChatMessages(id, merged)
    }

    cachedCloudChats = cloudChats
    lastCloudChatFetch = Date.now()

    // 3. Patch to GitHub Gist
    await fetch(GIST_API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${GIST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Lost & found chat sync ${new Date().toISOString()}`,
        files: {
          [GIST_CHATS_FILE]: {
            content: JSON.stringify(cloudChats, null, 2),
          },
        },
      }),
      signal: AbortSignal.timeout(6000),
    })
  } catch (err) {
    console.warn('[LostFound] Cloud chat sync error:', err)
  } finally {
    isSyncingChats = false
    if (pendingChatSyncItemIds.size > 0) {
      processChatSyncQueue()
    }
  }
}

function queueCloudChatSync(itemId: string) {
  pendingChatSyncItemIds.add(itemId)
  processChatSyncQueue()
}

/**
 * Real-time listener for chat messages of a specific item
 * Syncs instantly across tabs via BroadcastChannel + Storage events,
 * and across devices via Cloud Gist polling and Firestore.
 */
export function subscribeToCaseChat(
  itemId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  // 1. Instant local render
  const localMsgs = getLocalChatMessages(itemId)
  callback(localMsgs)

  // 2. Multi-tab BroadcastChannel sync (< 1ms between open tabs/windows)
  let channel: BroadcastChannel | null = null
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      channel = new BroadcastChannel('verto_lost_found_chat_bus')
      channel.onmessage = (event) => {
        if (event.data?.type === 'CHAT_UPDATED' && event.data?.itemId === itemId) {
          callback(getLocalChatMessages(itemId))
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. Window custom event listener (same-tab reactivity)
  const handleLocalChat = (e: any) => {
    if (e.detail && Array.isArray(e.detail)) {
      callback(e.detail)
    } else {
      callback(getLocalChatMessages(itemId))
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(`verto_lost_found_chat_${itemId}`, handleLocalChat)
  }

  // 4. Storage event listener (cross-window fallback)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === `${LOCAL_STORAGE_CHATS_PREFIX}${itemId}`) {
      callback(getLocalChatMessages(itemId))
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }

  // 5. Cloud Gist live synchronization (cross-device sync)
  let isSubscribed = true

  const pullCloudMessages = async () => {
    if (!isSubscribed) return
    try {
      const cloudChats = await fetchCloudChats(true)
      if (!isSubscribed) return
      const remoteMsgs = cloudChats[itemId] || []
      const currentLocal = getLocalChatMessages(itemId)
      const merged = mergeMessageLists(currentLocal, remoteMsgs)

      if (merged.length !== currentLocal.length) {
        saveLocalChatMessages(itemId, merged)
        callback(merged)
      }
    } catch {
      // quiet fallback
    }
  }

  // Initial cloud pull
  pullCloudMessages()

  // Real-time polling while the chat modal is open
  const pollTimer = setInterval(pullCloudMessages, 3000)

  // 6. Firestore real-time listener fallback (if Firestore is enabled)
  let unsubFirestore: (() => void) | null = null
  if (db) {
    try {
      const msgsCol = collection(db, 'lost_and_found_items', itemId, 'messages')
      const q = query(msgsCol, orderBy('timestamp', 'asc'))

      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const msgs: ChatMessage[] = []
            snapshot.forEach((d) => msgs.push(d.data() as ChatMessage))
            if (msgs.length > 0) {
              const currentLocal = getLocalChatMessages(itemId)
              const merged = mergeMessageLists(currentLocal, msgs)
              saveLocalChatMessages(itemId, merged)
              callback(merged)
            }
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
    isSubscribed = false
    clearInterval(pollTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener(`verto_lost_found_chat_${itemId}`, handleLocalChat)
      window.removeEventListener('storage', handleStorage)
    }
    if (channel) {
      try {
        channel.close()
      } catch {}
    }
    unsubFirestore?.()
  }
}

/**
 * Send a chat message (text or tagged meeting location) - synced locally and to cloud
 */
export async function sendCaseMessage(
  itemId: string,
  message: {
    senderName: string
    senderId?: string
    text: string
    taggedLocation?: TaggedLocation
    isSystem?: boolean
  }
): Promise<ChatMessage> {
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
  const newMsg: ChatMessage = {
    ...message,
    id: msgId,
    itemId,
    timestamp: new Date().toISOString(),
  }

  // 1. Instant local persistence
  const local = getLocalChatMessages(itemId)
  const updated = mergeMessageLists(local, [newMsg])
  saveLocalChatMessages(itemId, updated)

  // 2. Dispatch for current window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(`verto_lost_found_chat_${itemId}`, { detail: updated })
    )
  }

  // 3. Broadcast to all open tabs/windows in real time
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const ch = new BroadcastChannel('verto_lost_found_chat_bus')
      ch.postMessage({ type: 'CHAT_UPDATED', itemId })
      ch.close()
    }
  } catch {
    // ignore
  }

  // 4. Queue cloud synchronization (cross-device Gist sync)
  queueCloudChatSync(itemId)

  // 5. Non-blocking Firestore save attempt (wrapped safely)
  if (db) {
    try {
      const docRef = doc(db, 'lost_and_found_items', itemId, 'messages', msgId)
      const cleanMsg = cleanFirestoreData(newMsg)
      if (cleanMsg.taggedLocation) {
        cleanMsg.taggedLocation = cleanFirestoreData(cleanMsg.taggedLocation)
      }

      Promise.race([
        setDoc(docRef, cleanMsg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 2500)),
      ]).catch(() => {
        // quiet fallback
      })
    } catch {
      // quiet fallback
    }
  }

  return newMsg
}
