import { useState, useEffect } from 'react'
import CampusHero from './CampusHero'
import CampusNavigator from './components/CampusNavigator'
import LostAndFoundHub from './components/LostAndFoundHub'

function App() {
  const [currentView, setCurrentView] = useState<'hero' | 'navigator' | 'lost-and-found'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.startsWith('#navigation')) return 'navigator'
      if (hash.startsWith('#lost-and-found')) return 'lost-and-found'
    }
    return 'hero'
  })

  const [initialCategory, setInitialCategory] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('student_spot') || hash.includes('spots')) return 'student_spot'
    }
    return 'all'
  })

  const [meetingLocationFocus, setMeetingLocationFocus] = useState<{
    lng: number
    lat: number
    label?: string
  } | null>(null)

  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.startsWith('#navigation')) {
        if (hash.includes('student_spot') || hash.includes('spots')) {
          setInitialCategory('student_spot')
        }
        setCurrentView('navigator')
      } else if (hash.startsWith('#lost-and-found')) {
        setCurrentView('lost-and-found')
      } else if (hash === '#hero' || !hash) {
        setCurrentView('hero')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleOpenNavigator = (
    category?: string,
    locationFocus?: { lng: number; lat: number; label?: string }
  ) => {
    if (locationFocus) {
      setMeetingLocationFocus(locationFocus)
      window.location.hash = `#navigation?lat=${locationFocus.lat}&lng=${locationFocus.lng}&label=${encodeURIComponent(
        locationFocus.label || 'Meeting Point'
      )}`
    } else if (category) {
      setInitialCategory(category)
      setMeetingLocationFocus(null)
      window.location.hash = `#navigation?category=${category}`
    } else {
      setInitialCategory('all')
      setMeetingLocationFocus(null)
      window.location.hash = '#navigation'
    }

    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('navigator')
      setIsTransitioning(false)
    }, 200)
  }

  const handleOpenLostAndFound = () => {
    window.location.hash = '#lost-and-found'
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('lost-and-found')
      setIsTransitioning(false)
    }, 200)
  }

  const handleBackToHome = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('hero')
      window.location.hash = ''
      setInitialCategory('all')
      setMeetingLocationFocus(null)
      setIsTransitioning(false)
    }, 200)
  }

  const handleBackToLostFound = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('lost-and-found')
      window.location.hash = '#lost-and-found'
      setIsTransitioning(false)
    }, 200)
  }

  return (
    <div className="relative w-full h-screen min-h-screen bg-[#070b14] overflow-hidden text-white">
      <div
        className={`w-full h-full transition-opacity duration-300 ease-in-out ${
          isTransitioning ? 'opacity-0 pointer-events-none scale-[0.99]' : 'opacity-100 scale-100'
        }`}
      >
        {currentView === 'hero' ? (
          <CampusHero
            onOpenNavigator={handleOpenNavigator}
            onOpenLostAndFound={handleOpenLostAndFound}
          />
        ) : currentView === 'lost-and-found' ? (
          <LostAndFoundHub
            onBackToHome={handleBackToHome}
            onOpenMap={(loc) => handleOpenNavigator(undefined, loc)}
          />
        ) : (
          <CampusNavigator
            onBackToHome={handleBackToHome}
            initialCategory={initialCategory}
            initialLocationFocus={meetingLocationFocus}
            onBackToLostFound={handleBackToLostFound}
          />
        )}
      </div>
    </div>
  )
}

export default App
