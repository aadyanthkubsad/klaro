import React from 'react';

interface BhuvionaLogoMarkProps {
  size?: number;
  className?: string;
}

export const BhuvionaLogoMark = ({ size = 40, className = '' }: BhuvionaLogoMarkProps) => (
  <img
    src="/bhuviona-logo.png"
    alt="Bhuviona Technologies"
    width={size}
    height={Math.round(size * 0.55)}
    className={className}
    style={{ objectFit: 'contain' }}
  />
);

// ── Wordmark ──────────────────────────────────────────────────────────────────

interface BhuvionaWordmarkProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export const BhuvionaWordmark = ({
  variant = 'dark',
  size = 'md',
  showTagline = false,
}: BhuvionaWordmarkProps) => {
  const logoSize = size === 'sm' ? 52 : size === 'lg' ? 80 : 64;

  const nameClass =
    size === 'sm' ? 'text-base font-black tracking-tight' :
    size === 'lg' ? 'text-2xl  font-black tracking-tight' :
                    'text-xl   font-black tracking-tight';

  const textColor = variant === 'light' ? 'text-white' : 'text-slate-900';

  return (
    <div className="flex items-center gap-3">
      <BhuvionaLogoMark size={logoSize} />
      <div className="flex flex-col leading-none gap-1">
        <span className={`${nameClass} ${textColor} leading-none`}>
          Lumina Learn
        </span>
        {showTagline && (
          <span
            className="text-[10px] font-bold uppercase tracking-widest leading-none"
            style={{ color: '#00BCD4' }}
          >
            by Bhuviona Technologies
          </span>
        )}
      </div>
    </div>
  );
};
