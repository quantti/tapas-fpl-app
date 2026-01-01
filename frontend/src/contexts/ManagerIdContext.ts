import { createContext } from 'react'

export interface ManagerIdContextValue {
  managerId: number | null
  setManagerId: (id: number | null) => void
  clearManagerId: () => void
  isLoggedIn: boolean
}

export const ManagerIdContext = createContext<ManagerIdContextValue | null>(null)
