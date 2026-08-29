import { create } from 'zustand'
import type { PlatformAdmin } from '@/lib/types'

interface PlatformAuthState {
  admin: PlatformAdmin | null
  accessToken: string | null
  isHydrated: boolean
  setSession: (admin: PlatformAdmin, accessToken: string) => void
  logout: () => void
  hydrate: () => void
}

const STORAGE_KEY = 'mrmemo.platform.session'

export const usePlatformAuthStore = create<PlatformAuthState>((set) => ({
  admin: null,
  accessToken: null,
  isHydrated: false,

  setSession: (admin, accessToken) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ admin, accessToken }))
    set({ admin, accessToken })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ admin: null, accessToken: null })
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const { admin, accessToken } = JSON.parse(raw)
        set({ admin, accessToken, isHydrated: true })
        return
      }
    } catch {
      // ignore corrupt storage
    }
    set({ isHydrated: true })
  },
}))
