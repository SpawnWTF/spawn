/**
 * Spawn Protocol Type Definitions
 */

// Message types that can be sent/received
export type MessageType =
  | 'text'
  | 'card'
  | 'confirmation_request'
  | 'confirmation_response'
  | 'status_update'
  | 'notification'
  | 'ping'
  | 'pong'
  | 'message'
  | 'error';

// Agent status values
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error';

// Notification priority levels
export type NotificationPriority = 'low' | 'normal' | 'high';

// Card display styles
export type CardStyle = 'default' | 'success' | 'warning' | 'error' | 'info';

// Text format types
export type TextFormat = 'plain' | 'markdown';

/**
 * Base message structure for all Spawn Protocol messages
 */
export interface SpawnMessage {
  id: string;
  ts: number;
  type: MessageType;
  payload: Record<string, unknown>;
}

/**
 * Text message payload
 */
export interface TextPayload {
  content: string;
  format?: TextFormat;
}

/**
 * Card field for displaying key-value pairs
 */
export interface CardField {
  label: string;
  value: string;
  style?: 'default' | 'code' | 'highlight';
}

/**
 * Card action button
 */
export interface CardAction {
  id: string;
  label: string;
  style?: 'default' | 'primary' | 'destructive';
}

/**
 * Rich card payload for structured content display
 */
export interface CardPayload {
  title: string;
  subtitle?: string;
  body?: string;
  style?: CardStyle;
  fields?: CardField[];
  actions?: CardAction[];
  imageUrl?: string;
  footer?: string;
}

/**
 * Confirmation option for user selection
 */
export interface ConfirmationOption {
  id: string;
  label: string;
  description?: string;
  style?: 'default' | 'primary' | 'destructive';
}

/**
 * Request user confirmation or selection
 */
export interface ConfirmationRequest {
  title: string;
  description?: string;
  options: ConfirmationOption[];
  timeout_ms?: number;
  allow_dismiss?: boolean;
}

/**
 * User's response to a confirmation request
 */
export interface ConfirmationResponse {
  request_id: string;
  selected_option_id: string | null;
  dismissed: boolean;
  response_time_ms: number;
}

/**
 * Status update payload
 */
export interface StatusPayload {
  status: AgentStatus;
  label?: string;
}

/**
 * Notification payload for push notifications
 */
export interface NotificationPayload {
  title: string;
  body: string;
  priority?: NotificationPriority;
  action_url?: string;
  data?: Record<string, unknown>;
}

/**
 * Incoming message from user/app
 */
export interface IncomingMessage {
  id: string;
  ts: number;
  type: 'message';
  payload: {
    text: string;
    attachments?: Attachment[];
  };
}

/**
 * Attachment types for incoming messages
 */
export interface Attachment {
  type: 'image' | 'file' | 'location';
  url?: string;
  filename?: string;
  mime_type?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Error message from relay
 */
export interface ErrorMessage {
  id: string;
  ts: number;
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Card action response when user taps an action button
 */
export interface CardActionResponse {
  id: string;
  ts: number;
  type: 'card_action';
  payload: {
    card_id: string;
    action_id: string;
  };
}
