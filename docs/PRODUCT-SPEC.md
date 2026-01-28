# Spawn: Agent-First Communication Platform

## Vision

A Telegram-like interface stripped of human-to-human chat, rebuilt as a native environment for interacting with AI agents. Like Telegram, **users host their own agents**—the platform handles messaging, notifications, and the UI.

Think of it as: **Telegram for AI agents, not humans.**

---

## Architecture Overview

Spawn follows the Telegram bot model: the platform routes messages and handles push notifications, but **agent logic runs on user-provided infrastructure**.

```
┌─────────────────────────────────────────────────────────────┐
│           User's Agent Host (user provides)                 │
├─────────────────────────────────────────────────────────────┤
│  Runs on: Mac • VPS • Home server • Raspberry Pi            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Spawn SDK (open source)                        │    │
│  │  ├─ Agent runtime                                   │    │
│  │  ├─ LLM calls (user's API keys)                     │    │
│  │  ├─ Integrations (Alpaca, etc.)                     │    │
│  │  └─ WebSocket connection to platform                │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ Agent Protocol (WebSocket)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Spawn Platform (we host)                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │
│  │ Message     │ │ APNs Push   │ │ Agent Registry        │  │
│  │ Routing     │ │ Relay       │ │ & Auth                │  │
│  └─────────────┘ └─────────────┘ └───────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ REST / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              iOS / Mac App (client)                         │
├─────────────────────────────────────────────────────────────┤
│  • Chat interface                                           │
│  • Agent configuration UI                                   │
│  • Trade confirmations                                      │
│  • Push notifications                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Responsibility Split

| Component | Who | Responsibilities |
|-----------|-----|------------------|
| **Spawn Platform** | We host | Message routing, push notifications, auth, agent registry |
| **Agent SDK** | We build, user runs | Agent runtime, LLM calls, integrations, protocol handling |
| **iOS/Mac App** | We build | Chat UI, configuration, notifications |
| **Agent Host** | User provides | Compute for 24/7 agent execution |
| **LLM API Keys** | User provides | Anthropic, OpenAI, OpenRouter, etc. |
| **Integration Credentials** | User provides | Alpaca, Google, etc. |

### What We Never See

- User's LLM API keys
- User's integration credentials (Alpaca, etc.)
- Agent system prompts (encrypted end-to-end)
- Full conversation content (only notification text agent chooses to send)

---

## Comparison to Telegram

| Telegram | Spawn |
|----------|-----------|
| BotFather gives you an API token | App gives you an agent token |
| You write bot code, host it yourself | You configure agent, run SDK on your host |
| Telegram routes messages to your webhook | Platform routes messages via WebSocket |
| Telegram sends push notifications | Platform sends push via APNs |
| Bot logic is your code | Agent logic is LLM + your config |
| Bots are stateless | Agents have persistent memory |

---

## Agent Types

### Personal Agents

Agents you create and host yourself. Full control.

**Where they run:** Your Mac, VPS, home server—anywhere running the SDK.

**Examples:** Trading bot, research assistant, code reviewer, personal scheduler

### Sub-Agents

Child agents spawned by a parent agent. Appear as nested conversations (like Slack channels under a workspace).

**Where they run:** Same process as parent agent.

**Examples:** ETH Watcher, BTC Watcher, Risk Monitor (all under a Trading Bot parent)

### Service Agents

Third-party agents hosted by publishers. You subscribe to them.

**Where they run:** Publisher's infrastructure. You just connect.

**Examples:** Premium market analysis, professional translation, specialized research

---

## Information Architecture

### Slack-Like Model

The UI resembles Slack more than Telegram:

```
Slack                     Spawn
─────                     ─────────
Workspace                 Agent Host (your server)
├─ #channel               ├─ Agent
│  └─ thread              │  ├─ Sub-agent (like a channel)
├─ #channel               │  ├─ Sub-agent
└─ DMs                    │  └─ Sub-agent
                          └─ Agent
