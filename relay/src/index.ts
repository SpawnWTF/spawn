/**
 * Spawn.wtf Relay Server
 * 
 * Routes WebSocket messages between agents and the mobile app.
 * Built on Cloudflare Workers + Durable Objects for global scale.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// ============================================================================
// Types
// ============================================================================

export interface Env {
  AGENT_ROOM: DurableObjectNamespace;
  TOKENS: KVNamespace;
  ADMIN_API_KEY: string;
  ENVIRONMENT: string;
}

interface AgentMeta {
  agentId: string;
  name: string;
  userId: string;
  createdAt: number;
}

interface TokenData {
  agentId: string;
  type: 'agent' | 'app';
  userId: string;
}

// ============================================================================
// Main App
// ============================================================================

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
}));

app.use('*', logger());

// Health check
app.get('/', (c) => {
  return c.json({
    service: 'spawn-relay',
    status: 'ok',
    version: '1.0.0',
    docs: 'https://spawn.wtf/docs/protocol',
  });
});

// ============================================================================
// WebSocket Endpoints
// ============================================================================

/**
 * Agent WebSocket endpoint
 * Agents connect here with their spwn_sk_ token
 */
app.get('/v1/agent', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Validate token
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer spwn_sk_')) {
    return c.json({ error: 'Invalid token format' }, 401);
  }

  const token = auth.replace('Bearer ', '');
  const tokenDataStr = await c.env.TOKENS.get(`token:${token}`);
  
  if (!tokenDataStr) {
    return c.json({ error: 'Unknown or expired token' }, 401);
  }

  const tokenData: TokenData = JSON.parse(tokenDataStr);
  
  if (tokenData.type !== 'agent') {
    return c.json({ error: 'Invalid token type' }, 401);
  }

  // Get or create Durable Object room for this agent
  const roomId = c.env.AGENT_ROOM.idFromName(tokenData.agentId);
  const room = c.env.AGENT_ROOM.get(roomId);

  // Forward request to Durable Object
  const url = new URL(c.req.url);
  url.pathname = '/websocket/agent';
  url.searchParams.set('agentId', tokenData.agentId);
  url.searchParams.set('userId', tokenData.userId);

  return room.fetch(new Request(url, c.req.raw));
});

/**
 * App WebSocket endpoint
 * Mobile app connects here with spwn_app_ token
 */
app.get('/v1/app', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Validate token
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer spwn_app_')) {
    return c.json({ error: 'Invalid token format' }, 401);
  }

  const token = auth.replace('Bearer ', '');
  const tokenDataStr = await c.env.TOKENS.get(`token:${token}`);
  
  if (!tokenDataStr) {
    return c.json({ error: 'Unknown or expired token' }, 401);
  }

  const tokenData: TokenData = JSON.parse(tokenDataStr);
  
  if (tokenData.type !== 'app') {
    return c.json({ error: 'Invalid token type' }, 401);
  }

  // Get Durable Object room
  const roomId = c.env.AGENT_ROOM.idFromName(tokenData.agentId);
  const room = c.env.AGENT_ROOM.get(roomId);

  // Forward request to Durable Object
  const url = new URL(c.req.url);
  url.pathname = '/websocket/app';
  url.searchParams.set('agentId', tokenData.agentId);
  url.searchParams.set('userId', tokenData.userId);

  return room.fetch(new Request(url, c.req.raw));
});

// ============================================================================
// Admin API
// ============================================================================

/**
 * Create a new agent
 * Called by your backend when user creates agent in app
 */
