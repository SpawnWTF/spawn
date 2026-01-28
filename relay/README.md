# Spawn.wtf Relay Server

WebSocket relay that routes messages between agents and the mobile app.

## Architecture

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Agent         │       │     Relay       │       │     App         │
│   (Mac Mini)    │◄─────►│  (Cloudflare)   │◄─────►│   (iPhone)      │
│                 │  WSS  │                 │  WSS  │                 │
│  spwn_sk_xxx    │       │  Routes by      │       │  spwn_app_xxx   │
│                 │       │  agent_id       │       │                 │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run local server
npx tsx src/local.ts
```

This starts a local relay at `ws://localhost:8080`.

### Create a test agent

```bash
curl -X POST http://localhost:8080/v1/admin/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Agent", "userId": "user_123"}'
```

Returns:
```json
{
  "agentId": "agent_abc123",
  "agentToken": "spwn_sk_...",
  "appToken": "spwn_app_...",
  "name": "Test Agent"
}
```

### Connect an agent

```javascript
const ws = new WebSocket('ws://localhost:8080/v1/agent', {
  headers: { Authorization: 'Bearer spwn_sk_...' }
});

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};

ws.send(JSON.stringify({
  type: 'text',
  payload: { content: 'Hello from agent!' }
}));
```

## Deploy to Cloudflare

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create KV Namespace

```bash
wrangler kv:namespace create TOKENS
```

Copy the ID and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "your-kv-id-here"
```

### 3. Set Secrets

```bash
wrangler secret put ADMIN_API_KEY
# Enter a secure random string
```

### 4. Deploy

```bash
npm run deploy
```

Your relay is now live at `https://spawn-relay.<your-subdomain>.workers.dev`

## API Reference

### WebSocket Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `/v1/agent` | `Bearer spwn_sk_...` | Agent connection |
| `/v1/app` | `Bearer spwn_app_...` | App connection |

### Admin REST API

All admin endpoints require `X-API-Key` header.

#### Create Agent

```
POST /v1/admin/agents
```

```json
{
  "name": "My Agent",
  "userId": "user_123"
}
```

Returns agent tokens.

#### Get Agent Status

```
GET /v1/admin/agents/:agentId
```

Returns agent info and connection status.

#### Update Policy

```
PUT /v1/admin/agents/:agentId/policy
```

Push new safety policy to agent.

#### Regenerate Tokens

```
POST /v1/admin/agents/:agentId/regenerate
```

Invalidates old tokens and creates new ones.

#### Delete Agent

```
DELETE /v1/admin/agents/:agentId
```

Removes agent and disconnects all connections.

## Message Flow

### Agent → App

```
Agent sends:
{
  "type": "text",
  "id": "msg_123",
  "ts": 1706400000,
  "payload": { "content": "Hello!" }
}

Relay forwards to all connected app instances.
```

### App → Agent

```
App sends:
{
  "type": "confirmation_response",
  "id": "msg_456",
  "ts": 1706400001,
  "payload": {
    "request_id": "cfm_789",
    "action": "confirm"
  }
}

Relay forwards to agent.
```

### Policy Updates

When app updates safety settings:

```
App sends:
{
  "type": "policy_update",
  "payload": {
    "autoSpawnMode": "constrained",
    "permissionsForbidden": ["system.shell"]
  }
}

Relay:
1. Stores policy
2. Forwards to agent
```

## Durable Objects

Each agent gets its own Durable Object room:
- Maintains WebSocket connections
- Stores policy
- Handles message routing
- Survives connection drops

## Scaling

Cloudflare Workers + Durable Objects scales automatically:
- Global edge deployment
- Hibernation for idle connections
- Pay only for active usage

Free tier: 100k requests/day, 1GB Durable Objects storage

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_API_KEY` | Yes | Secret for admin API |
| `ENVIRONMENT` | No | `production` or `development` |
