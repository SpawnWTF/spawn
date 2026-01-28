/**
 * Spawn SDK for Node.js/TypeScript
 * Connect your AI agent to the Spawn app
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface PolicyConfig {
  autoSpawnMode: 'off' | 'queue' | 'constrained' | 'trusted' | 'unrestricted';
  maxConcurrentSubAgents: number;
  maxSubAgentsPerHour: number;
  maxTokensPerSubAgent: number;
  
  permissionsAllowed: string[];
  permissionsForbidden: string[];
  permissionsAsk: string[];
  
  allowedPaths: string[];
  forbiddenPaths: string[];
  
  allowedCommands: string[];
  allowedNetworkDomains: string[];
  
  checkInHours: number;
}

export interface CardField {
  label: string;
  value: string;
  format?: string;
}

export interface CardAction {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'destructive';
}

export interface Permission {
  scope: string;
  path?: string;
  command?: string;
  reason?: string;
}

export interface SubAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  sendTask: (task: string) => Promise<void>;
  waitForResult: (timeout?: number) => Promise<any>;
  terminate: (reason?: string) => Promise<void>;
}

// ============================================================================
// Connection
// ============================================================================

class SpawnConnection extends EventEmitter {
  private token: string;
  private relayUrl: string;
  private ws: WebSocket | null = null;
  private policy: PolicyConfig;
  private pendingResponses: Map<string, { resolve: Function; reject: Function }> = new Map();
  private connected = false;

  constructor(token: string, relayUrl = 'wss://relay.spawn.io/v1/agent') {
    super();
    this.token = token;
    this.relayUrl = relayUrl;
    this.policy = this.defaultPolicy();
  }

  private defaultPolicy(): PolicyConfig {
    return {
      autoSpawnMode: 'off',
      maxConcurrentSubAgents: 5,
      maxSubAgentsPerHour: 10,
      maxTokensPerSubAgent: 50000,
      permissionsAllowed: ['files.read', 'agent.message'],
      permissionsForbidden: ['system.shell', 'files.delete', 'agent.spawn'],
      permissionsAsk: ['files.write', 'process.execute', 'network.fetch'],
      allowedPaths: [],
      forbiddenPaths: ['~/.ssh/**', '~/.aws/**', '**/.env', '**/*.key'],
      allowedCommands: [],
      allowedNetworkDomains: [],
      checkInHours: 4,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-Agent-Version': '1.0.0',
        },
      });

      this.ws.on('open', async () => {
        this.connected = true;
        await this.fetchPolicy();
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on('error', reject);
      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnect');
      });
    });
  }

  private handleMessage(message: any): void {
    const requestId = message.payload?.request_id || message.id;
    
    if (this.pendingResponses.has(requestId)) {
      this.pendingResponses.get(requestId)!.resolve(message);
      this.pendingResponses.delete(requestId);
      return;
    }

    if (message.type === 'policy_update') {
      this.updatePolicy(message.payload);
    } else if (message.type === 'message') {
      this.emit('message', message.payload);
    }

    this.emit(message.type, message.payload);
  }

  private async fetchPolicy(): Promise<void> {
    const response = await this.request({
      type: 'get_policy',
      id: this.generateId(),
      ts: Date.now(),
      payload: {},
    });
    if (response) {
      this.updatePolicy(response.payload);
    }
  }

  private updatePolicy(data: Partial<PolicyConfig>): void {
    Object.assign(this.policy, data);
  }

  async request(message: any, timeout = 30000): Promise<any> {
    const requestId = message.payload?.request_id || message.id;
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        resolve(null);
      }, timeout);

      this.pendingResponses.set(requestId, {
        resolve: (value: any) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject,
      });

      this.send(message);
    });
  }

  send(message: any): void {
    if (!message.id) message.id = this.generateId();
    if (!message.ts) message.ts = Date.now();
    this.ws?.send(JSON.stringify(message));
  }

  getPolicy(): PolicyConfig {
    return this.policy;
  }

  private generateId(): string {
    return `msg_${Math.random().toString(36).slice(2, 14)}`;
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let connection: SpawnConnection | null = null;

export function init(token?: string, relayUrl?: string): SpawnConnection {
  const t = token || process.env.SPAWN_TOKEN;
  if (!t) throw new Error('SPAWN_TOKEN required');
  connection = new SpawnConnection(t, relayUrl);
  return connection;
}

export async function connect(): Promise<void> {
  if (connection) await connection.connect();
}

export function getPolicy(): PolicyConfig {
  return connection?.getPolicy() || {} as PolicyConfig;
}

// ============================================================================
// UI Module
// ============================================================================

export const ui = {
  async sendText(content: string, format: 'plain' | 'markdown' = 'plain'): Promise<void> {
    connection?.send({
      type: 'text',
      payload: { content, format },
    });
  },

  async sendCard(options: {
    title: string;
    subtitle?: string;
    value?: string;
    valueColor?: string;
    icon?: string;
    fields?: CardField[];
    actions?: CardAction[];
    style?: string;
  }): Promise<void> {
    const payload: any = {
      style: options.style || 'default',
      title: options.title,
    };
    if (options.subtitle) payload.subtitle = options.subtitle;
    if (options.value) {
      payload.value = { text: options.value };
      if (options.valueColor) payload.value.color = options.valueColor;
    }
    if (options.icon) payload.icon = options.icon;
    if (options.fields) payload.fields = options.fields;
    if (options.actions) payload.actions = options.actions;

    connection?.send({ type: 'card', payload });
  },

  async sendTable(options: {
    title: string;
    columns: { key: string; label: string; align?: string; format?: string }[];
    rows: Record<string, any>[];
    actions?: CardAction[];
  }): Promise<void> {
    connection?.send({
      type: 'table',
      payload: {
        title: options.title,
        columns: options.columns,
        rows: options.rows,
        actions: options.actions || [],
      },
    });
  },

  async sendChart(options: {
    chartType: 'line' | 'bar' | 'pie';
    title: string;
    series: { name?: string; values: number[] }[];
    xAxis?: any;
    yAxis?: any;
    size?: 'small' | 'medium' | 'large';
  }): Promise<void> {
    connection?.send({
      type: 'chart',
      payload: {
        chart_type: options.chartType,
        title: options.title,
        series: options.series,
        x_axis: options.xAxis,
        y_axis: options.yAxis,
        size: options.size || 'medium',
      },
    });
  },

  async sendError(options: {
    code: string;
    title: string;
    message: string;
    severity?: 'warning' | 'error';
    recoverable?: boolean;
    actions?: CardAction[];
  }): Promise<void> {
    connection?.send({
      type: 'error',
      payload: {
        code: options.code,
        title: options.title,
        message: options.message,
        severity: options.severity || 'error',
        recoverable: options.recoverable ?? true,
        actions: options.actions || [],
      },
    });
  },
};

// ============================================================================
// Status Module
// ============================================================================

export const status = {
  current: 'idle' as string,
  label: null as string | null,

  async set(state: string, label?: string): Promise<void> {
    this.current = state;
    this.label = label || null;
    connection?.send({
      type: 'status_update',
      payload: { status: state, label },
    });
  },
};

// ============================================================================
// Approval Module
// ============================================================================

export const approval = {
  async confirm(options: {
    title: string;
    message?: string;
    dangerLevel?: 'low' | 'medium' | 'high' | 'critical';
    details?: { label: string; value: string }[];
    timeoutSeconds?: number;
  }): Promise<boolean> {
    const requestId = `cfm_${Math.random().toString(36).slice(2, 14)}`;
    const payload: any = {
      request_id: requestId,
      title: options.title,
      danger_level: options.dangerLevel || 'medium',
      timeout_seconds: options.timeoutSeconds || 300,
      options: [
        { id: 'cancel', label: 'Cancel', style: 'secondary' },
        { id: 'confirm', label: 'Confirm', style: 'primary' },
      ],
    };

    if (options.message) payload.summary = options.message;
    if (options.details) payload.details = options.details;
    if (options.dangerLevel === 'high' || options.dangerLevel === 'critical') {
      payload.requires_slide = true;
    }
    if (options.dangerLevel === 'critical') {
      payload.requires_biometric = true;
    }

    const response = await connection?.request(
      { type: 'confirmation_request', payload },
      (options.timeoutSeconds || 300) * 1000
    );

    return response?.payload?.action === 'confirm';
  },

  async confirmTrade(options: {
    action: 'BUY' | 'SELL';
    symbol: string;
    quantity: number;
    price: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<boolean> {
    const total = options.quantity * options.price;
    const details = [
      { label: 'Action', value: options.action },
      { label: 'Symbol', value: options.symbol },
      { label: 'Quantity', value: String(options.quantity) },
      { label: 'Price', value: `$${options.price.toLocaleString()}` },
      { label: 'Total', value: `$${total.toLocaleString()}` },
    ];

    if (options.stopLoss) {
      details.push({ label: 'Stop Loss', value: `$${options.stopLoss.toLocaleString()}` });
    }
    if (options.takeProfit) {
      details.push({ label: 'Take Profit', value: `$${options.takeProfit.toLocaleString()}` });
    }

    return this.confirm({
      title: `${options.action} ${options.quantity} ${options.symbol}?`,
      message: `${options.action} ${options.quantity} ${options.symbol} at $${options.price.toLocaleString()}`,
      dangerLevel: 'high',
      details,
    });
  },

  async confirmWithOptions(options: {
    title: string;
    message?: string;
    choices: { id: string; label: string; style?: string }[];
    dangerLevel?: 'low' | 'medium' | 'high';
    timeoutSeconds?: number;
  }): Promise<string | null> {
    const requestId = `cfm_${Math.random().toString(36).slice(2, 14)}`;
    
    const response = await connection?.request(
      {
        type: 'confirmation_request',
        payload: {
          request_id: requestId,
          title: options.title,
          summary: options.message,
          danger_level: options.dangerLevel || 'medium',
          timeout_seconds: options.timeoutSeconds || 300,
          options: options.choices,
        },
      },
      (options.timeoutSeconds || 300) * 1000
    );

    return response?.payload?.action || null;
  },
};

// ============================================================================
// Policy Module
// ============================================================================

export const policy = {
  isAllowed(permission: string, target?: string): boolean {
    const cfg = getPolicy();
    if (cfg.permissionsForbidden?.includes(permission)) return false;
    if (cfg.permissionsAllowed?.includes(permission)) {
      if (permission.startsWith('files.') && target) {
        return this.isPathAllowed(target) && !this.isPathForbidden(target);
      }
      return true;
    }
    return false;
  },

  isForbidden(permission: string): boolean {
    return getPolicy().permissionsForbidden?.includes(permission) || false;
  },

  requiresApproval(permission: string): boolean {
    return getPolicy().permissionsAsk?.includes(permission) || false;
  },

  isPathAllowed(path: string): boolean {
    const cfg = getPolicy();
    return cfg.allowedPaths?.some((pattern) => matchGlob(path, pattern)) || false;
  },

  isPathForbidden(path: string): boolean {
    const cfg = getPolicy();
    return cfg.forbiddenPaths?.some((pattern) => matchGlob(path, pattern)) || false;
  },

  isCommandAllowed(command: string): boolean {
    const cmdName = command.split(' ')[0];
    return getPolicy().allowedCommands?.includes(cmdName) || false;
  },

  isDomainAllowed(domain: string): boolean {
    return getPolicy().allowedNetworkDomains?.includes(domain) || false;
  },
};

function matchGlob(path: string, pattern: string): boolean {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*');
  return new RegExp(`^${regex}$`).test(path);
}

// ============================================================================
// Agents Module
// ============================================================================

const activeSubAgents: SubAgent[] = [];
let spawnedThisHour = 0;

export const agents = {
  canSpawn(): boolean {
    const cfg = getPolicy();
    if (activeSubAgents.length >= cfg.maxConcurrentSubAgents) return false;
    if (spawnedThisHour >= cfg.maxSubAgentsPerHour) return false;
    return true;
  },

  activeCount(): number {
    return activeSubAgents.length;
  },

  maxConcurrent(): number {
    return getPolicy().maxConcurrentSubAgents;
  },

  active(): SubAgent[] {
    return [...activeSubAgents];
  },

  wouldAutoApprove(permissions: Permission[]): boolean {
    const cfg = getPolicy();
    if (cfg.autoSpawnMode === 'off' || cfg.autoSpawnMode === 'queue') return false;
    if (cfg.autoSpawnMode === 'unrestricted') return true;

    for (const perm of permissions) {
      if (cfg.permissionsForbidden?.includes(perm.scope)) return false;
      if (cfg.autoSpawnMode === 'constrained' && cfg.permissionsAsk?.includes(perm.scope)) {
        return false;
      }
    }
    return true;
  },

  async requestSpawn(options: {
    name: string;
    role?: string;
    description?: string;
    permissions?: Permission[];
    lifespan?: 'task_bound' | 'time_bound' | 'persistent';
    reason?: string;
    icon?: string;
  }): Promise<SubAgent | null> {
    const requestId = `spawn_req_${Math.random().toString(36).slice(2, 14)}`;
    const subAgentId = `sub_${options.name.toLowerCase().replace(/\s/g, '_')}_${Math.random().toString(36).slice(2, 8)}`;

    const response = await connection?.request(
      {
        type: 'agent_spawn_request',
        payload: {
          request_id: requestId,
          proposed_agent: {
            id: subAgentId,
            name: options.name,
            role: options.role,
            description: options.description,
            icon: options.icon,
            permissions: options.permissions || [],
            lifespan: options.lifespan || 'task_bound',
          },
          reason: options.reason,
        },
      },
      600000
    );

    if (response?.payload?.decision === 'approved') {
      const sub = createSubAgent(subAgentId, options.name, options.role || 'Sub-Agent');
      activeSubAgents.push(sub);
      spawnedThisHour++;
      return sub;
    }

    return null;
  },

  async killAll(reason = 'User requested'): Promise<void> {
    for (const sub of activeSubAgents) {
      await sub.terminate(reason);
    }
    activeSubAgents.length = 0;
  },
};

function createSubAgent(id: string, name: string, role: string): SubAgent {
  return {
    id,
    name,
    role,
    status: 'online',

    async sendTask(task: string) {
      connection?.send({
        type: 'internal_command',
        payload: {
          from: 'parent',
          to: id,
          command: 'task',
          data: { task },
        },
      });
    },

    async waitForResult(timeout = 300000) {
      // Implementation would wait for result message
      return null;
    },

    async terminate(reason = 'Task complete') {
      connection?.send({
        type: 'sub_agent_terminate',
        payload: {
          sub_agent_id: id,
          reason,
          notify_user: true,
        },
      });
      const idx = activeSubAgents.findIndex((s) => s.id === id);
      if (idx !== -1) activeSubAgents.splice(idx, 1);
    },
  };
}

// ============================================================================
// Notify Module
// ============================================================================

export const notify = {
  async send(options: {
    title: string;
    body: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    category?: string;
    actions?: CardAction[];
  }): Promise<void> {
    connection?.send({
      type: 'notification',
      payload: {
        title: options.title,
        body: options.body,
        priority: options.priority || 'normal',
        category: options.category || 'message',
        actions: options.actions || [],
      },
    });
  },
};

// ============================================================================
// Exports
// ============================================================================

export default {
  init,
  connect,
  getPolicy,
  ui,
  status,
  approval,
  policy,
  agents,
  notify,
};
