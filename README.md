# Spawn.wtf

> **The Activity Monitor for AI Agents**

Control your AI agents from your phone. See what they're doing. Approve dangerous actions. Kill runaway processes.

![Spawn.wtf Logo](https://spawn.wtf/logo.png)

---

## What is Spawn?

Spawn is a native iOS/macOS app that gives you a visual interface for your AI agents. Instead of walls of terminal text or Telegram messages, you get:

- 📱 **Rich UI** — Cards, charts, tables, progress indicators
- 🔒 **Safety Controls** — Approve dangerous actions before they execute
- 🤖 **Sub-Agent Visualization** — See agents spawn and manage child processes
- ⚡ **Real-time Status** — Dynamic Island integration, push notifications
- 🎛️ **Permission Management** — Control what agents can do autonomously

---

## Repository Structure

```
spawn-wtf-complete/
├── README.md                    # This file
│
├── docs/
│   ├── PRODUCT-SPEC.md          # Product vision, features, architecture
│   └── UI-SPEC.md               # SwiftUI components, design system
│
├── protocol/
│   └── PROTOCOL.md              # WebSocket protocol, message types,
│                                # sub-agent spawning, auto-spawn mode
│
├── app-mockups/
│   ├── spawn-mockups.html       # Interactive UI mockups (main app)
│   └── spawn-onboarding.html    # Connect agent flow, docs pages
│
└── sdk/
    ├── README.md                # SDK documentation
    ├── package.json             # npm package config
    ├── SKILL.md                 # Agent skill file
    ├── bin/
    │   └── cli.js               # npx spawn-skill CLI
    ├── spawn/
    │   └── __init__.py          # Python SDK
    ├── templates/
    │   ├── SKILL.md
    │   └── spawn/
    │       ├── __init__.py      # Python SDK template
    │       └── index.ts         # TypeScript SDK
    └── examples/
        └── clawdbot_integration.py
```

---

## Quick Start

### 1. Download Spawn App

Get it from the App Store (iOS) or download for Mac.

### 2. Create an Agent

Open the app → Tap **+** → Select "Connect Existing Agent"

### 3. Install the Skill

```bash
cd ~/clawdbot/skills
npx spawn-skill init
```

### 4. Restart Your Agent

```bash
clawdbot restart
```

Your agent appears in the app. Done.

---

## Core Concepts

### Agents vs Sub-Agents

**Agent**: Your main AI process (e.g., Clawdbot running on your Mac Mini)

**Sub-Agent**: A child process spawned by your agent for parallel work

```
Clawdbot (main agent)
├── CodeRewriter (sub-agent)
├── TestRunner (sub-agent)
└── DocGenerator (sub-agent)
```

### Ghost Cards (Spawn Requests)

When an agent wants to spawn a sub-agent, it doesn't just happen. A "ghost card" appears in the UI — translucent, pulsing, waiting for your approval.

You see:
- What the sub-agent wants to do
- What permissions it needs
- Why the parent agent needs it

Tap **Approve** and the ghost card fills in, becoming active.

### Auto-Spawn Mode

For autonomous operation, configure safety limits:

| Mode | Description |
|------|-------------|
| **Off** | Every spawn requires approval |
| **Queue** | Spawns batch up for morning review |
| **Constrained** | Auto-approve within strict limits |
| **Trusted** | Auto-approve from trusted parent agents |
| **Unrestricted** | Full autonomy (dangerous) |

Safety toggles:
- Max concurrent sub-agents
- Forbidden permissions (shell, delete, recursive spawn)
- Protected paths (~/.ssh, ~/.aws, .env files)
- Resource budgets (tokens, tool calls)
- Circuit breakers (pause on errors, require check-in)

### Confirmation Tiers

| Risk Level | UI Treatment |
|------------|--------------|
| **Low** | Tap to confirm |
| **Medium** | Yellow card, tap to confirm |
| **High** | Red card, slide to confirm |
| **Critical** | Red card, Face ID required |

---

## SDK Modules

```python
from spawn import ui, status, approval, policy, agents, notify

# Send rich messages
await ui.send_card(title="Stats", value="$1,234")

# Update status
await status.set("working", "Processing...")

# Request approval
approved = await approval.confirm("Delete logs?", danger_level="high")

# Check user's safety settings
if policy.is_path_forbidden("/etc/passwd"):
    await ui.send_text("Can't access that path")

# Spawn sub-agents
sub = await agents.request_spawn(
    name="TestRunner",
    permissions=[{"scope": "files.read", "path": "/tests/**"}]
)

# Push notifications
await notify.send("Task complete!", priority="high")
```

---

## Protocol Overview

WebSocket connection to `wss://relay.spawn.wtf/v1/agent`

### Key Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `text` | Agent → App | Send text message |
| `card` | Agent → App | Send rich card |
| `confirmation_request` | Agent → App | Request user approval |
| `confirmation_response` | App → Agent | User's decision |
| `agent_spawn_request` | Agent → App | Request to create sub-agent |
| `agent_spawn_response` | App → Agent | Approve/reject spawn |
| `status_update` | Agent → App | Update header status |
| `notification` | Agent → App | Push notification |

See `protocol/PROTOCOL.md` for complete specification.

---

## Design System

### Colors

| Name | Hex | Usage |
|------|-----|-------|
| Spawn Pink | `#ff2d92` | Primary accent, buttons, links |
| Background | `#000000` | App background |
| Card BG | `#1c1c1e` | Card backgrounds |
| Text Primary | `#ffffff` | Main text |
| Text Secondary | `#8e8e93` | Subtle text |
| Success | `#30d158` | Positive states |
| Warning | `#ffd60a` | Caution states |
| Danger | `#ff453a` | Error/destructive states |

### Typography

- **SF Pro Display**: Headlines
- **SF Pro Text**: Body text
- **SF Mono**: Code, tokens

### Components

See `docs/UI-SPEC.md` for SwiftUI implementations of:
- Agent cards (main and sub-agent)
- Ghost cards (spawn requests)
- Confirmation dialogs (all tiers)
- Status indicators
- Progress bars
- Kill switches
- Observability panels

---

## Mockups

Open these HTML files in a browser to see interactive mockups:

- **`app-mockups/spawn-mockups.html`** — Main app screens:
  - Agent chat with sub-agent threads
  - Sidebar navigation
  - Ghost card spawn requests
  - Auto-spawn settings
  - Confirmation cards
  - Dynamic Island states

- **`app-mockups/spawn-onboarding.html`** — Onboarding flow:
  - Create agent screen
  - Get token screen
  - Connected success screen
  - Documentation pages
  - SDK quick reference

---

## Development Roadmap

### Phase 1: MVP
- [ ] iOS app with basic chat
- [ ] WebSocket relay server
- [ ] Python SDK
- [ ] Clawdbot integration

### Phase 2: Safety
- [ ] Confirmation flows (all tiers)
- [ ] Sub-agent spawning
- [ ] Ghost cards
- [ ] Permission scoping

### Phase 3: Autonomy
- [ ] Auto-spawn mode
- [ ] Safety settings panel
- [ ] Circuit breakers
- [ ] Check-in flow
- [ ] Morning summary

### Phase 4: Platform
- [ ] macOS app
- [ ] Agent marketplace
- [ ] TypeScript SDK
- [ ] Public API

---

## Links

- **Website**: https://spawn.wtf
- **Documentation**: https://spawn.wtf/docs
- **GitHub**: https://github.com/spawnwtf
- **Discord**: https://discord.gg/spawnwtf

---

## License

MIT

---

*"The Activity Monitor for the AI era"*
