'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../../../store/useAuthStore';
import {
  Users,
  Layers,
  LogOut,
  Activity,
  ChevronRight,
  Menu,
  X,
  Building2,
  CalendarDays,
  History,
  ShieldCheck,
  AlertTriangle,
  CircleDot,
} from 'lucide-react';
import { LiveClock } from '../../../components/LiveClock';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hydrate } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Close mobile drawer and dropdown on route transition
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  }, [pathname]);

  // Close profile dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileDropdownOpen]);

  const handleConfirmLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      } else {
        router.replace('/login');
      }
    } finally {
      setIsSigningOut(false);
      setShowSignOutModal(false);
    }
  };

  const userInitial = (user?.name?.[0] || 'H').toUpperCase();

  // Reordered Navigation Tabs (Doctor Roster is 1st & default landing tab)
  const navItems = [
    { label: 'Doctor Roster & Rooms', href: '/admin/doctors', icon: Users, short: 'Doctors' },
    { label: 'Department Analytics', href: '/admin/analytics', icon: Building2, short: 'Depts' },
    { label: 'Past Records & History', href: '/admin/history', icon: History, short: 'History' },
    { label: 'Live Token Desk & Queue', href: '/admin/queue', icon: Layers, short: 'Queue' },
  ];

  return (
    <div className="h-screen w-screen bg-[url('/KioskScreenBg.png')] bg-center bg-cover bg-no-repeat bg-[#f1f8f7] flex flex-col text-slate-900 overflow-hidden font-sans select-none">
      {/* Top Navbar */}
      <header className="h-[64px] bg-white/98 text-slate-800 px-3 sm:px-5 flex items-center justify-between shrink-0 shadow-[0_2px_12px_rgba(18,56,56,0.04)] border-b border-[#dce8e7] z-40">
        {/* Left Branding & Mobile Hamburger */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-1.5 rounded-xl bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors cursor-pointer shrink-0"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* AyushCare Brand Identity */}
          <div className="w-10 h-10 shrink-0 flex items-center justify-center">
            <img
              src="/ayushCareLogo.png"
              alt="AyushCare Logo"
              className="w-10 h-10 object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 truncate">
              <strong className="text-base sm:text-lg font-extrabold tracking-tight leading-tight">
                <span className="text-[#12383b]">Ayush</span>
                <span className="text-[#438b34]">Care</span>
                <span className="text-slate-800 font-bold ml-1.5 text-sm sm:text-base">Admin</span>
              </strong>
              <span className="hidden xs:inline-block px-1.5 py-0.2 text-[9px] font-bold bg-teal-50 text-teal-800 border border-teal-200 rounded-full">
                HOSPITAL
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 leading-tight hidden sm:block truncate mt-0.5">
              AyushCare Central Health Operations & OPD Control
            </p>
          </div>

          {/* Divider & Tagline */}
          <div className="hidden md:block w-px h-7 bg-slate-200 mx-1.5 shrink-0" aria-hidden="true" />
          <div className="hidden md:flex flex-col text-[11px] font-semibold text-slate-500 leading-tight shrink-0">
            <span>Traditional Wisdom</span>
            <span>Modern Care</span>
          </div>
        </div>

        {/* Center Workspace Branding */}
        <div className="hidden xl:flex items-center px-3 py-1 bg-[#f0f9f8] border border-[#cfe3e1] rounded-full text-xs font-semibold text-teal-900 gap-1.5 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold tracking-wide">Hospital Control Desk</span>
        </div>

        {/* Right Info: Ayushman Bharat, Live Clock & Circular Profile Avatar Dropdown */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Ayushman Bharat Logo + Text */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#f4f8f7] border border-[#dce8e7] rounded-xl shrink-0">
            <img
              src="/ayushman-bharat-icon.png"
              alt="Ayushman Bharat"
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <strong className="text-[11.5px] font-bold text-slate-800 leading-none">Ayushman Bharat</strong>
              <small className="text-[9.5px] font-semibold text-slate-500 mt-0.5 leading-none">Swasth Bharat, Samriddh Bharat</small>
            </div>
          </div>

          {/* Live Clock Widget */}
          <LiveClock variant="light" />

          {/* Circular Profile Avatar Button & Dropdown Menu */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setProfileDropdownOpen((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-emerald-700 text-white font-semibold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 select-none"
              aria-expanded={profileDropdownOpen}
              aria-haspopup="true"
              aria-label="User profile menu"
            >
              <span className="text-sm font-bold tracking-wide">{userInitial}</span>
            </button>

            {/* Profile Dropdown Popover */}
            {profileDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                {/* Header Section */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-700 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {userInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {user?.name || 'Hospital Administrator'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {user?.email || 'admin@ayushcare.com'}
                    </p>
                  </div>
                </div>

                {/* Account Details & Role */}
                <div className="px-4 py-2.5 space-y-2 text-[11px] text-slate-600 bg-slate-50/70 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Role:</span>
                    </span>
                    <span className="font-semibold text-slate-800 uppercase tracking-wide text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200">
                      Hospital Admin
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <CircleDot className="w-3 h-3 text-emerald-500" />
                      <span>Status:</span>
                    </span>
                    <span className="text-emerald-700 font-semibold text-[10px]">Online & Active</span>
                  </div>
                </div>

                {/* Menu Action: Sign Out */}
                <div className="p-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      setShowSignOutModal(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 top-[56px] z-30 bg-slate-900/50 backdrop-blur-xs lg:hidden transition-opacity"
          />
        )}

        {/* Admin Navigation Sidebar (Desktop Docked + Mobile Slide-Over) */}
        <aside
          className={`fixed lg:static inset-y-0 top-[56px] lg:top-0 left-0 z-40 lg:z-auto w-64 sm:w-72 bg-white border-r border-slate-200/90 flex flex-col justify-between p-4 shrink-0 transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 tracking-wider font-bold mb-3 px-2 uppercase">
              HOSPITAL MANAGEMENT
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                    isActive
                      ? 'bg-[#044e42] text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-teal-200' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'opacity-40'}`} />
                </Link>
              );
            })}
          </div>

          {/* Bottom Telemetry Card */}
          <div className="bg-teal-50/80 border border-teal-200/90 rounded-xl p-3 text-teal-950 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#044e42] mb-1">
              <Activity className="w-4 h-4 text-teal-700" />
              <span>OPD Telemetry Active</span>
            </div>
            <p className="text-[11px] leading-relaxed text-teal-800/90 font-medium">
              Synchronized with AyushCare Kiosk Intake and AyushCare Mobile patient portal.
            </p>
          </div>
        </aside>

        {/* Dynamic Admin Page Workspace */}
        <main className="flex-1 bg-[#f8fafc] overflow-y-auto p-3 sm:p-5 md:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Smartphones only) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-bold transition-all ${
                isActive ? 'text-[#044e42]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-[#044e42]' : 'text-slate-400'}`} />
              <span>{item.short}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sign Out Confirmation Modal Dialog */}
      {showSignOutModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 text-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Sign Out of Workspace</h3>
                <p className="text-[11px] text-slate-500">Hospital Administration Portal</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Are you sure you want to sign out? Your active admin clinical session will be securely terminated and credentials cleared.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSignOutModal(false)}
                disabled={isSigningOut}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={isSigningOut}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSigningOut ? (
                  <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span>{isSigningOut ? 'Signing out...' : 'Yes, Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