```

Each parent agent is like a workspace. Sub-agents are channels within it. Users can chat with the parent (orchestration) or directly with sub-agents (specialized tasks).

### Primary Navigation

```
┌─────────────────────────────────────┐
│  [Search]                     [+]   │
├─────────────────────────────────────┤
│                                     │
│  ▼ Trading Bot            ● Online  │
│    │                                │
│    ├─ #eth-watcher        ● Online  │
│    │   Monitoring ETH               │
│    │                                │
│    ├─ #btc-watcher        ● Online  │
│    │   Monitoring BTC               │
│    │                                │
│    ├─ #risk-monitor       ● Online  │
│    │   Portfolio risk               │
│    │                                │
│    └─ #executor           ○ Paused  │
│        Trade execution              │
│                                     │
│  ▶ Research Assistant     ● Online  │
│                                     │
│  ▶ Code Reviewer          ○ Offline │
│                                     │
│  ──────────────────────────────     │
│  🔌 Service Agents                  │
│  ├─ MarketPulse Pro       ● Online  │
│  └─ News Digest           ● Online  │
│                                     │
└─────────────────────────────────────┘
```

Status indicators:
- `● Online` — Agent/sub-agent connected and responding
- `○ Offline` — Not connected (host offline or paused)
- `⚠️ Error` — Connected but reporting errors

### Navigation Behavior

| Action | Result |
|--------|--------|
| Tap parent agent | Open parent chat (orchestration, overview) |
| Tap sub-agent | Open sub-agent chat (dedicated conversation) |
| Tap `▼` / `▶` | Expand / collapse sub-agent list |
| Long-press parent | Agent settings, sub-agent management |
| Long-press sub-agent | Sub-agent settings (pause, configure, delete) |
| Swipe sub-agent | Quick actions (pause / delete) |

---

## Sub-Agent Model

### Why Sub-Agents?

A trading bot isn't one thing—it's several:
- Price monitoring (per asset)
- Risk calculation
- Order execution
- Portfolio reporting

Instead of one monolithic agent, split into specialized sub-agents that:
- Have dedicated chat threads
- Can be paused/resumed independently
- Report to a parent orchestrator
- Are organized hierarchically in the UI

### Hierarchy Rules

```
Agent (top-level)
├── Has own conversation: Yes
├── Has agent token: Yes
├── Runs on: User's host
│
└── Sub-Agent
    ├── Has own conversation: Yes (nested)
    ├── Has agent token: No (inherits parent)
    ├── Runs on: Same process as parent
    ├── Lifetime: Tied to parent
    └── Max depth: 1 (no sub-sub-agents)
```

### Static vs Dynamic Sub-Agents

**Static:** Defined in agent config, always present.

```yaml
# agent.yaml
sub_agents:
  - id: eth_watcher
    name: ETH Watcher
    system_prompt: "Monitor ETH price..."
    
  - id: btc_watcher
    name: BTC Watcher
    system_prompt: "Monitor BTC price..."
```

**Dynamic:** Spawned at runtime based on user requests.

```
User: "start watching SOL and AVAX"

Agent: [spawns sol_watcher and avax_watcher]
       "Done. I've added SOL Watcher and AVAX Watcher."
```

### Communication Patterns

**User ↔ Sub-Agent:** Direct chat in sub-agent's thread.

**Sub-Agent → Parent:** Events (price alerts, errors, status updates).

**Parent → Sub-Agent:** Commands (pause, resume, reconfigure).

**Sub-Agent ↔ Sub-Agent:** Via parent (hub-and-spoke pattern).

```
         ┌─────────────┐
         │   Parent    │
         │   Agent     │
         └──────┬──────┘
                │
     ┌──────────┼──────────┐
     │          │          │
     ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐
