import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
const DURATION_MS = 650

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
    tab: 'Events',
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
    tab: 'Spaces',
    ghost: 'SPACES',
    title: 'AVAILABLE SPACES',
    copy: 'Need a quiet classroom, a lab slot, or a place to sit between lectures? See which rooms and spots are free right now.',
    cta: 'FIND A SPOT',
    href: '#available-spaces',
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
      transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
      filter: 'blur(0px)',
      opacity: 1,
      zIndex: 20,
      left: '50%',
      height: isMobile ? '60%' : '92%',
      bottom: isMobile ? '22%' : 0,
    }
  }

  if (role === 'left') {
    return {
      ...shared,
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(2px)',
      opacity: 0.85,
      zIndex: 10,
      left: isMobile ? '20%' : '30%',
      height: isMobile ? '16%' : '28%',
      bottom: isMobile ? '32%' : '12%',
    }
  }

  if (role === 'right') {
    return {
      ...shared,
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(2px)',
      opacity: 0.85,
      zIndex: 10,
      left: isMobile ? '80%' : '70%',
      height: isMobile ? '16%' : '28%',
      bottom: isMobile ? '32%' : '12%',
    }
  }

  return {
    ...shared,
    transform: 'translateX(-50%) scale(1)',
    filter: 'blur(4px)',
    opacity: 1,
    zIndex: 5,
    left: '50%',
    height: isMobile ? '13%' : '22%',
    bottom: isMobile ? '32%' : '12%',
  }
}

export default function CampusHero() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  )

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
    (nextIndex: number) => {
      if (isAnimating || nextIndex === activeIndex) return
      setIsAnimating(true)
      setActiveIndex(nextIndex)
      window.setTimeout(() => setIsAnimating(false), DURATION_MS)
    },
    [activeIndex, isAnimating],
  )

  const navigate = useCallback(
    (dir: 'next' | 'prev') => {
      if (isAnimating) return
      goTo(dir === 'next' ? (activeIndex + 1) % 4 : (activeIndex + 3) % 4)
    },
    [activeIndex, goTo, isAnimating],
  )

  const active = SLIDES[activeIndex]

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        backgroundColor: active.bg,
        transition: `background-color ${DURATION_MS}ms ${EASE}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div className="relative w-full" style={{ height: '100vh', overflow: 'hidden' }}>
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

        <div
          className="pointer-events-none absolute inset-x-0 flex select-none items-center justify-center"
          style={{ zIndex: 2, top: '18%' }}
        >
          {SLIDES.map((slide, i) => (
            <span
              key={slide.ghost}
              className="absolute uppercase"
              style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: 'clamp(90px, 28vw, 380px)',
                fontWeight: 900,
                color: '#fff',
                opacity: i === activeIndex ? 1 : 0,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                transition: `opacity ${DURATION_MS}ms ${EASE}`,
              }}
            >
              {slide.ghost}
            </span>
          ))}
        </div>

        <div
          className="absolute top-6 left-4 z-[60] sm:left-8"
          style={{ zIndex: 60 }}
        >
          <p
            className="text-xs font-semibold uppercase"
            style={{ color: '#fff', opacity: 0.9, letterSpacing: '0.18em' }}
          >
            CODEFLUX
          </p>
          <nav
            className="mt-3 grid w-max grid-cols-2 gap-1.5 sm:mt-4 sm:gap-2"
            aria-label="Campus demos"
          >
          {SLIDES.map((slide, i) => {
            const selected = i === activeIndex
            return (
              <button
                key={slide.tab}
                type="button"
                onClick={() => goTo(i)}
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase sm:px-3 sm:py-1.5 sm:text-xs"
                style={{
                  color: '#fff',
                  border: '1.5px solid rgba(255,255,255,0.85)',
                  backgroundColor: selected ? 'rgba(255,255,255,0.22)' : 'transparent',
                  transition: 'background-color 150ms, transform 150ms',
                }}
              >
                {slide.tab}
              </button>
            )
          })}
          </nav>
        </div>

        <div className="absolute inset-0" style={{ zIndex: 3 }}>
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

        <div
          className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24"
          style={{ zIndex: 60, maxWidth: 320 }}
        >
          <p
            className="mb-2 text-base font-bold uppercase sm:mb-3 sm:text-[22px]"
            style={{ color: '#fff', opacity: 0.95, letterSpacing: '0.02em' }}
          >
            {active.title}
          </p>
          <p
            className="mb-4 hidden text-xs sm:mb-5 sm:block sm:text-sm"
            style={{ color: '#fff', opacity: 0.85, lineHeight: 1.6 }}
          >
            {active.copy}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => navigate('prev')}
              className="flex h-12 w-12 items-center justify-center rounded-full sm:h-16 sm:w-16"
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
              <ArrowLeft size={26} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => navigate('next')}
              className="flex h-12 w-12 items-center justify-center rounded-full sm:h-16 sm:w-16"
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
              <ArrowRight size={26} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <a
          href={active.href}
          className="absolute right-4 bottom-6 flex items-center no-underline sm:right-10 sm:bottom-20"
          style={{
            zIndex: 60,
            fontFamily: 'Anton, sans-serif',
            fontSize: 'clamp(20px, 4vw, 56px)',
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
          <ArrowRight className="ml-2 h-5 w-5 sm:h-8 sm:w-8" strokeWidth={2.25} />
        </a>
      </div>
    </div>
  )
}
