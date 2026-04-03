/**
 * Telegram adapter — v2 scaffold (interface only).
 * Will receive Telegram messages via Bot API and convert to InboundMessage.
 * Not implemented in v1.
 */
import type { InboundMessage } from '../../../shared/types'

export interface TelegramAdapterConfig {
  botToken: string
  chatMap: Record<string, string> // chatId → sessionId
}

export interface TelegramAdapter {
  start(config: TelegramAdapterConfig): Promise<void>
  stop(): Promise<void>
  sendMessage(chatId: string, text: string): Promise<void>
}

/** Placeholder — returns a no-op adapter. */
export function createTelegramAdapter(
  _onMessage: (message: InboundMessage) => void,
): TelegramAdapter {
  return {
    async start(_config) {
      console.log('[TelegramAdapter] v2 scaffold — not implemented')
    },
    async stop() {
      // no-op
    },
    async sendMessage(_chatId, _text) {
      // no-op
    },
  }
}
