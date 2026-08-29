import { create } from 'zustand'
import type { User } from '@/lib/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  isHydrated: boolean
  setSession: (user: User, accessToken: string) => void
  updateUser: (user: User) => void
  logout: () => void
  hydrate: () => void
}

const STORAGE_KEY = 'mrmemo.session'

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isHydrated: false,

  setSession: (user, accessToken) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken }))
    set({ user, accessToken })
  },

  updateUser: (user) => {
    set((state) => {
      if (state.accessToken) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken: state.accessToken }))
      }
      return { user }
    })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null, accessToken: null })
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const { user, accessToken } = JSON.parse(raw)
        set({ user, accessToken, isHydrated: true })
        return
      }
    } catch {
      // ignore corrupt storage
    }
    set({ isHydrated: true })
  },
}))