│ETH Watch││BTC Watch││Risk Mon │
└─────────┘└─────────┘└─────────┘
```

ETH Watcher can't directly message BTC Watcher. It emits an event to Parent, who routes it.

---

## Parent Agent View

The parent agent's chat serves as mission control:

```
┌─────────────────────────────────────┐
│ ← Trading Bot                  [⋮]  │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Sub-Agents              [+ Add] │ │
│ │                                 │ │
│ │ ● ETH    ● BTC    ● Risk       │ │
│ │ ○ Executor (paused)            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─────── Activity ───────            │
│                                     │
│ 🔔 ETH Watcher                      │
│ ETH up 5.2% — crossed $3,400        │
│                            2:34 PM  │
│                                     │
│ 🔔 Risk Monitor                     │
│ Portfolio risk: MODERATE            │
│ Crypto exposure at 65%              │
│                            2:35 PM  │
│                                     │
│ You                                 │
│ pause all watchers                  │
│                            2:40 PM  │
│                                     │
│ 🤖 Trading Bot                      │
│ Done. All watchers paused.          │
│                            2:40 PM  │
│                                     │
└─────────────────────────────────────┘
```

Parent handles:
- Orchestration commands (`pause all`, `status report`)
- Aggregated activity feed from sub-agents
- Sub-agent management (spawn, terminate)
- Cross-cutting concerns

---

## Sub-Agent View

Each sub-agent has a dedicated chat thread:

```
┌─────────────────────────────────────┐
│ ← #eth-watcher             [⋮] [↑]  │
│   Trading Bot • Online              │
├─────────────────────────────────────┤
│                                     │
│ You                                 │
│ how's eth doing?                    │
│                            2:30 PM  │
│                                     │
│ 🤖 ETH Watcher                      │
│ ┌─────────────────────────────────┐ │
│ │ ETH                    ▲ +5.2%  │ │
│ │ $3,412.50                       │ │
│ │                                 │ │
│ │ 24h Range   $3,050 – $3,420     │ │
│ │ Volume      $12.4B              │ │
│ │ Your Pos.   2.5 ETH ($8,531)    │ │
│ └─────────────────────────────────┘ │
│                            2:30 PM  │
│                                     │
│ You                                 │
│ alert me if it drops below 3200    │
│                            2:31 PM  │
│                                     │
│ 🤖 ETH Watcher                      │
│ ✓ Alert set: ETH < $3,200          │
│   I'll notify you if it triggers.  │
│                            2:31 PM  │
│                                     │
└─────────────────────────────────────┘

  [↑] = Navigate to parent
```

The `[↑]` button navigates back to the parent agent.

---

## Mac as Agent Host

For users who don't want to manage a VPS, the Mac app can run agents locally.

```
┌─────────────────────────────────────────────────────────────┐
│                    Mac App (Dual Role)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │ Chat Interface      │  │ Embedded Agent Host         │   │
│  │ (client)            │  │ (runs when Mac is on)       │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- **iPhone app:** Client only (chat UI)
- **Mac app:** Client + optional embedded host

When Mac sleeps or shuts down, agents go offline. For 24/7 operation, use a VPS.

---

## Getting Started Flow

### Step 1: Create Agent in App

```
┌─────────────────────────────────────┐
│ Create New Agent                    │
├─────────────────────────────────────┤
│                                     │
│ Name                                │
│ ┌─────────────────────────────────┐ │
│ │ Trading Bot                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ System Prompt                       │
│ ┌─────────────────────────────────┐ │
│ │ You are a trading assistant...  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Model                               │
│ [claude-sonnet-4-5            ▼]    │
│                                     │
│                          [Create]   │
└─────────────────────────────────────┘
```

### Step 2: Get Agent Token

```
┌─────────────────────────────────────┐
│ Trading Bot Created ✓               │
├─────────────────────────────────────┤
│                                     │
│ Agent Token (keep secret)           │
│ ┌─────────────────────────────────┐ │
│ │ agt_sk_a1b2c3d4e5f6g7h8...     │ │
│ └─────────────────────────────────┘ │
│                     [Copy] [Reveal] │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Next: Run the SDK on your host      │
│                                     │
│ Quick Start:                        │
│ ┌─────────────────────────────────┐ │
│ │ npx spawn-sdk start \       │ │
│ │   --token agt_sk_...            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Or use Docker, Python, Swift...     │
│ [View Setup Guides]                 │
│                                     │
└─────────────────────────────────────┘
```

### Step 3: Run SDK on Your Host

