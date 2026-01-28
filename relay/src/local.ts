/**
 * Local Development Relay Server
 * 
 * Use this for testing locally without deploying to Cloudflare.
 * Run with: npx tsx src/local.ts
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = parseInt(process.env.PORT || '8080');

// In-memory storage (replace with Redis/DB in production)
const tokens = new Map<string, { agentId: string; type: 'agent' | 'app'; userId: string }>();
const agents = new Map<string, { name: string; userId: string; createdAt: number }>();
const policies = new Map<string, any>();
const rooms = new Map<string, { agent?: WebSocket; apps: Set<WebSocket> }>();

// Create HTTP server for REST endpoints
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const json = (data: any, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const getBody = (): Promise<any> => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });

  // Health check
  if (url.pathname === '/' && req.method === 'GET') {
    return json({ service: 'spawn-relay-local', status: 'ok' });
  }

  // Create agent
  if (url.pathname === '/v1/admin/agents' && req.method === 'POST') {
    const { name, userId } = await getBody();
    
    const agentId = `agent_${Math.random().toString(36).slice(2, 14)}`;
    const agentToken = `spwn_sk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const appToken = `spwn_app_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

    tokens.set(agentToken, { agentId, type: 'agent', userId });
    tokens.set(appToken, { agentId, type: 'app', userId });
    agents.set(agentId, { name, userId, createdAt: Date.now() });

    console.log(`✓ Created agent: ${name} (${agentId})`);
    console.log(`  Agent token: ${agentToken}`);
    console.log(`  App token: ${appToken}`);

    return json({ agentId, agentToken, appToken, name });
  }

  // Get agent
  if (url.pathname.match(/^\/v1\/admin\/agents\/agent_/) && req.method === 'GET') {
    const agentId = url.pathname.split('/').pop()!;
    const meta = agents.get(agentId);
    if (!meta) return json({ error: 'Not found' }, 404);
    
    const room = rooms.get(agentId);
    return json({
      agentId,
      ...meta,
      agentConnected: !!room?.agent,
      appConnections: room?.apps.size || 0,
    });
  }

  // Update policy
  if (url.pathname.match(/^\/v1\/admin\/agents\/agent_.*\/policy$/) && req.method === 'PUT') {
    const agentId = url.pathname.split('/')[4];
    const policy = await getBody();
    policies.set(agentId, policy);
    
    // Push to agent
    const room = rooms.get(agentId);
    if (room?.agent?.readyState === WebSocket.OPEN) {
      room.agent.send(JSON.stringify({
        type: 'policy_update',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: policy,
      }));
    }
    
    console.log(`✓ Updated policy for ${agentId}`);
    return json({ success: true });
  }

  json({ error: 'Not found' }, 404);
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const auth = req.headers.authorization?.replace('Bearer ', '');
  
  if (!auth) {
    ws.close(1008, 'No token provided');
    return;
  }

  const tokenData = tokens.get(auth);
  if (!tokenData) {
    ws.close(1008, 'Invalid token');
    return;
  }

  const { agentId, type } = tokenData;
  const isAgent = type === 'agent' || url.pathname.includes('/agent');

  // Get or create room
  if (!rooms.has(agentId)) {
    rooms.set(agentId, { apps: new Set() });
  }
  const room = rooms.get(agentId)!;

  if (isAgent) {
    room.agent = ws;
    console.log(`⚡ Agent connected: ${agentId}`);

    // Notify apps
    broadcast(room, 'app', {
      type: 'agent_status',
      id: `msg_${Date.now()}`,
      ts: Date.now(),
      payload: { status: 'online' },
    });

    // Send policy
    const policy = policies.get(agentId);
    if (policy) {
      ws.send(JSON.stringify({
        type: 'policy_update',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: policy,
      }));
    }
  } else {
    room.apps.add(ws);
    console.log(`📱 App connected to: ${agentId} (${room.apps.size} total)`);

    // Send current status
    ws.send(JSON.stringify({
      type: 'agent_status',
      id: `msg_${Date.now()}`,
      ts: Date.now(),
      payload: { status: room.agent ? 'online' : 'offline' },
    }));

    // Send policy
    const policy = policies.get(agentId);
    if (policy) {
      ws.send(JSON.stringify({
        type: 'policy',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: policy,
      }));
    }
  }

  ws.on('message', (data) => {
    let message: any;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Add metadata
    if (!message.ts) message.ts = Date.now();
    if (!message.id) message.id = `msg_${Date.now()}`;

    if (isAgent) {
      // Agent -> Apps
      broadcast(room, 'app', message);
      console.log(`← Agent: ${message.type}`);
    } else {
      // App -> Agent
      if (message.type === 'policy_update') {
        policies.set(agentId, message.payload);
      }
      
      if (room.agent?.readyState === WebSocket.OPEN) {
        room.agent.send(JSON.stringify(message));
        console.log(`→ App: ${message.type}`);
      }
    }
  });

  ws.on('close', () => {
    if (isAgent) {
      room.agent = undefined;
      console.log(`⚡ Agent disconnected: ${agentId}`);
      
      broadcast(room, 'app', {
        type: 'agent_status',
        id: `msg_${Date.now()}`,
        ts: Date.now(),
        payload: { status: 'offline' },
      });
    } else {
      room.apps.delete(ws);
      console.log(`📱 App disconnected from: ${agentId}`);
    }
  });
});

function broadcast(room: { agent?: WebSocket; apps: Set<WebSocket> }, target: 'agent' | 'app', data: any) {
  const message = JSON.stringify(data);
  
  if (target === 'agent' && room.agent?.readyState === WebSocket.OPEN) {
    room.agent.send(message);
  } else if (target === 'app') {
    for (const socket of room.apps) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║      SPAWN.WTF Local Relay            ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
  console.log(`  HTTP:      http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/v1/agent`);
  console.log(`             ws://localhost:${PORT}/v1/app`);
  console.log('');
  console.log('  Create test agent:');
  console.log(`    curl -X POST http://localhost:${PORT}/v1/admin/agents \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(`      -d '{"name": "Test Agent", "userId": "user_123"}'`);
  console.log('');
});
