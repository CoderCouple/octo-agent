/**
 * JSON parse + schema validation for incoming WebSocket frames.
 */
import type { WSFrame, WSFrameType, WSMethod } from '../../shared/types'

const VALID_TYPES: WSFrameType[] = ['req', 'res', 'event']
const VALID_METHODS: WSMethod[] = ['connect', 'send', 'resolve', 'status', 'brief', 'setMode']

export function parseFrame(data: string): WSFrame | null {
  try {
    const frame = JSON.parse(data) as Record<string, unknown>
    if (!frame || typeof frame !== 'object') return null
    if (!VALID_TYPES.includes(frame.type as WSFrameType)) return null
    if (typeof frame.id !== 'string') return null
    if (frame.method && !VALID_METHODS.includes(frame.method as WSMethod)) return null
    return frame as unknown as WSFrame
  } catch {
    return null
  }
}