```bash
# Option A: npx (Node.js)
npx spawn-sdk start --token agt_sk_...

# Option B: Docker
docker run -d \
  -e AGENT_TOKEN=agt_sk_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  spawn/sdk

# Option C: Python
pip install spawn
spawn start --token agt_sk_...

# Option D: Homebrew (runs as launchd service on Mac)
brew install spawn
spawn setup --token agt_sk_...
```

### Step 4: Agent Comes Online

```
┌─────────────────────────────────────┐
│ 🤖 My Agents                        │
├─────────────────────────────────────┤
│                                     │
│ Trading Bot               ● Online  │
│ Connected from: macbook.local       │
│ Uptime: 3 minutes                   │
│                                     │
│ [Open Chat]                         │
│                                     │
└─────────────────────────────────────┘
```

---

## Agent SDK

Open source SDK that runs on user's infrastructure.

### SDK Responsibilities

| Function | Description |
|----------|-------------|
| **Protocol handling** | WebSocket connection to platform, reconnection, heartbeat |
| **Message processing** | Receive user messages, send responses |
| **LLM integration** | Call Anthropic/OpenAI/local with agent's config |
| **Tool execution** | Run integrations (Alpaca, Google, etc.) |
| **Push requests** | Ask platform to send notifications to user's devices |
| **State management** | Persist agent memory, conversation history |

### SDK Configuration

```yaml
# agent.yaml
agent_token: agt_sk_...

llm:
  provider: anthropic
  api_key: ${ANTHROPIC_API_KEY}
  model: claude-sonnet-4-5
  temperature: 0.3

integrations:
  alpaca:
    api_key: ${ALPACA_API_KEY}
    api_secret: ${ALPACA_API_SECRET}
    paper: false

system_prompt: |
  You are a trading assistant that monitors crypto markets
  and executes trades based on the user's strategy.
  
  Rules:
  - Never risk more than 5% of portfolio on a single trade
  - Always use stop losses
  - Require confirmation for trades over $500

tools:
  - name: get_portfolio
    description: Get current portfolio positions
    integration: alpaca
    
  - name: place_order
    description: Place a buy or sell order
    integration: alpaca
    requires_confirmation: true
    confirmation_threshold: 500

schedules:
  - name: market_check
    cron: "*/15 * * * *"  # Every 15 minutes
    action: check_positions_and_opportunities
    
  - name: daily_summary
    cron: "0 16 * * 1-5"  # 4pm on weekdays
    action: send_daily_report
```

### SDK API (for custom implementations)

```typescript
import { SpawnSDK, Message, Tool } from 'spawn-sdk';

const agent = new SpawnSDK({
  token: process.env.AGENT_TOKEN,
  llm: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5',
  },
});

// Define tools the agent can use
agent.tool('get_portfolio', async () => {
  const positions = await alpaca.getPositions();
  return positions;
});

agent.tool('place_order', async ({ symbol, qty, side }) => {
  // SDK automatically handles confirmation flow for flagged tools
  return await alpaca.createOrder({ symbol, qty, side, type: 'market' });
});

// Handle incoming messages
agent.onMessage(async (message: Message, context) => {
  // SDK handles LLM call with system prompt + tools
  // Just return if you want to add custom logic
});

// Scheduled tasks
agent.schedule('0 16 * * 1-5', async () => {
  const summary = await generateDailySummary();
  await agent.sendMessage(summary);
  await agent.notify({
    title: 'Daily Summary Ready',
    body: 'Your portfolio report is ready.',
  });
});

agent.start();
```

---

## Platform API

### Agent ↔ Platform Protocol

WebSocket-based, JSON messages.

#### Connection

```
wss://api.spawn.io/v1/agent/connect
Authorization: Bearer agt_sk_...
```

#### Message Types (Agent → Platform)

