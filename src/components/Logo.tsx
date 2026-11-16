export function RaastaLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="9" fill="#14452F" />
      <path
        d="M8.5 29L15.2 9.5C15.6 8.3 16.7 7.5 18 7.5C19.3 7.5 20.4 8.3 20.8 9.5L27.5 29"
        stroke="#F8F7F4"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M18 14.5V18.5M18 22.5V27.5"
        stroke="#6EE7B7"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="18" cy="10.2" r="1.8" fill="#6EE7B7" />
    </svg>
  );
}

export function RaastaWordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <RaastaLogoMark className="w-8 h-8 shrink-0" />
      <span className="font-display text-lg font-bold tracking-tight text-[#1A1D1B]">
        RaastaAI
      </span>
    </span>
  );
}
