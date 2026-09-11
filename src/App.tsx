import { useState, useEffect } from 'react'
import CampusHero from './CampusHero'
import CampusNavigator from './components/CampusNavigator'

function App() {
  const [currentView, setCurrentView] = useState<'hero' | 'navigator'>(() => {
    return typeof window !== 'undefined' && window.location.hash === '#navigation'
      ? 'navigator'
      : 'hero'
  })
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#navigation') {
        setCurrentView('navigator')
      } else if (window.location.hash === '#hero' || !window.location.hash) {
        setCurrentView('hero')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleOpenNavigator = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('navigator')
      window.location.hash = '#navigation'
      setIsTransitioning(false)
    }, 250)
  }

  const handleBackToHome = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentView('hero')
      window.location.hash = ''
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
          <CampusNavigator onBackToHome={handleBackToHome} />
        )}
      </div>
    </div>
  )
}

export default App