```typescript
// Agent sends a message to user
{
  "type": "message",
  "id": "msg_123",
  "content": {
    "text": "Trade executed successfully.",
    "components": [
      {
        "type": "card",
        "props": {
          "title": "BUY 0.5 ETH",
          "subtitle": "Filled at $3,240.50"
        }
      }
    ]
  }
}

// Agent requests push notification
{
  "type": "notify",
  "id": "ntf_456",
  "title": "Trade Executed",
  "body": "Bought 0.5 ETH at $3,240",
  "priority": "high",
  "category": "trade_alert"
}

// Agent requests confirmation from user
{
  "type": "confirmation_request",
  "id": "cfm_789",
  "prompt": "Execute this trade?",
  "details": {
    "action": "BUY 0.5 ETH @ $3,240",
    "stop_loss": "$3,100",
    "take_profit": "$3,500"
  },
  "timeout_seconds": 300,
  "buttons": ["Approve", "Modify", "Reject"]
}

// Agent status update
{
  "type": "status",
  "status": "online",  // online | busy | error
  "metadata": {
    "uptime_seconds": 86400,
    "memory_mb": 256
  }
}
```

#### Message Types (Platform → Agent)

```typescript
// User sends a message
{
  "type": "message",
  "id": "msg_abc",
  "from": "user",
  "content": {
    "text": "Buy some ETH",
    "attachments": []
  },
  "context": {
    "timezone": "America/Los_Angeles",
    "locale": "en-US"
  }
}

// User responds to confirmation
{
  "type": "confirmation_response",
  "confirmation_id": "cfm_789",
  "response": "approve",  // approve | reject | modify
  "modifications": null
}

// Config update (user changed settings in app)
{
  "type": "config_update",
  "changes": {
    "system_prompt": "...",
    "temperature": 0.5
  }
}

// Ping (keepalive)
{
  "type": "ping"
}
```

### App ↔ Platform API

REST + WebSocket for real-time updates.

#### REST Endpoints

```
# Auth
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh

# Agents
POST   /v1/agents                    # Create agent, get token
GET    /v1/agents                    # List user's agents
GET    /v1/agents/:id                # Get agent details
PATCH  /v1/agents/:id                # Update config
DELETE /v1/agents/:id                # Delete agent

# Conversations
GET    /v1/agents/:id/messages       # Get message history
POST   /v1/agents/:id/messages       # Send message to agent

# Push
POST   /v1/devices                   # Register device for push
DELETE /v1/devices/:token            # Unregister device
```

#### WebSocket (Real-time)

```
wss://api.spawn.io/v1/app/connect
Authorization: Bearer <user_jwt>
```

Receives:
- New messages from agents
- Agent status changes (online/offline)
- Confirmation requests

---

## Information Architecture

### Primary Navigation

```
┌─────────────────────────────────────┐
│  [Search Agents]              [+]   │
├─────────────────────────────────────┤
│  📌 Pinned                          │
│  ├─ Trading Bot              ● On   │
│  ├─ Research Agent           ○ Off  │
│  └─ Daily Briefing           ● On   │
├─────────────────────────────────────┤
│  🤖 My Agents                       │
│  ├─ Portfolio Tracker        ● On   │
│  ├─ News Summarizer          ○ Off  │
│  └─ Code Review Bot          ● On   │
├─────────────────────────────────────┤
│  🔌 Service Agents                  │
│  ├─ MarketPulse Pro          ● On   │
│  └─ Crypto Signals           ● On   │
└─────────────────────────────────────┘
```

Status indicators:
- `● On` — Agent connected and responding
- `○ Off` — Agent not connected (host offline)
- `⚠️` — Agent connected but reporting errors

---

## Conversation Interface

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| **Command** | User → Agent | Explicit instruction ("buy 0.5 ETH") |
| **Query** | User → Agent | Request for information ("what's my P&L?") |
| **Report** | Agent → User | Scheduled/triggered update |
| **Alert** | Agent → User | Time-sensitive notification |
| **Confirmation** | Agent → User | Action requires approval before execution |
| **Result** | Agent → User | Output from completed task |

### Confirmation Flow

Critical for trading agents—human-in-the-loop for sensitive actions.

```
┌─────────────────────────────────────┐
│ 🤖 Trading Bot                 2:34p│
├─────────────────────────────────────┤
│ ⚠️ CONFIRMATION REQUIRED            │
│                                     │
│ Ready to execute:                   │
│ ┌─────────────────────────────────┐ │
│ │ BUY 0.5 ETH @ $3,240            │ │
│ │ Stop Loss: $3,100               │ │
│ │ Take Profit: $3,500             │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Estimated cost: $1,620 + fees       │
│                                     │
│ [Approve]  [Modify]  [Reject]       │
│                                     │
│ ⏱️ Auto-reject in 4:32              │
└─────────────────────────────────────┘
```

