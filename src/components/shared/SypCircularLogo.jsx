import React from 'react';

/**
 * Minimal & Modern SYP Logo Component
 * - Sleek minimal geometric SYP monogram logomark
 * - High-tech cyan & deep sapphire palette
 * - Enlarged +50% scale across all variants
 */
export default function SypCircularLogo({
  size = 'md',
  animated = false,
  showText = false,
  className = '',
  progress = null,
}) {
  // Base dimensions increased by 50%
  const sizeMap = {
    xs: 48,  // was 32
    sm: 60,  // was 40
    md: 108, // was 72
    lg: 156, // was 104
    xl: 210, // was 140
  };

  const dimension = typeof size === 'number' ? Math.round(size) : sizeMap[size] || 108;

  return (
    <div
      className={`syp-logo-wrap ${animated ? 'is-animated' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: dimension,
          height: dimension,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Animated outer tech ring if loading / animated */}
        {animated && (
          <svg
            width={dimension + 16}
            height={dimension + 16}
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              inset: -8,
              animation: 'spin 4s linear infinite',
              pointerEvents: 'none',
            }}
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth="1.5"
              strokeDasharray="18 12"
            />
          </svg>
        )}

        {/* Outer Glow & Squircle Border */}
        <svg
          width={dimension}
          height={dimension}
          viewBox="0 0 100 100"
          style={{
            position: 'absolute',
            inset: 0,
            filter: 'drop-shadow(0 4px 14px rgba(2, 132, 199, 0.35))',
          }}
        >
          <defs>
            <linearGradient id="sypBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0a2540" />
              <stop offset="50%" stopColor="#041424" />
              <stop offset="100%" stopColor="#020b14" />
            </linearGradient>

            <linearGradient id="sypBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#0284c7" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.8" />
            </linearGradient>

            <linearGradient id="sypTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#e0f2fe" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            <linearGradient id="sypAccentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            <filter id="sypGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Squircle badge body */}
          <rect
            x="4"
            y="4"
            width="92"
            height="92"
            rx="24"
            fill="url(#sypBgGrad)"
            stroke="url(#sypBorderGrad)"
            strokeWidth="2"
          />

          {/* Subtle top-light sheen */}
          <path
            d="M 6 26 C 6 15, 15 6, 26 6 L 74 6 C 85 6, 94 15, 94 26 L 94 40 C 60 48, 40 48, 6 40 Z"
            fill="rgba(255, 255, 255, 0.05)"
          />

          {/* Progress circle if passed */}
          {progress !== null && progress > 0 && (
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="276"
              strokeDashoffset={276 - (276 * progress) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          )}

          {/* Minimal SYP Vector Monogram */}
          <g filter="url(#sypGlow)">
            {/* Letter 'S' */}
            <path
              d="M 36 38 L 24 38 C 21 38 19 40 19 43 C 19 46.5 21 48.5 24.5 49 L 31.5 50 C 35 50.5 37 52.5 37 56 C 37 59.5 34.5 62 31 62 L 19 62"
              fill="none"
              stroke="url(#sypTextGrad)"
              strokeWidth="4.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Letter 'Y' */}
            <path
              d="M 43 38 L 50 49 L 57 38 M 50 49 L 50 62"
              fill="none"
              stroke="url(#sypTextGrad)"
              strokeWidth="4.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Letter 'P' */}
            <path
              d="M 64 62 L 64 38 L 74 38 C 78.5 38 81 40.5 81 44.5 C 81 48.5 78.5 51 74 51 L 64 51"
              fill="none"
              stroke="url(#sypTextGrad)"
              strokeWidth="4.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>

          {/* Tech Status Pill / Dot below monogram */}
          <circle cx="50" cy="72" r="2.2" fill="#38bdf8" />
          <line
            x1="36"
            y1="72"
            x2="44"
            y2="72"
            stroke="rgba(56, 189, 248, 0.4)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="56"
            y1="72"
            x2="64"
            y2="72"
            stroke="rgba(56, 189, 248, 0.4)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText ? (
        <div style={{ textAlign: 'center' }}>
          <strong
            style={{
              display: 'block',
              fontSize: dimension > 120 ? '1.15rem' : '0.95rem',
              color: '#ffffff',
              fontWeight: 800,
              letterSpacing: '-0.01em',
            }}
          >
            Saha Yönetim Paneli
          </strong>
        </div>
      ) : null}
    </div>
  );
}

export function SypCircularLoader({ text = 'Yükleniyor...', size = 'md' }) {
  return (
    <div
      className="syp-circular-loader"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        gap: '1rem',
      }}
    >
      <SypCircularLogo size={size} animated={true} />
      {text ? (
        <span
          style={{
            fontSize: '0.88rem',
            fontWeight: 600,
            color: '#38bdf8',
            letterSpacing: '0.02em',
          }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}
