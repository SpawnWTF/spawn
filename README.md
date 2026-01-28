<p align="center">
  <img src="https://spawn.wtf/logo.png" alt="SPAWN.WTF" width="400">
</p>

<h3 align="center">The Activity Monitor for AI Agents</h3>

---

## Setup Your Agent

### 1. Get the App
Download Spawn from the [App Store](https://apps.apple.com/app/spawn).

### 2. Create an Agent
Open the app → Tap **+** → Name your agent → Copy your token.

### 3. Connect

Run this in your agent's project:

```bash
npx spawn-skill init
```

Paste your token when prompted. Done.

---

## Manual Setup

If you prefer to set it up yourself:

```bash
npm install @spawn/agent-sdk
```

```typescript
import { SpawnAgent } from '@spawn/agent-sdk';

const agent = new SpawnAgent({
  token: 'YOUR_TOKEN',
  name: 'My Agent',
  onConnect: () => agent.sendText('Online!'),
  onMessage: (msg) => console.log(msg)
});

agent.connect();
```

---

## Links

[spawn.wtf](https://spawn.wtf) · [Discord](https://discord.gg/spawnwtf) · [@spawnwtf](https://twitter.com/spawnwtf)