Flow:
1. Agent calls tool marked `requires_confirmation: true`
2. SDK sends `confirmation_request` to platform
3. Platform pushes notification to user's devices
4. User taps notification, sees confirmation in app
5. User approves/rejects
6. Platform sends `confirmation_response` to agent
7. Agent executes or aborts

### Interactive Components

| Component | Use Case |
|-----------|----------|
| **Buttons** | Single actions, confirmations, quick choices |
| **Quick Replies** | Predefined response options |
| **Forms** | Structured multi-field input |
| **Cards** | Rich previews (stocks, articles, trades) |
| **Charts** | Inline data visualization |
| **Tables** | Structured data display |
| **Code Blocks** | Syntax-highlighted with copy action |
| **Progress Indicators** | Long-running task status |

---

## Agent Configuration Panel

### Overview Tab

```
┌─────────────────────────────────────┐
│ ← Trading Bot                  [⋮]  │
├─────────────────────────────────────┤
│        ┌─────────┐                  │
│        │  🤖     │                  │
│        └─────────┘                  │
│        Trading Bot                  │
│        ● Online                     │
├─────────────────────────────────────┤
│ Host         macbook-pro.local      │
│ Uptime       14d 3h 22m             │
│ Messages     1,247 ↑  892 ↓         │
│ Last Active  2 min ago              │
├─────────────────────────────────────┤
│ Agent Token                         │
│ agt_sk_...4f2a        [Copy] [Regen]│
├─────────────────────────────────────┤
│ [View Logs]  [Restart]   [Delete]   │
└─────────────────────────────────────┘
```

### Config Tab

```
┌─────────────────────────────────────┐
│ Agent Configuration                 │
├─────────────────────────────────────┤
│                                     │
│ System Prompt                       │
│ ┌─────────────────────────────────┐ │
│ │ You are a trading assistant...  │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                          [Edit]     │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Model Defaults                      │
│ Provider        [Anthropic     ▼]   │
│ Model           [claude-sonnet ▼]   │
│ Temperature     [━━━━●━━━━━] 0.3    │
│                                     │
│ Note: LLM credentials stored on     │
│ your agent host, not here.          │
│                                     │
└─────────────────────────────────────┘
```

### Notifications Tab

```
┌─────────────────────────────────────┐
│ Notification Settings               │
├─────────────────────────────────────┤
│ Alerts                              │
│ ├─ Push:    [✓]                     │
│ ├─ Sound:   [✓]                     │
│ └─ Badge:   [✓]                     │
├─────────────────────────────────────┤
│ Trade Confirmations                 │
│ ├─ Push:    [✓]                     │
│ ├─ Sound:   [✓]  (critical)         │
│ └─ Bypass DND: [✓]                  │
├─────────────────────────────────────┤
│ Reports                             │
│ ├─ Push:    [✓]                     │
│ ├─ Sound:   [ ]                     │
│ └─ Badge:   [✓]                     │
├─────────────────────────────────────┤
│ Quiet Hours                         │
│ [✓] Enable   [11:00 PM] - [7:00 AM] │
│ [✓] Allow confirmations through     │
└─────────────────────────────────────┘
```

---

