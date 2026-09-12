import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
const DURATION_MS = 650
const AUTO_SWITCH_INTERVAL_MS = 3000
const USER_PAUSE_DURATION_MS = 20000

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")"

type Role = 'center' | 'left' | 'right' | 'back'

const SLIDES = [
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png',
    bg: '#F4845F',
    panel: '#F79B7F',
    tab: 'Navigation',
    ghost: 'NAVIGATE',
    title: 'CAMPUS NAVIGATION',
    copy: 'LPU is huge. Pin blocks, hostels, labs, and gates so you can move between classes without getting turned around.',
    cta: 'OPEN MAP',
    href: '#navigation',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png',
    bg: '#6BBF7A',
    panel: '#85CC92',
    tab: 'Campus Events',
    ghost: 'EVENTS',
    title: 'CAMPUS EVENTS',
    copy: 'Clubs, fests, workshops, and talks that actually match your course and interests — not a buried notice-board dump.',
    cta: "SEE WHAT'S ON",
    href: '#events',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png',
    bg: '#E882B4',
    panel: '#ED9DC4',
    tab: 'Lost & Found',
    ghost: 'FOUND',
    title: 'LOST AND FOUND',
    copy: 'ID cards, bottles, chargers, and bags go missing every day. Post a find or claim an item before it leaves the campus loop.',
    cta: 'REPORT ITEM',
    href: '#lost-and-found',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
    tab: 'Spots',
    ghost: 'SPOTS',
    title: 'STUDENT SPOTS',
    copy: 'Need a quiet spot, a cafe, or a place to sit between lectures? See all verified student plazas, study zones, and hangout spots on campus.',
    cta: 'EXPLORE SPOTS',
    href: '#navigation?category=student_spot',
  },
] as const

function roleFor(index: number, activeIndex: number): Role {
  if (index === activeIndex) return 'center'
  if (index === (activeIndex + 3) % 4) return 'left'
  if (index === (activeIndex + 1) % 4) return 'right'
  return 'back'
}

function itemStyle(role: Role, isMobile: boolean): CSSProperties {
  const shared: CSSProperties = {
    position: 'absolute',
    aspectRatio: '0.6 / 1',
    willChange: 'transform, filter, opacity',
    transition: `transform ${DURATION_MS}ms ${EASE}, filter ${DURATION_MS}ms ${EASE}, opacity ${DURATION_MS}ms ${EASE}, left ${DURATION_MS}ms ${EASE}`,
  }

  if (role === 'center') {
    return {
      ...shared,
      transform: `translateX(-50%) scale(${isMobile ? 1.2 : 1.68})`,
      filter: 'blur(0px)',
      opacity: 1,
      zIndex: 20,
      left: '50%',
      height: isMobile ? '64%' : '92%',
      bottom: isMobile ? '12%' : 0,
    }
  }

  if (role === 'left') {
    return {
      ...shared,
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(2px)',
      opacity: isMobile ? 0.6 : 0.85,
      zIndex: 10,
      left: isMobile ? '14%' : '30%',
      height: isMobile ? '18%' : '28%',
      bottom: isMobile ? '22%' : '12%',
    }
  }

  if (role === 'right') {
    return {
      ...shared,
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(2px)',
      opacity: isMobile ? 0.6 : 0.85,
      zIndex: 10,
      left: isMobile ? '86%' : '70%',
      height: isMobile ? '18%' : '28%',
      bottom: isMobile ? '22%' : '12%',
    }
  }

  return {
    ...shared,
    transform: 'translateX(-50%) scale(1)',
    filter: 'blur(4px)',
    opacity: 1,
    zIndex: 5,
    left: '50%',
    height: isMobile ? '14%' : '22%',
    bottom: isMobile ? '22%' : '12%',
  }
}

interface CampusHeroProps {
  onOpenNavigator?: (category?: string) => void
  onOpenLostAndFound?: () => void
}

