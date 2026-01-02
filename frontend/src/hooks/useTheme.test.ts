import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useTheme } from './useTheme';

describe('useTheme', () => {
  const mockMatchMedia = vi.fn();
  let listeners: Array<(e: MediaQueryListEvent) => void> = [];

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Reset listeners
    listeners = [];

    // Mock matchMedia
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: (event: string, callback: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') listeners.push(callback);
      },
      removeEventListener: (event: string, callback: (e: MediaQueryListEvent) => void) => {
        listeners = listeners.filter((l) => l !== callback);
      },
    });
    window.matchMedia = mockMatchMedia;

    // Mock document.documentElement.dataset
    document.documentElement.dataset.theme = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to light theme when no preference is set', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(result.current.isUsingSystem).toBe(true);
  });

  it('defaults to dark theme when system prefers dark', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isUsingSystem).toBe(true);
  });

  it('uses stored theme preference over system preference', () => {
    localStorage.setItem('theme', 'dark');
    mockMatchMedia.mockReturnValue({
      matches: false, // system prefers light
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isUsingSystem).toBe(false);
  });

  it('toggles theme and saves to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(result.current.isUsingSystem).toBe(false);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('applies theme to document element', () => {
    const { result } = renderHook(() => useTheme());

    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resets to system preference', () => {
    localStorage.setItem('theme', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.isUsingSystem).toBe(false);

    act(() => {
      result.current.resetToSystem();
    });

    expect(result.current.theme).toBe('light'); // system default
    expect(result.current.isUsingSystem).toBe(true);
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('responds to system preference changes when using system theme', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(result.current.isUsingSystem).toBe(true);

    // Simulate system preference change
    act(() => {
      for (const l of listeners) {
        l({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(result.current.theme).toBe('dark');
  });

  it('ignores system preference changes when user has explicit preference', () => {
    localStorage.setItem('theme', 'light');
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: (event: string, callback: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') listeners.push(callback);
      },
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(result.current.isUsingSystem).toBe(false);

    // Simulate system preference change
    act(() => {
      for (const l of listeners) {
        l({ matches: true } as MediaQueryListEvent);
      }
    });

    // Should remain light because user has explicit preference
    expect(result.current.theme).toBe('light');
  });
});