## Security Model

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Trust Domain                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐     │
│  │ Agent Host          │    │ iOS/Mac App             │     │
│  │ • LLM API keys      │    │ • User credentials      │     │
│  │ • Integration creds │    │ • Agent tokens          │     │
│  │ • System prompts    │    │ • Conversation history  │     │
│  │ • Agent logic       │    │ • Config (encrypted)    │     │
│  └─────────────────────┘    └─────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Only: messages, push requests,
                            │       status, encrypted config
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Spawn Platform                          │
├─────────────────────────────────────────────────────────────┤
│  We see:                          We never see:             │
│  • Message text (for routing)     • LLM API keys            │
│  • Push notification content      • Integration credentials │
│  • Agent online/offline status    • Full system prompts     │
│  • User auth tokens               • Trading logic           │
└─────────────────────────────────────────────────────────────┘
```

### What's Encrypted End-to-End

| Data | E2E Encrypted | Notes |
|------|---------------|-------|
| System prompts | Yes | Encrypted before leaving app, decrypted on agent host |
| Agent config | Yes | Sensitive fields only |
| Message content | No* | Platform needs to route; could add E2E option |
| LLM API keys | N/A | Never leave agent host |
| Integration creds | N/A | Never leave agent host |

*For high-security users, E2E encrypted messaging could be a premium feature where platform only sees encrypted blobs.

### Agent Token Security

```
Agent Token: agt_sk_a1b2c3d4e5f6...

• Scoped to single agent
• Can be regenerated (invalidates old token)
• Stored in user's Keychain (app) and agent host
• Platform validates on every WebSocket message
```

### iOS/Mac App Security

| Mechanism | Purpose |
|-----------|---------|
| **Keychain** | Store agent tokens, user credentials |
| **Face ID / Touch ID** | Gate sensitive actions (delete agent, view token) |
| **Data Protection** | Encrypt local data when device locked |
| **Certificate Pinning** | Prevent MITM on platform connection |
| **App Transport Security** | Enforce TLS |

### Agent Host Security (User's Responsibility)

Recommendations in SDK docs:
- Run in Docker with limited permissions
- Use secrets manager for API keys (not plaintext in config)
- Enable firewall, only outbound connections needed
- Keep SDK updated

---

## Platform Infrastructure

### What We Host

| Service | Purpose | Scale Consideration |
|---------|---------|---------------------|
| **WebSocket Gateway** | Agent ↔ Platform connections | Horizontal scale, sticky sessions |
| **Message Router** | Route messages between app and agent | Stateless, easy to scale |
| **APNs Relay** | Send push notifications | Low volume, simple |
| **Auth Service** | User accounts, agent tokens | Standard |
| **Agent Registry** | Track agent metadata, status | PostgreSQL |
| **Message Store** | Conversation history | Optional, can be device-only |

### We Don't Host

- LLM inference
- Agent execution/compute
- User's integration credentials
- Trading logic

### Cost Model

Platform costs scale with:
- Number of connected agents (WebSocket connections)
- Message volume (bandwidth)
- Push notification volume (APNs is essentially free)

Does NOT scale with:
- LLM token usage (user pays their provider)
- Agent compute time (user's infrastructure)
- Integration API calls (user's accounts)

---

## Data Model

### Platform Database

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,  -- Hashed agent token
  config_encrypted BYTEA,    -- E2E encrypted config
  status TEXT DEFAULT 'offline',
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Devices (for push)
CREATE TABLE devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  apns_token TEXT NOT NULL,
  platform TEXT NOT NULL,  -- ios, macos
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages (optional, can be device-only)
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  direction TEXT NOT NULL,  -- inbound, outbound
  content_encrypted BYTEA,  -- Optional E2E encryption
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Device Storage (SwiftData)

```swift
@Model
class Agent {
    @Attribute(.unique) var id: UUID
    var name: String
    var token: String  // Stored in Keychain, reference here
    var status: AgentStatus
    var config: AgentConfig
    var createdAt: Date
}

@Model
class Conversation {
    @Attribute(.unique) var id: UUID
    var agent: Agent
    var messages: [Message]
    var updatedAt: Date
}

