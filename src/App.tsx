import { useState, useEffect } from 'react'
import CampusHero from './CampusHero'
import CampusNavigator from './components/CampusNavigator'

function App() {
  const [currentView, setCurrentView] = useState<'hero' | 'navigator'>(() => {
    return typeof window !== 'undefined' && window.location.hash.startsWith('#navigation')
      ? 'navigator'
      : 'hero'
  })
  const [initialCategory, setInitialCategory] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('student_spot') || hash.includes('spots')) return 'student_spot'
    }
    return 'all'
  })
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.startsWith('#navigation')) {
        if (hash.includes('student_spot') || hash.includes('spots')) {
          setInitialCategory('student_spot')
        }
        setCurrentView('navigator')
      } else if (hash === '#hero' || !hash) {
        setCurrentView('hero')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleOpenNavigator = (category?: string) => {
    if (category) {
      setInitialCategory(category)
      window.location.hash = `#navigation?category=${category}`
    } else {
      setInitialCategory('all')
      window.location.hash = '#navigation'
    }
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('navigator')
      setIsTransitioning(false)
    }, 250)
  }

  const handleBackToHome = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('hero')
      window.location.hash = ''
      setInitialCategory('all')
      setIsTransitioning(false)
    }, 250)
  }

  return (
    <div className="relative w-full h-screen min-h-screen bg-[#070b14] overflow-hidden text-white">
      <div
        className={`w-full h-full transition-opacity duration-300 ease-in-out ${
          isTransitioning ? 'opacity-0 pointer-events-none scale-[0.99]' : 'opacity-100 scale-100'
        }`}
      >
        {currentView === 'hero' ? (
          <CampusHero onOpenNavigator={handleOpenNavigator} />
        ) : (
          <CampusNavigator
            onBackToHome={handleBackToHome}
            initialCategory={initialCategory}
          />
        )}
      </div>
    </div>
  )
}

export default App
