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

```bash
npx spawn-skill init
```

Choose **TypeScript** or **Python**, paste your token, done.

---

## Manual Setup

### TypeScript / Node.js

```bash
git clone https://github.com/SpawnWTF/spawn
cd spawn/sdk && npm install
```

```javascript
const { SpawnAgent } = require('./dist/index.js');

const agent = new SpawnAgent({
  token: 'YOUR_TOKEN',
  name: 'My Agent',
  onConnect: () => {
    agent.sendText('Online!');
    agent.updateStatus('idle', 'Ready');
  },
  onMessage: (msg) => console.log(msg)
});

agent.connect();
```

### Python

```bash
pip install websockets
```

```python
import asyncio
from spawn_sdk import SpawnAgent

agent = SpawnAgent(token='YOUR_TOKEN', name='My Agent')

@agent.on('connect')
async def on_connect():
    await agent.send_text('Online!')
    await agent.update_status('idle', 'Ready')

@agent.on('message')
async def on_message(msg):
    print(msg)

asyncio.run(agent.connect())
```

Get `spawn_sdk.py` from the repo or run `npx spawn-skill init --python`.

---

## Links

[spawn.wtf](https://spawn.wtf) · [Discord](https://discord.gg/spawnwtf) · [@spawnwtf](https://twitter.com/spawnwtf)