app.post('/v1/admin/agents', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ name: string; userId: string }>();
  const { name, userId } = body;

  if (!name || !userId) {
    return c.json({ error: 'name and userId required' }, 400);
  }

  // Generate IDs and tokens
  const agentId = `agent_${crypto.randomUUID().slice(0, 12)}`;
  const agentToken = `spwn_sk_${crypto.randomUUID().replace(/-/g, '')}`;
  const appToken = `spwn_app_${crypto.randomUUID().replace(/-/g, '')}`;

  // Store token -> data mappings
  const agentTokenData: TokenData = { agentId, type: 'agent', userId };
  const appTokenData: TokenData = { agentId, type: 'app', userId };

  await c.env.TOKENS.put(`token:${agentToken}`, JSON.stringify(agentTokenData));
  await c.env.TOKENS.put(`token:${appToken}`, JSON.stringify(appTokenData));

  // Store agent metadata
  const meta: AgentMeta = {
    agentId,
    name,
    userId,
    createdAt: Date.now(),
  };
  await c.env.TOKENS.put(`agent:${agentId}`, JSON.stringify(meta));

  // Store reverse lookups
  await c.env.TOKENS.put(`agent:${agentId}:agentToken`, agentToken);
  await c.env.TOKENS.put(`agent:${agentId}:appToken`, appToken);

  return c.json({
    agentId,
    agentToken,  // Give to user for their agent SDK
    appToken,    // Used by mobile app to connect
    name,
  });
});

/**
 * Get agent info
 */
app.get('/v1/admin/agents/:agentId', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { agentId } = c.req.param();
  const metaStr = await c.env.TOKENS.get(`agent:${agentId}`);

  if (!metaStr) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const meta: AgentMeta = JSON.parse(metaStr);

  // Get room status
  const roomId = c.env.AGENT_ROOM.idFromName(agentId);
  const room = c.env.AGENT_ROOM.get(roomId);
  const statusRes = await room.fetch(new Request('http://internal/status'));
  const status = await statusRes.json();

  return c.json({
    ...meta,
    ...status,
  });
});

/**
 * Regenerate agent token
 */
app.post('/v1/admin/agents/:agentId/regenerate', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { agentId } = c.req.param();
  const metaStr = await c.env.TOKENS.get(`agent:${agentId}`);

  if (!metaStr) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const meta: AgentMeta = JSON.parse(metaStr);

  // Delete old tokens
  const oldAgentToken = await c.env.TOKENS.get(`agent:${agentId}:agentToken`);
  const oldAppToken = await c.env.TOKENS.get(`agent:${agentId}:appToken`);
  
  if (oldAgentToken) await c.env.TOKENS.delete(`token:${oldAgentToken}`);
  if (oldAppToken) await c.env.TOKENS.delete(`token:${oldAppToken}`);

  // Generate new tokens
  const agentToken = `spwn_sk_${crypto.randomUUID().replace(/-/g, '')}`;
  const appToken = `spwn_app_${crypto.randomUUID().replace(/-/g, '')}`;

  const agentTokenData: TokenData = { agentId, type: 'agent', userId: meta.userId };
  const appTokenData: TokenData = { agentId, type: 'app', userId: meta.userId };

  await c.env.TOKENS.put(`token:${agentToken}`, JSON.stringify(agentTokenData));
  await c.env.TOKENS.put(`token:${appToken}`, JSON.stringify(appTokenData));
  await c.env.TOKENS.put(`agent:${agentId}:agentToken`, agentToken);
  await c.env.TOKENS.put(`agent:${agentId}:appToken`, appToken);

  // Disconnect existing connections
  const roomId = c.env.AGENT_ROOM.idFromName(agentId);
  const room = c.env.AGENT_ROOM.get(roomId);
  await room.fetch(new Request('http://internal/disconnect'));

  return c.json({
    agentId,
    agentToken,
    appToken,
  });
});

/**
 * Delete agent
 */