@Model
class Message {
    @Attribute(.unique) var id: UUID
    var direction: MessageDirection
    var content: MessageContent
    var createdAt: Date
}
```

---

## Deployment Options for Users

### Quick Start (Non-Technical)

**Mac App as Host**

For users who just want to try it, the Mac app can run agents locally:

```
┌─────────────────────────────────────┐
│ Agent Hosting                       │
├─────────────────────────────────────┤
│                                     │
│ (●) Run on this Mac                 │
│     Agent runs when Mac is awake    │
│     Good for testing                │
│                                     │
│ ( ) Run on external host            │
│     For 24/7 operation              │
│     [Setup Guide]                   │
│                                     │
└─────────────────────────────────────┘
```

### One-Click Deploy (Technical)

Templates for common platforms:

| Platform | Deploy Button | Cost |
|----------|--------------|------|
| Railway | [![Deploy](https://railway.app/button.svg)]() | ~$5/mo |
| Render | [![Deploy](https://render.com/button.svg)]() | ~$7/mo |
| Fly.io | `fly launch` | ~$5/mo |
| DigitalOcean | One-click Droplet | $6/mo |

### Docker (Self-Managed)

```bash
docker run -d \
  --name trading-bot \
  --restart unless-stopped \
  -e AGENT_TOKEN=agt_sk_... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e ALPACA_API_KEY=... \
  -e ALPACA_API_SECRET=... \
  -v ./config:/app/config \
  spawn/sdk:latest
```

### Homebrew (Mac Always-On)

```bash
brew install spawn

# Configure
spawn init --token agt_sk_...

# Run as background service
brew services start spawn
```

---

## Notification System

### Push Flow

```
Agent Host                Platform                 APNs                    iPhone
    │                        │                       │                        │
    │  notify request        │                       │                        │
    │ ──────────────────────►│                       │                        │
    │                        │                       │                        │
    │                        │  HTTP/2 push          │                        │
    │                        │ ─────────────────────►│                        │
    │                        │                       │                        │
    │                        │                       │  deliver               │
    │                        │                       │ ──────────────────────►│
    │                        │                       │                        │
    │  delivery receipt      │                       │                        │
    │ ◄──────────────────────│                       │                        │
    │                        │                       │                        │
```

### Priority Levels

| Level | Behavior | Use Case |
|-------|----------|----------|
| **Critical** | Bypass DND, persistent sound | Trade confirmation needed |
| **High** | Sound + banner | Trade executed, price alert |
| **Normal** | Silent banner + badge | Report ready |
| **Low** | Badge only | Background update |

### Actionable Notifications

```swift
// Confirmation notification with actions
{
  "aps": {
    "alert": {
      "title": "Trade Confirmation",
      "body": "BUY 0.5 ETH @ $3,240"
    },
    "category": "TRADE_CONFIRMATION",
    "sound": "default"
  },
  "agent_id": "...",
  "confirmation_id": "cfm_789"
}

// User can approve/reject directly from notification
UNNotificationCategory(
  identifier: "TRADE_CONFIRMATION",
  actions: [
    UNNotificationAction(identifier: "APPROVE", title: "Approve"),
    UNNotificationAction(identifier: "REJECT", title: "Reject")
  ]
)
```

---

## Workflows (Orchestration)

Workflows chain multiple agents or run scheduled tasks. Defined in SDK config, executed on agent host.

### Example: Morning Briefing

```yaml
# In agent config
workflows:
  morning_briefing:
    schedule: "0 7 * * *"  # 7am daily
    steps:
      - name: get_news
        action: fetch_news
        params:
          topics: [crypto, markets]
          
      - name: check_portfolio
        action: get_portfolio_summary
        
      - name: generate_briefing
        action: llm_generate
        params:
          prompt: |
            Create a morning briefing from:
            News: {{get_news.output}}
            Portfolio: {{check_portfolio.output}}
            
      - name: notify
        action: send_message
        params:
          content: "{{generate_briefing.output}}"
          push:
            title: "Morning Briefing"
            body: "Your daily summary is ready"
```

### Multi-Agent Workflows

Agents can call other agents (if user owns both):

```yaml
workflows:
  trade_pipeline:
    trigger: price_alert
    steps:
      - name: analyze
        agent: research_agent  # Calls another agent
        params:
          query: "Should I buy {{trigger.symbol}}?"
          
      - name: decide
        condition: "{{analyze.recommendation}} == 'buy'"
        action: place_order
        requires_confirmation: true
```

---

## What's Next: Part 2

Part 2 will cover the **Agent Marketplace**:

- Service agents (third-party hosted)
- Discovery and search
- Agent listings and detail pages
- Publishing flow for developers
- Pricing models (subscription, per-use, freemium)
- Reviews and ratings
- Revenue sharing model
