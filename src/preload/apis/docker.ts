/**
 * Preload API for Docker isolation status and container info.
 */
import { ipcRenderer } from 'electron'
import type { DockerStatus, ContainerInfo } from './types'

export type DockerApi = {
  status: () => Promise<DockerStatus>
  containerInfo: (repoDir: string) => Promise<ContainerInfo | null>
  resetContainer: (repoDir: string) => Promise<void>
}

export const dockerApi: DockerApi = {
  status: () => ipcRenderer.invoke('docker:status'),
  containerInfo: (repoDir) => ipcRenderer.invoke('docker:containerInfo', repoDir),
  resetContainer: (repoDir) => ipcRenderer.invoke('docker:resetContainer', repoDir),
}