export default function CampusHero({
  onOpenNavigator,
  onOpenLostAndFound,
}: CampusHeroProps = {}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  )
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)

  const autoTimerRef = useRef<number | null>(null)
  const userPauseTimerRef = useRef<number | null>(null)

  const startAutoSwitch = useCallback(() => {
    if (autoTimerRef.current) window.clearInterval(autoTimerRef.current)
    autoTimerRef.current = window.setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % SLIDES.length
        setIsAnimating(true)
        window.setTimeout(() => setIsAnimating(false), DURATION_MS)
        return next
      })
    }, AUTO_SWITCH_INTERVAL_MS)
  }, [])

  const handleUserActivity = useCallback(() => {
    if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current)
      autoTimerRef.current = null
    }
    if (userPauseTimerRef.current) {
      window.clearTimeout(userPauseTimerRef.current)
    }
    userPauseTimerRef.current = window.setTimeout(() => {
      startAutoSwitch()
    }, USER_PAUSE_DURATION_MS)
  }, [startAutoSwitch])

  useEffect(() => {
    startAutoSwitch()
    return () => {
      if (autoTimerRef.current) window.clearInterval(autoTimerRef.current)
      if (userPauseTimerRef.current) window.clearTimeout(userPauseTimerRef.current)
    }
  }, [startAutoSwitch])

  useEffect(() => {
    SLIDES.forEach((slide) => {
      const img = new Image()
      img.src = slide.src
    })
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const goTo = useCallback(
    (nextIndex: number, isUser = true) => {
      if (isUser) {
        handleUserActivity()
      }
      if (isAnimating || nextIndex === activeIndex) return
      setIsAnimating(true)
      setActiveIndex(nextIndex)
      window.setTimeout(() => setIsAnimating(false), DURATION_MS)
    },
    [activeIndex, isAnimating, handleUserActivity],
  )

  const navigate = useCallback(
    (dir: 'next' | 'prev') => {
      if (isAnimating) return
      goTo(dir === 'next' ? (activeIndex + 1) % 4 : (activeIndex + 3) % 4, true)
    },
    [activeIndex, goTo, isAnimating],
  )

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX)
    setTouchStartY(e.touches[0].clientY)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return
    const deltaX = touchStartX - e.changedTouches[0].clientX
    const deltaY = touchStartY - e.changedTouches[0].clientY
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      handleUserActivity()
      if (deltaX > 0) {
        navigate('next')
      } else {
        navigate('prev')
      }
    }
    setTouchStartX(null)
    setTouchStartY(null)
  }

  const active = SLIDES[activeIndex]

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      onClick={handleUserActivity}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        backgroundColor: active.bg,
        transition: `background-color ${DURATION_MS}ms ${EASE}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ height: '100dvh', minHeight: '520px' }}
      >
        <div
          className="grain-overlay pointer-events-none absolute inset-0"
          style={{
            zIndex: 50,
            opacity: 0.4,
            backgroundImage: GRAIN,
            backgroundSize: '200px 200px',
            backgroundRepeat: 'repeat',
          }}
        />

        {/* Top Header & Navigation Tabs */}
        <div className="absolute top-3 inset-x-3 z-[60] flex flex-col sm:top-6 sm:left-8 sm:inset-x-auto sm:w-auto">
          {/* Top Bar on Mobile: Brand on Left, LPU Logo on Right */}
          <div className="flex items-center justify-between w-full sm:block">
            <p
              className="text-xs font-bold uppercase tracking-[0.18em] text-white/95 sm:text-xs"
            >
              Verto Omniroute
            </p>

            {/* Mobile LPU Logo */}
            <div className="flex sm:hidden h-10 w-10 items-center justify-center rounded-full bg-white p-0.5 shadow-md ring-2 ring-white/60">
              <img
                src="/lpu-logo.png"
                alt="Lovely Professional University"
                className="h-full w-full rounded-full object-contain"
                draggable={false}
              />
            </div>
          </div>

          {/* Navigation Tabs: 2x2 grid on mobile so all 4 tabs are fully visible, uniform vertical stack on desktop */}
          <nav
            className="mt-2 grid grid-cols-2 gap-1.5 w-full max-w-[340px] sm:mt-4 sm:flex sm:flex-col sm:w-40 sm:gap-2.5 sm:max-w-none"
            aria-label="Campus demos"
          >
            {SLIDES.map((slide, i) => {
              const selected = i === activeIndex
              return (
                <button
                  key={slide.tab}
                  type="button"
                  onClick={() => {
                    if (slide.tab === 'Spots' && onOpenNavigator) {
                      onOpenNavigator('student_spot')
                    } else if (slide.tab === 'Lost & Found' && onOpenLostAndFound) {
                      onOpenLostAndFound()
                    } else if (selected && slide.tab === 'Navigation' && onOpenNavigator) {
                      onOpenNavigator()
                    } else {
                      goTo(i)
                    }
                  }}
                  className="flex w-full items-center justify-center rounded-full px-2 py-1.5 text-center text-[10px] font-semibold tracking-wider uppercase sm:px-4 sm:py-2 sm:text-xs cursor-pointer transition-all duration-200"
                  style={{
                    color: '#fff',
                    border: '1.5px solid rgba(255,255,255,0.85)',
                    backgroundColor: selected ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)',
                    boxShadow: selected ? '0 2px 10px rgba(0,0,0,0.12)' : 'none',
                    backdropFilter: 'blur(4px)',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.18)'
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'
                  }}
                >
                  {slide.tab}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Desktop LPU Logo in top right circle */}
        <div
          className="hidden sm:flex absolute top-6 right-8 z-[60] items-center justify-center"
          style={{ zIndex: 60 }}
        >
          <div className="flex h-16 w-16 md:h-18 md:w-18 items-center justify-center rounded-full bg-white p-1 shadow-lg ring-2 ring-white/60 transition-transform duration-300 hover:scale-105">
            <img
              src="/lpu-logo.png"
              alt="Lovely Professional University"
              className="h-full w-full rounded-full object-contain"
              draggable={false}
            />
          </div>
        </div>

        {/* Top background text: Verto OmniRoute */}
        <div
          className="pointer-events-none absolute inset-x-0 flex select-none items-center justify-center px-3"
          style={{
            zIndex: 2,
            top: isMobile ? '20%' : '12%',
          }}
        >
          <span
            className="uppercase text-center leading-none"
            style={{
              fontFamily: 'Anton, sans-serif',
              fontSize: 'clamp(28px, 6.8vw, 130px)',
              fontWeight: 900,
              color: '#0e0d0dff',
              opacity: 0.95,
              lineHeight: 1,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              textShadow: '0 4px 28px rgba(0, 0, 0, 0.08)',
            }}
          >
            Verto OmniRoute
          </span>
        </div>

        {/* Current background texts shifted to right side (red rectangle area) */}
        <div
          className="pointer-events-none absolute right-3 sm:right-8 md:right-14 select-none"
          style={{
            zIndex: 25,
            top: isMobile ? '38%' : '44%',
            transform: 'translateY(-50%)',
          }}
        >
          <div className="relative flex min-h-[40px] sm:min-h-[90px] items-center justify-end">
            {SLIDES.map((slide, i) => (
              <span
                key={slide.ghost}
                className="absolute right-0 uppercase"
                style={{
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 'clamp(28px, 5.5vw, 76px)',
                  fontWeight: 900,
                  color: '#ffffff',
                  opacity: i === activeIndex ? (isMobile ? 0.4 : 1) : 0,
                  transform: i === activeIndex ? 'translateX(0)' : 'translateX(20px)',
                  lineHeight: 1,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  textShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
                  transition: `opacity ${DURATION_MS}ms ${EASE}, transform ${DURATION_MS}ms ${EASE}`,
                }}
              >
                {slide.ghost}
              </span>
            ))}
          </div>
        </div>

        {/* 3D Character Stage */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
          {SLIDES.map((slide, i) => (
            <div key={slide.src} style={itemStyle(roleFor(i, activeIndex), isMobile)}>
              <img
                src={slide.src}
                alt={slide.title}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'bottom center',
                }}
              />
            </div>
          ))}
        </div>

        {/* Bottom Left: Title, description & navigation arrows */}
        <div
          className="absolute bottom-4 left-3 z-[60] sm:bottom-12 sm:left-8 md:left-10"
          style={{ maxWidth: isMobile ? '210px' : '280px' }}
        >
          <p
            className="mb-1 text-sm font-bold uppercase tracking-wider text-white sm:mb-3 sm:text-[22px]"
          >
            {active.title}
          </p>
          <p
            className="mb-3 hidden text-xs text-white/85 sm:mb-5 sm:block sm:text-sm sm:leading-relaxed"
          >
            {active.copy}
          </p>
          <div className="flex gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => navigate('prev')}
              className="flex h-10 w-10 items-center justify-center rounded-full sm:h-14 sm:w-14 cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: '2px solid #fff',
                color: '#fff',
                transition: 'transform 150ms, background-color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ArrowLeft className="h-4 w-4 sm:h-6 sm:w-6" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => navigate('next')}
              className="flex h-10 w-10 items-center justify-center rounded-full sm:h-14 sm:w-14 cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: '2px solid #fff',
                color: '#fff',
                transition: 'transform 150ms, background-color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ArrowRight className="h-4 w-4 sm:h-6 sm:w-6" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Bottom Right: CTA link */}
        <a
          href={active.href}
          onClick={(e) => {
            if (active.tab === 'Spots' && onOpenNavigator) {
              e.preventDefault()
              onOpenNavigator('student_spot')
            } else if (active.tab === 'Lost & Found' && onOpenLostAndFound) {
              e.preventDefault()
              onOpenLostAndFound()
            } else if (active.tab === 'Navigation' && onOpenNavigator) {
              e.preventDefault()
              onOpenNavigator()
            }
          }}
          className="absolute right-4 bottom-5 sm:right-10 sm:bottom-16 z-[60] flex items-center no-underline cursor-pointer"
          style={{
            fontFamily: 'Anton, sans-serif',
            fontSize: 'clamp(18px, 3.8vw, 54px)',
            fontWeight: 400,
            color: '#fff',
            opacity: 0.95,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            textTransform: 'uppercase',
            transition: 'opacity 200ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.95'
          }}
        >
          {active.cta}
          <ArrowRight className="ml-1.5 h-4 w-4 sm:ml-2 sm:h-7 sm:w-7" strokeWidth={2.25} />
        </a>
      </div>
    </div>
  )
}
