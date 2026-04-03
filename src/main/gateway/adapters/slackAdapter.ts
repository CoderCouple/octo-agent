/**
 * Slack adapter — v2 scaffold (interface only).
 * Will receive Slack messages and convert to InboundMessage.
 * Not implemented in v1.
 */
import type { InboundMessage } from '../../../shared/types'

export interface SlackAdapterConfig {
  botToken: string
  signingSecret: string
  channelMap: Record<string, string> // channelId → sessionId
}

export interface SlackAdapter {
  start(config: SlackAdapterConfig): Promise<void>
  stop(): Promise<void>
  sendToChannel(channelId: string, text: string): Promise<void>
}

/** Placeholder — returns a no-op adapter. */
export function createSlackAdapter(
  _onMessage: (message: InboundMessage) => void,
): SlackAdapter {
  return {
    async start(_config) {
      console.log('[SlackAdapter] v2 scaffold — not implemented')
    },
    async stop() {
      // no-op
    },
    async sendToChannel(_channelId, _text) {
      // no-op
    },
  }
}
