import React from 'react';

interface LogoProps {
  className?: string;
  dark?: boolean;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = '', dark = false, showText = true }) => {
  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg
        width="34"
        height="34"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Outer civic shield */}
        <rect width="36" height="36" rx="8" fill={dark ? '#0F294A' : '#0B1F3A'} />
        {/* Road arch / infrastructure span */}
        <path
          d="M7 25C10.5 19.5 14 17 18 17C22 17 25.5 19.5 29 25"
          stroke="#14B8A6"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Road centerline */}
        <path
          d="M18 19.5V27"
          stroke="#F8FAFC"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="2.5 2.5"
        />
        {/* Location pin + node */}
        <path
          d="M18 7C14.9624 7 12.5 9.46243 12.5 12.5C12.5 16.5 18 21.5 18 21.5C18 21.5 23.5 16.5 23.5 12.5C23.5 9.46243 21.0376 7 18 7Z"
          fill="#0D9488"
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
        {/* Saffron connectivity core */}
        <circle cx="18" cy="12.5" r="2.2" fill="#F59E0B" />
      </svg>
      {showText && (
        <span
          className={`font-display text-lg font-bold tracking-tight whitespace-nowrap ${
            dark ? 'text-white' : 'text-[#0B1F3A]'
          }`}
        >
          CIVIL SETU
        </span>
      )}
    </span>
  );
};
