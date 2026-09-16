export const actionTypes = [
  'send-fixed-message',
  'send-custom-message',
  'skip',
  'mark-read',
  'mark-unread',
  'later',
  'handled',
  'no-op',
] as const;

export type ActionType = (typeof actionTypes)[number];
export type GestureSlot = 'left' | 'right' | 'up' | 'down' | 'custom-input';
export type DeckStatus = 'pending' | 'later' | 'handled';
export type AttentionState = 'unread' | 'read';

export interface GestureAction {
  type: ActionType;
  value?: string;
}

export type GestureConfig = Record<GestureSlot, GestureAction>;

export interface DeckItem {
  messageId: string;
  interactionId: string;
  status: DeckStatus;
  attention: AttentionState;
  receivedAt: string;
}

export interface CanonicalMessage {
  id: string;
  origin: string;
  destination: string;
  content: string;
  createdAt: string;
}

export type HydratedDeckItem = DeckItem & {
  message: CanonicalMessage;
};

export interface InboundEnvelope {
  interactionId: string;
  message: CanonicalMessage;
}

export interface ActionInvocation {
  type: ActionType;
  value?: string;
}

export interface ActionResult {
  item: DeckItem;
  advance: boolean;
  replyMessageId?: string;
}

export const defaultGestures: GestureConfig = {
  left: { type: 'send-fixed-message', value: 'Continue' },
  right: { type: 'send-fixed-message', value: 'Stop' },
  up: { type: 'later' },
  down: { type: 'mark-read' },
  'custom-input': { type: 'send-custom-message' },
};
