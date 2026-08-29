import axios from 'axios'
import { usePlatformAuthStore } from '@/store/platformAuthStore'

export const platformApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

platformApi.interceptors.request.use((config) => {
  const token = usePlatformAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      usePlatformAuthStore.getState().logout()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/platform/login')) {
        window.location.href = '/platform/login'
      }
    }
    return Promise.reject(error)
  }
)
