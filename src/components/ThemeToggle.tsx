'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'testscan_theme';

function getSystemPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function applyTheme(isLight: boolean) {
  document.body.classList.toggle('light-mode', isLight);
}

function resolveTheme(m: ThemeMode): boolean {
  if (m === 'system') return getSystemPreference();
  return m === 'light';
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'system';
}

// Track whether the component has hydrated on the client
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function ThemeToggle() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  const syncTheme = useCallback((m: ThemeMode) => {
    applyTheme(resolveTheme(m));
  }, []);

  // Apply theme whenever mode changes and listen for system preference changes
  useEffect(() => {
    syncTheme(mode);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      if (mode === 'system') {
        applyTheme(mediaQuery.matches);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode, syncTheme]);

  const cycle = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    syncTheme(next);
  };

  if (!hydrated) return null;

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label = mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark';

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 text-zinc-400 font-mono text-[10px] uppercase tracking-widest hover:text-zinc-100 hover:border-zinc-600 transition-colors"
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
