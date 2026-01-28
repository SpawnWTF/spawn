import WebSocket from 'ws';
import type {
  SpawnMessage,
  CardPayload,
  ConfirmationRequest,
  ConfirmationResponse,
  AgentStatus,
  NotificationPriority,
  TextFormat,
} from './types.js';

/**
 * Configuration options for SpawnAgent
 */
export interface SpawnAgentConfig {
  /** Agent authentication token (spwn_sk_xxx) */
  token: string;
  /** Relay WebSocket URL (defaults to production relay) */
  relayUrl?: string;
  /** Agent display name */
  name?: string;
  /** Callback when a message is received from the app */
  onMessage?: (message: SpawnMessage) => void;
  /** Callback when connection is established */
  onConnect?: () => void;
  /** Callback when disconnected from relay */
  onDisconnect?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * SpawnAgent - Connect AI agents to the Spawn mobile app
 *
 * @example
 * ```typescript
 * const agent = new SpawnAgent({
 *   token: 'spwn_sk_xxx',
 *   onMessage: (msg) => console.log('Received:', msg),
 * });
 *
 * await agent.connect();
 * agent.sendText('Hello from the agent!');
 * ```
 */
export class SpawnAgent {
  private ws: WebSocket | null = null;
  private config: Required<Omit<SpawnAgentConfig, 'onMessage' | 'onConnect' | 'onDisconnect' | 'onError'>> &
    Pick<SpawnAgentConfig, 'onMessage' | 'onConnect' | 'onDisconnect' | 'onError'>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pendingConfirmations = new Map<string, (response: ConfirmationResponse) => void>();
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(config: SpawnAgentConfig) {
    this.config = {
      relayUrl: 'wss://spawn-relay.ngvsqdjj5r.workers.dev/v1/agent',
      name: 'SpawnAgent',
      debug: false,
      ...config,
    };
  }

  /**
   * Connect to the Spawn relay
   */
  connect(): Promise<void> {
    if (this.isConnecting) {
      return Promise.reject(new Error('Connection already in progress'));
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.log('Connecting to relay:', this.config.relayUrl);

      this.ws = new WebSocket(this.config.relayUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'X-Agent-Name': this.config.name,
          'X-Agent-Version': '1.0.0',
        },
      });

      const connectionTimeout = setTimeout(() => {
        this.isConnecting = false;
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.log('Connected to relay');
        this.config.onConnect?.();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as SpawnMessage;
          this.handleMessage(message);
        } catch (err) {
          this.log('Failed to parse message:', err);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        this.stopHeartbeat();
        this.log(`Disconnected: ${code} - ${reason.toString()}`);
        this.config.onDisconnect?.();

        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        this.log('WebSocket error:', err.message);
        this.config.onError?.(err);

        if (this.reconnectAttempts === 0) {
          reject(err);
        }
      });
    });
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    // Clear pending confirmations
    this.pendingConfirmations.forEach((resolver) => {
      resolver({
        request_id: '',
        selected_option_id: null,
        dismissed: true,
        response_time_ms: 0,
      });
    });
    this.pendingConfirmations.clear();
  }

  /**
   * Check if connected to the relay
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a text message to the app
   */
  sendText(content: string, format: TextFormat = 'plain'): void {
    this.send({
      type: 'text',
      payload: { content, format },
    });
  }

  /**
   * Send a rich card to the app
   */
  sendCard(card: CardPayload): void {
    this.send({
      type: 'card',
      payload: card,
    });
  }

  /**
   * Request confirmation from the user
   * Returns a promise that resolves when the user responds
   */
  requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationResponse> {
    const requestId = `cfm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.send({
      type: 'confirmation_request',
      payload: {
        request_id: requestId,
        ...request,
      },
    });

    return new Promise((resolve) => {
      this.pendingConfirmations.set(requestId, resolve);

      // Auto-resolve after timeout if specified
      if (request.timeout_ms) {
        setTimeout(() => {
          if (this.pendingConfirmations.has(requestId)) {
            this.pendingConfirmations.delete(requestId);
            resolve({
              request_id: requestId,
              selected_option_id: null,
              dismissed: true,
              response_time_ms: request.timeout_ms!,
            });
          }
        }, request.timeout_ms);
      }
    });
  }

  /**
   * Update the agent's status in the app
   */
  updateStatus(status: AgentStatus, label?: string): void {
    this.send({
      type: 'status_update',
      payload: { status, label },
    });
  }

  /**
   * Send a push notification to the user's device
   */
  notify(title: string, body: string, priority: NotificationPriority = 'normal'): void {
    this.send({
      type: 'notification',
      payload: { title, body, priority },
    });
  }

  /**
   * Send a raw message (for advanced use cases)
   */
  sendRaw(type: string, payload: unknown): void {
    this.send({ type, payload });
  }

  private send(message: { type: string; payload: unknown }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.log('Cannot send message: not connected');
      return;
    }

    const fullMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      ...message,
    };

    this.log('Sending:', fullMessage.type);
    this.ws.send(JSON.stringify(fullMessage));
  }

  private handleMessage(message: SpawnMessage): void {
    this.log('Received:', message.type);

    // Handle ping/pong for keepalive
    if (message.type === 'ping') {
      this.send({ type: 'pong', payload: { ts: Date.now() } });
      return;
    }

    // Handle confirmation responses
    if (message.type === 'confirmation_response') {
      const payload = message.payload as unknown as ConfirmationResponse;
      const resolver = this.pendingConfirmations.get(payload.request_id);
      if (resolver) {
        resolver(payload);
        this.pendingConfirmations.delete(payload.request_id);
      }
      return;
    }

    // Pass to user handler
    this.config.onMessage?.(message);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', payload: { ts: Date.now() } });
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectAttempts * 2000, 10000);

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch((err) => {
          this.log('Reconnect failed:', err.message);
        });
      }
    }, delay);
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SpawnAgent]', ...args);
    }
  }
}
