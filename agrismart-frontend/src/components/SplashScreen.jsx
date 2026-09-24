import { useEffect, useState } from 'react';

/**
 * SplashScreen — a brief, one-time "wow" entrance shown the instant
 * AgriSmart is opened in a browser tab (before/alongside the auth
 * check in App.jsx), where the app's own leaf-and-droplet mark draws
 * itself in piece by piece rather than just appearing.
 *
 * Deliberately NOT the real /agrismart-logo.png: it's redrawn here as
 * a plain inline SVG (teardrop outline, 5 leaves, trunk, circuit
 * traces) using the exact brand/accent Tailwind tokens (see
 * tailwind.config.js — those tokens were themselves sampled from this
 * same logo) so each piece can be animated in on its own. The real
 * PNG logo keeps being used everywhere else (sidebar, login, favicon,
 * the small AI-surface icons) — this is a one-off entrance effect,
 * not a replacement asset.
 *
 * Shown once per browser tab (sessionStorage flag) so it doesn't
 * replay on every client-side navigation — only on a fresh page load,
 * which is exactly the "first time you open the app" moment that
 * makes it worth watching. Respects prefers-reduced-motion: skips the
 * piece-by-piece draw-in and just briefly shows the finished mark.
 */
const SEEN_KEY = 'agrismart_seen_splash';
const REDUCED_MOTION_TOTAL_MS = 900;
const FULL_TOTAL_MS = 2600;

export default function SplashScreen({ onDone }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    setReducedMotion(reduced);

    const total = reduced ? REDUCED_MOTION_TOTAL_MS : FULL_TOTAL_MS;
    const fadeOutAt = total - 500;

    const fadeTimer = setTimeout(() => setFadingOut(true), fadeOutAt);
    const doneTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      onDone();
    }, total);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`}
      role="presentation"
      aria-hidden="true"
    >
      <style>{`
        @keyframes as-draw { to { stroke-dashoffset: 0; } }
        @keyframes as-pop { 0% { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; transform: scale(1.12); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes as-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes as-dot { 0% { opacity: 0; transform: scale(0); } 70% { opacity: 1; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }

        .as-outline {
          stroke-dasharray: 300;
          stroke-dashoffset: 300;
          animation: ${reducedMotion ? 'none' : 'as-draw 0.7s ease-out 0.05s forwards'};
        }
        .as-trunk {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: ${reducedMotion ? 'none' : 'as-draw 0.5s ease-out 1.05s forwards'};
        }
        .as-branch-l {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: ${reducedMotion ? 'none' : 'as-draw 0.4s ease-out 1.35s forwards'};
        }
        .as-branch-r {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: ${reducedMotion ? 'none' : 'as-draw 0.4s ease-out 1.45s forwards'};
        }
        .as-leaf {
          opacity: ${reducedMotion ? 1 : 0};
          transform-origin: center;
          animation: ${reducedMotion ? 'none' : 'as-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards'};
        }
        .as-leaf-center { animation-delay: ${reducedMotion ? '0s' : '0.45s'}; }
        .as-leaf-l1 { animation-delay: ${reducedMotion ? '0s' : '0.6s'}; }
        .as-leaf-r1 { animation-delay: ${reducedMotion ? '0s' : '0.68s'}; }
        .as-leaf-l2 { animation-delay: ${reducedMotion ? '0s' : '0.78s'}; }
        .as-leaf-r2 { animation-delay: ${reducedMotion ? '0s' : '0.86s'}; }
        .as-node {
          opacity: ${reducedMotion ? 1 : 0};
          transform-origin: center;
          animation: ${reducedMotion ? 'none' : 'as-dot 0.35s ease-out forwards'};
        }
        .as-node-l { animation-delay: ${reducedMotion ? '0s' : '1.7s'}; }
        .as-node-r { animation-delay: ${reducedMotion ? '0s' : '1.8s'}; }
        .as-wordmark {
          opacity: ${reducedMotion ? 1 : 0};
          animation: ${reducedMotion ? 'none' : 'as-fade-up 0.5s ease-out 1.95s forwards'};
        }
        .as-tagline {
          opacity: ${reducedMotion ? 1 : 0};
          animation: ${reducedMotion ? 'none' : 'as-fade-up 0.5s ease-out 2.2s forwards'};
        }
      `}</style>

      <svg width="132" height="145" viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="as-grad-outline" x1="30" y1="0" x2="170" y2="220" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#78e0ac" />
            <stop offset="1" stopColor="#17ada6" />
          </linearGradient>
          <linearGradient id="as-grad-leaf" x1="100" y1="20" x2="100" y2="170" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#43c98a" />
            <stop offset="1" stopColor="#146d48" />
          </linearGradient>
          <linearGradient id="as-grad-trunk" x1="100" y1="120" x2="100" y2="210" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#128f8a" />
            <stop offset="1" stopColor="#17ada6" />
          </linearGradient>
        </defs>

        {/* Teardrop outline */}
        <path
          className="as-outline"
          d="M100 8 C100 8 168 82 168 132 C168 172 138 202 100 202 C62 202 32 172 32 132 C32 82 100 8 100 8 Z"
          stroke="url(#as-grad-outline)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Center leaf */}
        <path
          className="as-leaf as-leaf-center"
          d="M100 38 C112 58 118 82 100 108 C82 82 88 58 100 38 Z"
          fill="url(#as-grad-leaf)"
        />
        <path className="as-leaf as-leaf-center" d="M100 42 L100 104" stroke="#eefdf5" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

        {/* Upper side leaves */}
        <path
          className="as-leaf as-leaf-l1"
          d="M96 70 C78 66 60 70 48 84 C64 92 82 92 96 78 Z"
          fill="url(#as-grad-leaf)"
        />
        <path
          className="as-leaf as-leaf-r1"
          d="M104 70 C122 66 140 70 152 84 C136 92 118 92 104 78 Z"
          fill="url(#as-grad-leaf)"
        />

        {/* Lower side leaves */}
        <path
          className="as-leaf as-leaf-l2"
          d="M98 96 C80 96 64 104 54 120 C70 124 88 122 99 108 Z"
          fill="url(#as-grad-leaf)"
        />
        <path
          className="as-leaf as-leaf-r2"
          d="M102 96 C120 96 136 104 146 120 C130 124 112 122 101 108 Z"
          fill="url(#as-grad-leaf)"
        />

        {/* Trunk */}
        <path className="as-trunk" d="M100 108 L100 168" stroke="url(#as-grad-trunk)" strokeWidth="6" strokeLinecap="round" />

        {/* Circuit branches */}
        <path className="as-branch-l" d="M100 150 L78 172 L64 172" stroke="url(#as-grad-trunk)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path className="as-branch-r" d="M100 150 L122 172 L136 172" stroke="url(#as-grad-trunk)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle className="as-node as-node-l" cx="64" cy="172" r="7" fill="white" stroke="#128f8a" strokeWidth="4" />
        <circle className="as-node as-node-r" cx="136" cy="172" r="7" fill="white" stroke="#128f8a" strokeWidth="4" />
      </svg>

      <div className="mt-3 flex items-baseline gap-0.5 as-wordmark">
        <span className="text-2xl font-extrabold text-brand-700">Agri</span>
        <span className="text-2xl font-extrabold text-accent-600">Smart</span>
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 as-tagline">
        Smart Farming. Better Future.
      </div>
    </div>
  );
}
