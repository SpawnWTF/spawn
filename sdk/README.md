# Spawn Agent SDK

Connect your AI agent to the [Spawn](https://spawn.wtf) mobile app.

## What is Spawn?

Spawn is a native iOS/macOS app for controlling AI agents. Instead of terminal output or Telegram messages, your agent gets:

- **Rich UI** - Cards, charts, tables, not just text
- **Approval flows** - Confirm sensitive actions with slide-to-confirm
- **Sub-agent visualization** - See your agent spawn and manage helpers
- **Safety settings** - Configure what your agent can do autonomously
- **Push notifications** - Get alerted when your agent needs you

## TypeScript/Node.js SDK

### Installation

```bash
npm install @spawn/agent-sdk
# or
yarn add @spawn/agent-sdk
```

### Quick Start

```typescript
import { SpawnAgent } from '@spawn/agent-sdk';

const agent = new SpawnAgent({
  token: 'spwn_sk_your_token_here',
  name: 'MyAgent',

  onConnect: () => {
    console.log('Connected to Spawn relay!');
    agent.sendText('Hello from the agent!');
    agent.updateStatus('idle', 'Ready for commands');
  },

  onMessage: (msg) => {
    console.log('Received:', msg.type, msg.payload);

    if (msg.type === 'message') {
      // Handle user messages
      const text = (msg.payload as any).text;
      agent.sendText(`You said: "${text}"`);
    }
  },

  onDisconnect: () => {
    console.log('Disconnected');
  },
});

// Connect to the relay
await agent.connect();
```

### API Reference

#### `SpawnAgent(config)`

Create a new agent instance.

**Config Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `token` | `string` | Yes | Your agent token (`spwn_sk_xxx`) |
| `relayUrl` | `string` | No | WebSocket URL (defaults to production) |
| `name` | `string` | No | Agent display name |
| `debug` | `boolean` | No | Enable debug logging |
| `onConnect` | `() => void` | No | Called when connected |
| `onMessage` | `(msg) => void` | No | Called on incoming messages |
| `onDisconnect` | `() => void` | No | Called when disconnected |
| `onError` | `(error) => void` | No | Called on errors |

#### Methods

##### `connect(): Promise<void>`

Connect to the Spawn relay. Returns a promise that resolves when connected.

```typescript
await agent.connect();
```

##### `disconnect(): void`

Disconnect from the relay.

```typescript
agent.disconnect();
```

##### `isConnected(): boolean`

Check if currently connected.

```typescript
if (agent.isConnected()) {
  agent.sendText('Still connected!');
}
```

##### `sendText(content: string, format?: 'plain' | 'markdown'): void`

Send a text message to the app.

```typescript
agent.sendText('Hello!');
agent.sendText('**Bold** and *italic*', 'markdown');
```

##### `sendCard(card: CardPayload): void`

Send a rich card with fields and actions.

```typescript
agent.sendCard({
  title: 'Build Status',
  subtitle: 'Project Alpha',
  style: 'success', // 'default' | 'success' | 'warning' | 'error' | 'info'
  fields: [
    { label: 'Status', value: 'Passing' },
    { label: 'Duration', value: '2m 34s' },
    { label: 'Tests', value: '142 passed' },
  ],
  actions: [
    { id: 'view-logs', label: 'View Logs' },
    { id: 'rebuild', label: 'Rebuild', style: 'primary' },
  ],
  footer: 'Last updated: just now',
});
```

##### `updateStatus(status: AgentStatus, label?: string): void`

Update the agent's status displayed in the app header.

```typescript
agent.updateStatus('idle', 'Ready for commands');
agent.updateStatus('thinking', 'Processing request...');
agent.updateStatus('working', 'Building project...');
agent.updateStatus('error', 'Build failed');
```

##### `notify(title: string, body: string, priority?: 'low' | 'normal' | 'high'): void`

Send a push notification to the user's device.

```typescript
agent.notify('Build Complete', 'Your project built successfully!', 'normal');
agent.notify('Error', 'Build failed. Tap to view.', 'high');
```

##### `requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationResponse>`

Request user confirmation or selection. Returns a promise that resolves when the user responds.

```typescript
const response = await agent.requestConfirmation({
  title: 'Deploy to production?',
  description: 'This will deploy version 2.1.0 to all servers.',
  options: [
    { id: 'confirm', label: 'Deploy', style: 'primary' },
    { id: 'cancel', label: 'Cancel' },
  ],
  timeout_ms: 60000, // Auto-dismiss after 1 minute
  allow_dismiss: true,
});

if (response.selected_option_id === 'confirm') {
  await deployToProduction();
} else {
  agent.sendText('Deployment cancelled.');
}
```

### Types

The SDK exports all TypeScript types for full type safety:

```typescript
import type {
  SpawnMessage,
  CardPayload,
  CardField,
  CardAction,
  ConfirmationRequest,
  ConfirmationResponse,
  AgentStatus,
  NotificationPriority,
} from '@spawn/agent-sdk';
```

### Example: Echo Bot

```typescript
import { SpawnAgent } from '@spawn/agent-sdk';

const agent = new SpawnAgent({
  token: process.env.SPAWN_TOKEN!,
  name: 'EchoBot',

  onConnect: () => {
    agent.sendText('EchoBot is online!');
    agent.updateStatus('idle');
  },

  onMessage: (msg) => {
    if (msg.type === 'message') {
      const text = (msg.payload as any).text || '';

      agent.updateStatus('thinking');

      setTimeout(() => {
        agent.sendText(`Echo: ${text}`);
        agent.updateStatus('idle');
      }, 500);
    }
  },
});

agent.connect();

// Keep running
process.on('SIGINT', () => {
  agent.disconnect();
  process.exit();
});
```

---

## Python SDK

### Installation

```bash
pip install spawn
```

Or just use the SDK included in this skill folder.

### Basic Usage

```python
import spawn
from spawn import ui, status, approval, policy

# Initialize
spawn.init()  # Reads SPAWN_TOKEN from env
await spawn.connect()

# Send messages
await ui.send_text("Hello from your agent!")

await ui.send_card(
    title="Portfolio Value",
    value="$12,345.67",
    value_color="green",
    fields=[
        {"label": "24h Change", "value": "+5.2%"},
        {"label": "Holdings", "value": "3 assets"},
    ]
)

# Update status
await status.set("working", "Processing files...")

# Request approval
approved = await approval.confirm(
    title="Delete old logs?",
    message="This will remove 47 files older than 30 days.",
    danger_level="medium"
)

if approved:
    delete_logs()
```

### Modules

| Module | Purpose |
|--------|---------|
| `ui` | Send rich messages (text, cards, tables, charts) |
| `status` | Update agent status in header |
| `approval` | Request user confirmation |
| `policy` | Check user's safety settings |
| `agents` | Spawn and manage sub-agents |
| `notify` | Send push notifications |
| `progress` | Show progress indicators |
| `checkin` | Handle long session check-ins |

### Respecting User Settings

The user configures safety settings in the app. Your agent should respect them:

```python
from spawn import policy, approval, ui

async def write_file(path, content):
    # Check if path is forbidden
    if policy.is_path_forbidden(path):
        await ui.send_text(f"Can't write to {path} - it's in your protected paths.")
        return

    # Check if action requires approval
    if policy.requires_approval("files.write"):
        approved = await approval.confirm(
            title=f"Write to {path}?",
            danger_level="low"
        )
        if not approved:
            return

    # Safe to proceed
    do_write(path, content)
```

### Spawning Sub-Agents

```python
from spawn import agents

# Request to spawn (may require user approval)
sub = await agents.request_spawn(
    name="TestRunner",
    role="QA Engineer",
    permissions=[
        {"scope": "files.read", "path": "/tests/**"},
        {"scope": "process.execute", "command": "pytest"},
    ],
    lifespan="task_bound",
    reason="Run tests in parallel while I refactor"
)

if sub:
    await sub.send_task("Run all unit tests")
    result = await sub.wait_for_result()
    await sub.terminate()
```

---

## CLI Commands

```bash
# Set up the skill
npx spawn-skill init

# Update to latest version
npx spawn-skill upgrade

# Check installation status
npx spawn-skill status

# Show help
npx spawn-skill help
```

## FAQ

### Will this affect my existing agent setup?

No. Spawn is additive - it doesn't change how your agent runs. It just adds a new communication channel alongside whatever you're already using (terminal, Telegram, etc.).

### Can I still use Telegram?

Yes! Many users run both. Use Telegram for quick commands, Spawn for complex tasks and approvals.

### What agents are supported?

Any agent that can run Python or Node.js code:
- Claude Code agents
- Custom LangChain agents
- AutoGPT
- Any Python/Node agent

### Is my data secure?

- Messages are end-to-end encrypted
- Your token is like a password - never share it
- You can regenerate your token anytime in the app
- We never see your agent's actions or data

## Links

- [Spawn App](https://spawn.wtf)
- [Documentation](https://spawn.wtf/docs)
- [API Reference](https://spawn.wtf/docs/api)

## License

MIT
