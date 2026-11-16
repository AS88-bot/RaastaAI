import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { RaastaWordmark } from './Logo';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function Navbar({ currentPath, onNavigate }: NavbarProps) {
  const { user, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { path: '/feed', label: 'Feed' },
    { path: '/map', label: 'Map' },
    { path: '/insights', label: 'Insights' },
    { path: '/dashboard', label: user ? 'Dashboard' : 'Sign In' },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin' }] : []),
  ];

  const handleLinkClick = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F7F4]/95 backdrop-blur-sm border-b border-[#E5E3DC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('/');
          }}
          className="shrink-0 focus-visible:rounded-md"
          aria-label="RaastaAI Home"
        >
          <RaastaWordmark />
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Primary Navigation">
          {navLinks.map((item) => {
            const active =
              currentPath === item.path ||
              (item.path === '/dashboard' && currentPath === '/auth' && !user);
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(item.path === '/dashboard' && !user ? '/auth' : item.path);
                }}
                className={`text-sm font-medium whitespace-nowrap shrink-0 transition-colors pb-0.5 ${
                  active
                    ? 'text-[#14452F] border-b-2 border-[#14452F]'
                    : 'text-[#4F5651] hover:text-[#1A1D1B]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Single primary CTA + mobile menu toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleLinkClick(user ? '/report' : '/auth?next=/report')}
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
          >
            Report Issue
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-[#E5E3DC] bg-white text-[#1A1D1B] hover:bg-[#F3F1EC] cursor-pointer"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E5E3DC] bg-[#F8F7F4] px-4 py-4 space-y-2">
          {navLinks.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() =>
                handleLinkClick(item.path === '/dashboard' && !user ? '/auth' : item.path)
              }
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium min-h-[44px] cursor-pointer ${
                currentPath === item.path
                  ? 'bg-[#14452F]/10 text-[#14452F]'
                  : 'text-[#1A1D1B] hover:bg-[#EFECE5]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleLinkClick(user ? '/report' : '/auth?next=/report')}
            className="w-full px-4 py-3 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] min-h-[44px] cursor-pointer"
          >
            Report Issue
          </button>
        </div>
      )}
    </header>
  );
}
