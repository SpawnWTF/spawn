<p align="center">
  <img src="https://spawn.wtf/logo.png" alt="SPAWN.WTF" width="400">
</p>

<h3 align="center">The Activity Monitor for AI Agents</h3>

<p align="center">
  Control your AI agents from your phone. See what they're doing.<br>
  Approve dangerous actions. Kill runaway processes.
</p>

<p align="center">
  <a href="https://spawn.wtf">Website</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#sdk">SDK</a> •
  <a href="https://discord.gg/spawnwtf">Discord</a>
</p>

---

## What is Spawn?

Spawn is a native iOS app that gives you a visual interface for your AI agents. Instead of walls of terminal text, you get:

- **Real-time Status** — See when agents are online, thinking, or idle
- **Rich Messages** — Cards, tables, formatted text from your agents
- **Push Notifications** — Get alerts when agents need attention
- **Chat Interface** — Send commands and receive responses
- **Sub-Agent Trees** — Visualize agent hierarchies and spawning

---

## Quick Start

### 1. Download the App
Get Spawn from the App Store (iOS).

### 2. Create an Agent
Open the app → Tap **+** → Name your agent → Get your token.

### 3. Connect Your Agent

**Option A: Quick Install (NPX)**
```bash
npx spawn-skill init --token YOUR_TOKEN
```

**Option B: SDK Install**
```bash
npm install @spawn/agent-sdk
```

```typescript
import { SpawnAgent } from '@spawn/agent-sdk';

const agent = new SpawnAgent({
  token: 'spwn_sk_xxx',
  name: 'My Agent',
  onConnect: () => agent.sendText('Agent online!'),
  onMessage: (msg) => console.log('Received:', msg)
});

agent.connect();
```

---

## Repository Structure

```
├── relay/          # Cloudflare Workers relay server
├── sdk/            # TypeScript Agent SDK
├── spawn-skill/    # NPX CLI installer
├── docs/           # Product & UI specs
├── protocol/       # WebSocket protocol spec
└── app-mockups/    # Interactive HTML mockups
```

---

## SDK

### Installation

```bash
npm install @spawn/agent-sdk
```

### Basic Usage

```typescript
import { SpawnAgent } from '@spawn/agent-sdk';

const agent = new SpawnAgent({
  token: process.env.SPAWN_TOKEN,
  name: 'My Agent',

  onConnect: () => {
    agent.sendText('Hello from my agent!');
    agent.updateStatus('idle', 'Ready for commands');
  },

  onMessage: (msg) => {
    if (msg.type === 'message') {
      agent.updateStatus('thinking', 'Processing...');
      // Handle the message
      agent.sendText(`You said: ${msg.payload.text}`);
      agent.updateStatus('idle', 'Ready');
    }
  }
});

agent.connect();
```

### Send Rich Cards

```typescript
agent.sendCard({
  title: 'Build Complete',
  subtitle: 'All tests passed',
  style: 'success',
  fields: [
    { label: 'Duration', value: '2m 34s' },
    { label: 'Tests', value: '142 passed' },
    { label: 'Coverage', value: '87%' }
  ],
  footer: 'Completed just now'
});
```

### Push Notifications

```typescript
agent.notify(
  'Task Complete',
  'The deployment finished successfully',
  'normal'  // 'silent' | 'normal' | 'urgent'
);
```

### Status Updates

```typescript
agent.updateStatus('thinking', 'Analyzing code...');
agent.updateStatus('idle', 'Ready');
agent.updateStatus('error', 'Build failed');
```

---

## Relay Server

The relay handles WebSocket connections between agents and the iOS app.

### Deploy to Cloudflare

```bash
cd relay
npm install
npm run deploy
```

### Local Development

```bash
cd relay
npm run dev
```

---

## Protocol

WebSocket connection to `wss://your-relay.workers.dev/v1/agent`

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `auth` | Agent → Relay | Authenticate with token |
| `auth_success` | Relay → Agent | Authentication confirmed |
| `message` | Bidirectional | Text or card messages |
| `status_update` | Agent → Relay | Update agent status |
| `agent_status` | Relay → App | Broadcast status changes |
| `notification` | Agent → Relay | Push notification to app |

### Agent Status

| Status | Description |
|--------|-------------|
| `online` | Agent connected |
| `idle` | Ready and waiting |
| `thinking` | Processing a request |
| `error` | Something went wrong |
| `offline` | Disconnected |

See [`protocol/PROTOCOL.md`](protocol/PROTOCOL.md) for the complete specification.

---

## Design

### Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Spawn Pink | `#ff2d92` | Primary accent |
| Background | `#000000` | App background |
| Card BG | `#1c1c1e` | Card surfaces |
| Success | `#30d158` | Positive states |
| Warning | `#ffd60a` | Caution |
| Danger | `#ff453a` | Errors |

---

## Links

- **Website**: [spawn.wtf](https://spawn.wtf)
- **Discord**: [discord.gg/spawnwtf](https://discord.gg/spawnwtf)
- **Twitter**: [@spawnwtf](https://twitter.com/spawnwtf)

---

## License

MIT

---

<p align="center">
  <i>"The Activity Monitor for the AI era"</i>
</p>
