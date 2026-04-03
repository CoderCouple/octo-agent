/**
 * WhatsApp adapter — v2 scaffold (interface only).
 * Will receive WhatsApp messages via WhatsApp Business API and convert to InboundMessage.
 * Not implemented in v1.
 */
import type { InboundMessage } from '../../../shared/types'

export interface WhatsAppAdapterConfig {
  phoneNumberId: string
  accessToken: string
  verifyToken: string
  contactMap: Record<string, string> // phoneNumber → sessionId
}

export interface WhatsAppAdapter {
  start(config: WhatsAppAdapterConfig): Promise<void>
  stop(): Promise<void>
  sendMessage(phoneNumber: string, text: string): Promise<void>
}

/** Placeholder — returns a no-op adapter. */
export function createWhatsAppAdapter(
  _onMessage: (message: InboundMessage) => void,
): WhatsAppAdapter {
  return {
    async start(_config) {
      console.log('[WhatsAppAdapter] v2 scaffold — not implemented')
    },
    async stop() {
      // no-op
    },
    async sendMessage(_phoneNumber, _text) {
      // no-op
    },
  }
}
