/**
 * Minimal profile store — OctoAgent uses a single default profile.
 * The multi-window profile system from Broomy has been removed.
 */
import { create } from 'zustand'

export interface ProfileData {
  id: string
  name: string
  color: string
}

interface ProfileStore {
  profiles: ProfileData[]
  currentProfileId: string
  isLoading: boolean
  loadProfiles: () => Promise<void>
  switchProfile: (profileId: string) => Promise<void>
}

const DEFAULT_PROFILE: ProfileData = { id: 'default', name: 'Default', color: '#4a9eff' }

export const useProfileStore = create<ProfileStore>((set) => ({
  profiles: [DEFAULT_PROFILE],
  currentProfileId: 'default',
  isLoading: false,
  loadProfiles: async () => {
    set({ profiles: [DEFAULT_PROFILE], currentProfileId: 'default', isLoading: false })
  },
  switchProfile: async () => {
    // No-op in OctoAgent — single profile only
  },
}))