app.delete('/v1/admin/agents/:agentId', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { agentId } = c.req.param();

  // Delete tokens
  const agentToken = await c.env.TOKENS.get(`agent:${agentId}:agentToken`);
  const appToken = await c.env.TOKENS.get(`agent:${agentId}:appToken`);
  
  if (agentToken) await c.env.TOKENS.delete(`token:${agentToken}`);
  if (appToken) await c.env.TOKENS.delete(`token:${appToken}`);
  
  await c.env.TOKENS.delete(`agent:${agentId}`);
  await c.env.TOKENS.delete(`agent:${agentId}:agentToken`);
  await c.env.TOKENS.delete(`agent:${agentId}:appToken`);

  // Disconnect and cleanup room
  const roomId = c.env.AGENT_ROOM.idFromName(agentId);
  const room = c.env.AGENT_ROOM.get(roomId);
  await room.fetch(new Request('http://internal/disconnect'));

  return c.json({ success: true });
});

/**
 * List user's agents
 */
app.get('/v1/admin/users/:userId/agents', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { userId } = c.req.param();
  
  // In production, you'd use a proper index or database
  // KV list is limited but works for small scale
  const list = await c.env.TOKENS.list({ prefix: 'agent:agent_' });
  const agents: AgentMeta[] = [];

  for (const key of list.keys) {
    if (key.name.includes(':agentToken') || key.name.includes(':appToken')) continue;
    
    const metaStr = await c.env.TOKENS.get(key.name);
    if (metaStr) {
      const meta: AgentMeta = JSON.parse(metaStr);
      if (meta.userId === userId) {
        agents.push(meta);
      }
    }
  }

  return c.json({ agents });
});

/**
 * Update agent policy
 */
app.put('/v1/admin/agents/:agentId/policy', async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (apiKey !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { agentId } = c.req.param();
  const policy = await c.req.json();

  // Store policy
  await c.env.TOKENS.put(`policy:${agentId}`, JSON.stringify(policy));

  // Push to room
  const roomId = c.env.AGENT_ROOM.idFromName(agentId);
  const room = c.env.AGENT_ROOM.get(roomId);
  await room.fetch(new Request('http://internal/policy', {
    method: 'POST',
    body: JSON.stringify(policy),
  }));

  return c.json({ success: true });
});

export default app;

// ============================================================================
// Durable Object: AgentRoom
// ============================================================================

interface RoomState {
  agentId: string;
  policy: any;
  agentConnectedAt: number | null;
  messageCount: number;
}

export class AgentRoom {
  state: DurableObjectState;
  env: Env;
  
  agentSocket: WebSocket | null = null;
  appSockets: Set<WebSocket> = new Set();
  
