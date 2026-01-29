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
git clone https://github.com/SpawnWTF/spawn
cd spawn/sdk
npm install
```

Then create a file (e.g. `connect.js`):

```javascript
const { SpawnAgent } = require('./dist/index.js');

const agent = new SpawnAgent({
  token: 'YOUR_TOKEN',
  name: 'My Agent',
  onConnect: () => {
    console.log('Connected!');
    agent.sendText('Agent online!');
  },
  onMessage: (msg) => {
    console.log('Message:', msg);
  }
});

agent.connect();
```

Run it:
```bash
node connect.js
```

---

## Links

[spawn.wtf](https://spawn.wtf) · [Discord](https://discord.gg/spawnwtf) · [@spawnwtf](https://twitter.com/spawnwtf)
