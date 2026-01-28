/**
 * @spawn/agent-sdk
 *
 * Connect AI agents to the Spawn mobile app via WebSocket
 *
 * @example
 * ```typescript
 * import { SpawnAgent } from '@spawn/agent-sdk';
 *
 * const agent = new SpawnAgent({
 *   token: 'spwn_sk_xxx',
 *   onConnect: () => console.log('Connected!'),
 *   onMessage: (msg) => console.log('Received:', msg),
 * });
 *
 * await agent.connect();
 * agent.sendText('Hello from the agent!');
 * ```
 */

// Main agent class
export { SpawnAgent } from './agent.js';
export type { SpawnAgentConfig } from './agent.js';

// All type definitions
export type {
  // Message types
  MessageType,
  SpawnMessage,

  // Agent status
  AgentStatus,

  // Text messages
  TextPayload,
  TextFormat,

  // Cards
  CardPayload,
  CardField,
  CardAction,
  CardStyle,
  CardActionResponse,

  // Confirmations
  ConfirmationRequest,
  ConfirmationResponse,
  ConfirmationOption,

  // Status updates
  StatusPayload,

  // Notifications
  NotificationPayload,
  NotificationPriority,

  // Incoming messages
  IncomingMessage,
  Attachment,

  // Errors
  ErrorMessage,
} from './types.js';
