export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="#2563eb"/>
      <path d="M14 12h20v3H17v9h14v3H17v9h17v3H14V12z" fill="white"/>
      <circle cx="34" cy="34" r="8" fill="#22c55e" opacity="0.9"/>
      <path d="M31 34l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