  roomState: RoomState = {
    agentId: '',
    policy: null,
    agentConnectedAt: null,
    messageCount: 0,
  };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    
    // Restore state from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<RoomState>('roomState');
      if (stored) {
        this.roomState = { ...this.roomState, ...stored };
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal API endpoints
    if (url.pathname === '/status') {
      return Response.json({
        agentConnected: this.agentSocket !== null,
        appConnections: this.appSockets.size,
        agentConnectedAt: this.roomState.agentConnectedAt,
        messageCount: this.roomState.messageCount,
      });
    }

    if (url.pathname === '/disconnect') {
      this.disconnectAll();
      return Response.json({ success: true });
    }

    if (url.pathname === '/policy') {
      const policy = await request.json();
      this.roomState.policy = policy;
      await this.state.storage.put('roomState', this.roomState);
      
      // Notify agent of policy update
      this.sendToAgent({
        type: 'policy_update',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: policy,
      });
      
      return Response.json({ success: true });
    }

    // WebSocket upgrade
    if (url.pathname === '/websocket/agent' || url.pathname === '/websocket/app') {
      const isAgent = url.pathname.includes('/agent');
      const agentId = url.searchParams.get('agentId') || '';
      
      this.roomState.agentId = agentId;

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept with tags for identification
      this.state.acceptWebSocket(server, isAgent ? ['agent'] : ['app']);

      if (isAgent) {
        // Close existing agent connection if any
        if (this.agentSocket) {
          try {
            this.agentSocket.close(1000, 'New connection established');
          } catch {}
        }
        
        this.agentSocket = server;
        this.roomState.agentConnectedAt = Date.now();
        await this.state.storage.put('roomState', this.roomState);

        // Notify apps that agent connected
        this.broadcast({
          type: 'agent_status',
          id: `msg_${Date.now()}`,
          ts: Date.now(),
          payload: {
            agent_id: this.roomState.agentId,
            status: 'online',
            connected_at: this.roomState.agentConnectedAt
          },
        }, 'app');

        // Send current policy to agent
        if (this.roomState.policy) {
          // Will be sent once connection is open via webSocketOpen
        }
      } else {
        this.appSockets.add(server);

        // Send current status to new app connection
        // Will be sent via webSocketOpen
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketOpen(ws: WebSocket) {
    const tags = this.state.getTags(ws);
    const isAgent = tags.includes('agent');

    if (isAgent) {
      // Send policy to agent
      if (this.roomState.policy) {
        ws.send(JSON.stringify({
          type: 'policy_update',
          id: `msg_${Date.now()}`,
          ts: Date.now(),
          payload: this.roomState.policy,
        }));
      }
    } else {
      // Send current status to app
      ws.send(JSON.stringify({
        type: 'agent_status',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: {
          agent_id: this.roomState.agentId,
          status: this.agentSocket ? 'online' : 'offline',
          connected_at: this.roomState.agentConnectedAt,
        },
      }));

      // Send policy
      if (this.roomState.policy) {
        ws.send(JSON.stringify({
          type: 'policy',
          id: `msg_${Date.now()}`,
          ts: Date.now(),
          payload: this.roomState.policy,
        }));
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.state.getTags(ws);
    const isAgent = tags.includes('agent');
    
    let data: any;
    try {
      data = JSON.parse(message as string);
    } catch {
      return; // Invalid JSON, ignore
    }

    this.roomState.messageCount++;

    // Add timestamp if missing
    if (!data.ts) data.ts = Date.now();
    if (!data.id) data.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (isAgent) {
      // Agent -> App: Forward all messages
      this.broadcast(data, 'app');

      // Handle specific message types
      if (data.type === 'get_policy') {
        // Agent requesting policy
        this.sendToAgent({
          type: 'policy',
          id: `msg_${Date.now()}`,
          ts: Date.now(),
          payload: this.roomState.policy || {},
        });
      }
    } else {
      // App -> Agent: Forward most messages
      
      // Handle policy updates from app
      if (data.type === 'policy_update') {
        this.roomState.policy = data.payload;
        await this.state.storage.put('roomState', this.roomState);
      }

      this.sendToAgent(data);
    }

    // Periodically save state
    if (this.roomState.messageCount % 100 === 0) {
      await this.state.storage.put('roomState', this.roomState);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    const tags = this.state.getTags(ws);

    if (tags.includes('agent')) {
      this.agentSocket = null;
      this.roomState.agentConnectedAt = null;
      await this.state.storage.put('roomState', this.roomState);

      // Notify apps
      this.broadcast({
        type: 'agent_status',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: {
          agent_id: this.roomState.agentId,
          status: 'offline',
          disconnected_at: Date.now()
        },
      }, 'app');
    } else {
      this.appSockets.delete(ws);
    }
  }

  async webSocketError(ws: WebSocket, error: Error) {
    console.error('WebSocket error:', error);
    // Let webSocketClose handle cleanup
  }

  // ---- Helpers ----

  sendToAgent(data: any) {
    if (this.agentSocket?.readyState === WebSocket.OPEN) {
      this.agentSocket.send(JSON.stringify(data));
    }
  }

  broadcast(data: any, target: 'agent' | 'app') {
    const message = JSON.stringify(data);

    if (target === 'agent') {
      this.sendToAgent(data);
    } else {
      for (const socket of this.appSockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    }
  }

  disconnectAll() {
    if (this.agentSocket) {
      try {
        this.agentSocket.close(1000, 'Room closed');
      } catch {}
      this.agentSocket = null;
    }

    for (const socket of this.appSockets) {
      try {
        socket.close(1000, 'Room closed');
      } catch {}
    }
    this.appSockets.clear();
  }
}
