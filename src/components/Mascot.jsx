import React, { useId } from 'react'

/**
 * Themis — the mascot owl. Wisdom + watchfulness for the claims workspace.
 * Used in empty / loading / success states. Pure SVG, theme-aware via
 * currentColor and CSS variables so it fits every theme.
 */
export default function Mascot({ size = 96, mood = 'idle', float = true, className = '', decorative = false }) {
  const id = useId().replace(/:/g, '')
  const gradId = `mascot-grad-${id}`
  const happy = mood === 'happy'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      {...(decorative ? { role: 'presentation', 'aria-hidden': 'true' } : { role: 'img', 'aria-label': 'Themis the owl' })}
      className={`${float ? 'floaty' : ''} ${className}`}
    >
      <defs>
        <linearGradient id={gradId} x1="18" y1="10" x2="102" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--grape)" />
        </linearGradient>
      </defs>

      {/* ear tufts */}
      <path d="M30 34 L22 14 L46 26 Z" fill={`url(#${gradId})`} />
      <path d="M90 34 L98 14 L74 26 Z" fill={`url(#${gradId})`} />

      {/* body */}
      <path
        d="M60 16c26 0 42 18 42 44 0 26-18 46-42 46S18 86 18 60c0-26 16-44 42-44z"
        fill={`url(#${gradId})`}
      />

      {/* belly */}
      <path
        d="M60 52c15 0 24 10 24 24s-9 24-24 24-24-10-24-24 9-24 24-24z"
        fill="var(--bg-2)"
        opacity="0.92"
      />

      {/* eyes */}
      <g className="mascot-eyes">
        <circle cx="45" cy="52" r="15" fill="#ffffff" />
        <circle cx="75" cy="52" r="15" fill="#ffffff" />
        {happy ? (
          <>
            <path d="M39 54c3-4 9-4 12 0" stroke="#0b0d17" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M69 54c3-4 9-4 12 0" stroke="#0b0d17" strokeWidth="3.2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="46" cy="53" r="6" fill="#0b0d17" />
            <circle cx="74" cy="53" r="6" fill="#0b0d17" />
            <circle cx="48" cy="51" r="2" fill="#ffffff" />
            <circle cx="76" cy="51" r="2" fill="#ffffff" />
          </>
        )}
      </g>

      {/* beak */}
      <path d="M60 60l-5 7h10z" fill="var(--amber)" />
    </svg>
  )
}
