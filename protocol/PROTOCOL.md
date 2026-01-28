# Spawn Protocol Specification

**Version:** 1.0.0-draft  
**Status:** Draft  
**Last Updated:** January 2026

---

## Overview

The Spawn Protocol defines the communication contract between three components:

1. **Host** — User's infrastructure running the Agent SDK
2. **Relay** — Spawn's WebSocket routing server
3. **App** — iOS/macOS client application

The protocol is designed for:
- Natural conversation with structured responses
- Minimal relay logic (routes encrypted blobs)
- Rich UI rendering (structured JSON → native components)
- Human-in-the-loop confirmation flows
- Zero-knowledge of user credentials

---

## Design Principles

### Chat, Not Commands

Users can talk naturally or use slash commands—the agent handles both:

```
User: "how's my portfolio doing?"     →  Agent interprets, sends portfolio card
User: "/portfolio"                    →  Agent sends portfolio card directly

User: "buy half an eth"               →  Agent interprets, sends trade confirmation
User: "/buy ETH 0.5"                  →  Agent sends trade confirmation directly
```

Commands are shortcuts, not requirements. The LLM handles natural language → intent.

### Structured Responses

Agents don't just reply with text. They send structured UI components:
- Cards (stats, summaries)
- Charts (time series, portfolios)
- Tables (positions, transactions)
- Confirmations (approve/reject flows)
- Input forms (collect structured data)

### Human-in-the-Loop

High-stakes actions require explicit approval. The protocol defines confirmation flows with danger levels, timeouts, and biometric requirements.

---

## Transport Layer

### Connection

All connections use WebSocket over TLS 1.3.

```
Host  ←→  wss://relay.spawn.io/v1/agent
App   ←→  wss://relay.spawn.io/v1/client
```

### Authentication

**Host → Relay:**
```
GET /v1/agent
Authorization: Bearer <AGENT_TOKEN>
X-Agent-Version: 1.0.0
```

**App → Relay:**
```
GET /v1/client
Authorization: Bearer <USER_JWT>
X-Client-Version: 1.0.0
X-Platform: ios | macos
```

### Heartbeat

Both Host and App send pings every 30 seconds. Relay responds with pong. Connection considered dead after 90 seconds of silence.

```json
{"type": "ping", "ts": 1706400000}
{"type": "pong", "ts": 1706400000}
```

---

## Encryption Layer

### Key Exchange

On first connection, Host and App perform ECDH key exchange via Relay.

```
Host                     Relay                    App
  │                        │                        │
  │  key_exchange          │                        │
  │  {host_public_key}     │                        │
  │ ──────────────────────►│                        │
  │                        │  key_exchange          │
  │                        │  {host_public_key}     │
  │                        │ ──────────────────────►│
  │                        │                        │
  │                        │  key_exchange          │
  │                        │  {app_public_key}      │
  │                        │◄────────────────────── │
  │  key_exchange          │                        │
  │  {app_public_key}      │                        │
  │◄────────────────────── │                        │
  │                        │                        │
  │  [Both derive shared secret via ECDH]           │
  │  [All subsequent messages encrypted]            │
```

### Message Encryption

After key exchange, message payloads are encrypted with ChaCha20-Poly1305.

```json
{
  "type": "encrypted",
  "agent_id": "ag_8f7d9a...",
  "nonce": "base64...",
  "ciphertext": "base64...",
  "tag": "base64..."
}
```

Relay forwards encrypted blobs without inspection.

### Notification Hints (Unencrypted)

For push notifications, Host can include optional cleartext hints:

```json
{
  "type": "encrypted",
  "agent_id": "ag_8f7d9a...",
  "nonce": "...",
  "ciphertext": "...",
  "notification_hint": {
    "title": "Trade Confirmation",
    "body": "BUY 0.5 ETH @ $3,240",
    "priority": "high",
    "category": "confirmation"
  }
}
```

User can disable hints for full privacy (generic "Agent requires attention" notifications).

---

## Message Envelope

All decrypted messages follow this envelope:

```json
{
  "type": "<message_type>",
  "id": "<unique_message_id>",
  "ts": 1706400000,
  "payload": { ... }
}
```

### ID Format

Message IDs are client-generated UUIDs or prefixed strings:

```
msg_a1b2c3d4e5f6      # General message
cfm_x7y8z9w0          # Confirmation request
inp_m1n2o3p4          # Input request
prg_q5r6s7t8          # Progress indicator
```

### Direction Convention

- **Upstream:** App → Relay → Host
- **Downstream:** Host → Relay → App

---

## Upstream Messages (App → Host)

### `message`

User sends a message to the agent. Can be natural language or a command.

```json
{
  "type": "message",
  "id": "msg_abc123",
  "ts": 1706400000,
  "payload": {
    "text": "how's my portfolio doing?",
    "context": {
      "timezone": "America/Los_Angeles",
      "locale": "en-US"
    }
  }
}
```

With a slash command:

```json
{
  "type": "message",
  "id": "msg_def456",
  "ts": 1706400000,
  "payload": {
    "text": "/buy ETH 0.5",
    "context": {
      "timezone": "America/Los_Angeles",
      "locale": "en-US"
    }
  }
}
```

The SDK parses slash commands if present; otherwise the LLM interprets intent.

### `input_response`

User responds to an input request (form, password, date picker).

```json
{
  "type": "input_response",
  "id": "msg_ghi789",
  "ts": 1706400000,
  "payload": {
    "request_id": "inp_789",
    "values": {
      "api_key": "sk-...",
      "environment": "production"
    }
  }
}
```

### `confirmation_response`

User responds to a confirmation request.

```json
{
  "type": "confirmation_response",
  "id": "msg_jkl012",
  "ts": 1706400000,
  "payload": {
    "request_id": "cfm_456",
    "action": "confirm",
    "modifications": null
  }
}
```

| `action` | Meaning |
|----------|---------|
| `confirm` | Proceed with action |
| `cancel` | Abort action |
| `modify` | Proceed with changes (see `modifications`) |

### `action_response`

User taps an action button on a card or other component.

```json
{
  "type": "action_response",
  "id": "msg_mno345",
  "ts": 1706400000,
  "payload": {
    "message_id": "msg_xyz789",
    "action": "view_logs"
  }
}
```

### `attachment`

User sends a file to the agent.

```json
{
  "type": "attachment",
  "id": "msg_pqr678",
  "ts": 1706400000,
  "payload": {
    "filename": "data.csv",
    "mime_type": "text/csv",
    "size_bytes": 4096,
    "data": "base64..."
  }
}
```

For large files (>1MB), use chunked upload:

```json
{
  "type": "attachment_chunk",
  "id": "msg_stu901",
  "ts": 1706400000,
  "payload": {
    "upload_id": "upl_abc123",
    "chunk_index": 0,
    "total_chunks": 5,
    "data": "base64..."
  }
}
```

### `typing`

User is typing (optional, for UI feedback).

```json
{
  "type": "typing",
  "id": "msg_vwx234",
  "ts": 1706400000,
  "payload": {
    "is_typing": true
  }
}
```

### `cancel`

User cancels a pending operation.

```json
{
  "type": "cancel",
  "id": "msg_yza567",
  "ts": 1706400000,
  "payload": {
    "target_id": "prg_123"
  }
}
```

---

## Downstream Messages (Host → App)

### `text`

Simple text response.

```json
{
  "type": "text",
  "id": "msg_bcd890",
  "ts": 1706400000,
  "payload": {
    "content": "Your portfolio is up 2.3% today. Want me to break it down?",
    "format": "plain"
  }
}
```

With markdown:

```json
{
  "type": "text",
  "id": "msg_efg123",
  "ts": 1706400000,
  "payload": {
    "content": "Here's what I found:\n\n**ETH** is up 5.2%\n**BTC** is down 1.1%",
    "format": "markdown"
  }
}
```

### `card`

Rich card UI element.

```json
{
  "type": "card",
  "id": "msg_hij456",
  "ts": 1706400000,
  "payload": {
    "style": "default",
    "title": "Server Health",
    "subtitle": "us-east-1",
    "icon": "server",
    "value": {
      "text": "94%",
      "color": "green"
    },
    "fields": [
      {"label": "CPU", "value": "23%"},
      {"label": "Memory", "value": "67%"},
      {"label": "Disk", "value": "45%"}
    ],
    "actions": [
      {"id": "view_logs", "label": "View Logs", "style": "secondary"},
      {"id": "restart", "label": "Restart", "style": "destructive"}
    ]
  }
}
```

#### Card Styles

| Style | Description |
|-------|-------------|
| `default` | Standard card |
| `compact` | Minimal height, inline |
| `hero` | Large featured card |
| `stat` | Single big number |

#### Card Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `style` | enum | No | Card style (default: `default`) |
| `title` | string | Yes | Primary title |
| `subtitle` | string | No | Secondary text |
| `icon` | string | No | Icon identifier |
| `image` | object | No | `{url, alt, aspect_ratio}` |
| `value` | object | No | `{text, color, size}` |
| `fields` | array | No | `[{label, value, color}]` |
| `footer` | string | No | Footer text |
| `actions` | array | No | Action buttons |

### `chart`

Data visualization.

```json
{
  "type": "chart",
  "id": "msg_klm789",
  "ts": 1706400000,
  "payload": {
    "chart_type": "line",
    "title": "Portfolio Value (7d)",
    "size": "medium",
    "x_axis": {
      "type": "category",
      "label": "Date",
      "values": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    "y_axis": {
      "type": "number",
      "label": "USD",
      "format": "currency",
      "min": 9000,
      "max": 12000
    },
    "series": [
      {
        "name": "Total",
        "color": "#3B82F6",
        "values": [10000, 10234, 10189, 10456, 10678, 10543, 10891]
      }
    ],
    "annotations": [
      {
        "type": "line",
        "value": 10500,
        "label": "Target",
        "style": "dashed"
      }
    ]
  }
}
```

#### Chart Types

| Type | Description |
|------|-------------|
| `line` | Line chart |
| `area` | Filled line chart |
| `bar` | Vertical bar chart |
| `horizontal_bar` | Horizontal bar chart |
| `pie` | Pie chart |
| `donut` | Donut chart |
| `candlestick` | OHLC candlestick (for trading) |
| `sparkline` | Minimal inline chart (no axes) |

#### Chart Sizes

| Size | Description |
|------|-------------|
| `small` | Inline, ~100px height |
| `medium` | Standard, ~200px height |
| `large` | Expanded, ~300px height |
| `fullscreen` | Tappable to expand |

### `table`

Structured data table.

```json
{
  "type": "table",
  "id": "msg_nop012",
  "ts": 1706400000,
  "payload": {
    "title": "Open Positions",
    "columns": [
      {"key": "symbol", "label": "Symbol", "width": "auto"},
      {"key": "qty", "label": "Qty", "align": "right"},
      {"key": "entry", "label": "Entry", "align": "right", "format": "currency"},
      {"key": "current", "label": "Current", "align": "right", "format": "currency"},
      {"key": "pnl", "label": "P&L", "align": "right", "format": "currency_delta"}
    ],
    "rows": [
      {"symbol": "ETH", "qty": "2.5", "entry": 3100, "current": 3240, "pnl": 350},
      {"symbol": "BTC", "qty": "0.1", "entry": 42000, "current": 41500, "pnl": -50}
    ],
    "summary": {
      "label": "Total P&L",
      "value": 300,
      "format": "currency_delta"
    },
    "actions": [
      {"id": "close_all", "label": "Close All", "style": "destructive"}
    ]
  }
}
```

#### Format Types

| Format | Example |
|--------|---------|
| `text` | As-is |
| `number` | `1,234.56` |
| `currency` | `$1,234.56` |
| `currency_delta` | `+$234.50` (green) / `-$45.20` (red) |
| `percent` | `12.5%` |
| `percent_delta` | `+5.2%` (green) / `-1.1%` (red) |
| `date` | `Jan 27, 2026` |
| `datetime` | `Jan 27, 2026 2:34 PM` |
| `relative_time` | `5 minutes ago` |

### `confirmation_request`

Request user approval for a high-stakes action.

```json
{
  "type": "confirmation_request",
  "id": "msg_qrs345",
  "ts": 1706400000,
  "payload": {
    "request_id": "cfm_456",
    "title": "Execute Trade?",
    "danger_level": "high",
    "timeout_seconds": 300,
    "expires_at": 1706400300,
    "summary": "Buy 0.5 ETH at market price",
    "details": [
      {"label": "Action", "value": "BUY"},
      {"label": "Asset", "value": "ETH"},
      {"label": "Quantity", "value": "0.5"},
      {"label": "Price", "value": "~$3,240.00"},
      {"label": "Total", "value": "~$1,620.00"},
      {"label": "Stop Loss", "value": "$3,100.00"},
      {"label": "Take Profit", "value": "$3,500.00"}
    ],
    "warnings": [
      "Market is volatile. Price may differ from estimate."
    ],
    "options": [
      {"id": "cancel", "label": "Cancel", "style": "secondary"},
      {"id": "modify", "label": "Modify", "style": "secondary"},
      {"id": "confirm", "label": "Approve", "style": "primary"}
    ],
    "requires_slide": true,
    "requires_biometric": false
  }
}
```

#### Danger Levels

| Level | UI Treatment |
|-------|--------------|
| `low` | Standard card, tap to confirm |
| `medium` | Yellow accent, tap to confirm |
| `high` | Red accent, slide to confirm |
| `critical` | Red accent, slide + Face ID/Touch ID |

#### Confirmation Options Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Action identifier (`confirm`, `cancel`, `modify`, or custom) |
| `label` | string | Button text |
| `style` | enum | `primary`, `secondary`, `destructive` |

### `input_request`

Request structured input from user. The input bar transforms to match.

```json
{
  "type": "input_request",
  "id": "msg_tuv678",
  "ts": 1706400000,
  "payload": {
    "request_id": "inp_789",
    "title": "Configure Alert",
    "description": "Set up a price alert for notifications.",
    "fields": [
      {
        "key": "symbol",
        "label": "Asset",
        "type": "select",
        "options": [
          {"value": "ETH", "label": "Ethereum (ETH)"},
          {"value": "BTC", "label": "Bitcoin (BTC)"},
          {"value": "SOL", "label": "Solana (SOL)"}
        ],
        "required": true
      },
      {
        "key": "price",
        "label": "Target Price",
        "type": "currency",
        "currency": "USD",
        "required": true,
        "placeholder": "0.00"
      },
      {
        "key": "direction",
        "label": "Trigger When",
        "type": "select",
        "options": [
          {"value": "above", "label": "Price goes above"},
          {"value": "below", "label": "Price goes below"}
        ],
        "required": true
      },
      {
        "key": "note",
        "label": "Note (optional)",
        "type": "text",
        "multiline": true,
        "placeholder": "Remind me why..."
      }
    ],
    "submit_label": "Create Alert",
    "cancel_label": "Cancel"
  }
}
```

#### Input Field Types

| Type | Renders As | Additional Props |
|------|------------|------------------|
| `text` | Text field | `multiline`, `max_length`, `placeholder` |
| `password` | Secure text field | `placeholder` |
| `number` | Number input | `min`, `max`, `step`, `placeholder` |
| `currency` | Currency input | `currency`, `placeholder` |
| `percent` | Percentage input | `min`, `max`, `placeholder` |
| `date` | Date picker | `min_date`, `max_date` |
| `time` | Time picker | `min_time`, `max_time` |
| `datetime` | Date + time picker | `min`, `max` |
| `select` | Dropdown picker | `options[]` |
| `multiselect` | Multi-select | `options[]`, `max_selections` |
| `toggle` | Boolean switch | `default` |
| `slider` | Range slider | `min`, `max`, `step`, `default` |

### `progress`

Show progress of a long-running operation.

```json
{
  "type": "progress",
  "id": "msg_wxy901",
  "ts": 1706400000,
  "payload": {
    "request_id": "prg_123",
    "title": "Analyzing Market Data",
    "status": "running",
    "progress": 0.65,
    "message": "Processing historical trades...",
    "steps": [
      {"label": "Fetching data", "status": "complete"},
      {"label": "Processing", "status": "running", "progress": 0.7},
      {"label": "Generating report", "status": "pending"}
    ],
    "started_at": 1706399900,
    "estimated_completion": 1706400060,
    "cancelable": true
  }
}
```

Update progress with same `request_id`:

```json
{
  "type": "progress",
  "id": "msg_zab234",
  "ts": 1706400030,
  "payload": {
    "request_id": "prg_123",
    "status": "complete",
    "progress": 1.0,
    "message": "Analysis complete!",
    "result": {
      "type": "card",
      "payload": { ... }
    }
  }
}
```

#### Progress Status

| Status | Meaning |
|--------|---------|
| `pending` | Not started |
| `running` | In progress |
| `complete` | Finished successfully |
| `failed` | Finished with error |
| `cancelled` | Cancelled by user |

### `status_update`

Update the agent's status in the header bar.

```json
{
  "type": "status_update",
  "id": "msg_cde567",
  "ts": 1706400000,
  "payload": {
    "status": "trading",
    "label": "Executing order...",
    "detail": "ETH market buy"
  }
}
```

#### Status Values

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| `idle` | ○ | gray | Ready for input |
| `thinking` | ◐ | blue | Processing / LLM inference |
| `working` | ◑ | blue | Executing task |
| `trading` | ◑ | yellow | Financial operation |
| `waiting` | ◔ | gray | Waiting for external response |
| `error` | ● | red | Error state |
| `success` | ● | green | Operation complete (temporary) |

### `capabilities`

Declare agent capabilities (sent on connection and after updates).

```json
{
  "type": "capabilities",
  "id": "msg_fgh890",
  "ts": 1706400000,
  "payload": {
    "name": "Trading Bot",
    "description": "Monitors markets and executes trades",
    "version": "1.2.0",
    "commands": [
      {
        "command": "/status",
        "description": "Check portfolio and market status",
        "examples": ["how am I doing?", "portfolio update"]
      },
      {
        "command": "/buy",
        "description": "Buy an asset",
        "args": [
          {"name": "symbol", "type": "string", "required": true, "description": "Asset symbol"},
          {"name": "amount", "type": "number", "required": true, "description": "Quantity to buy"}
        ],
        "examples": ["buy some eth", "purchase 0.5 BTC"]
      },
      {
        "command": "/sell",
        "description": "Sell an asset",
        "args": [
          {"name": "symbol", "type": "string", "required": true},
          {"name": "amount", "type": "number", "required": true}
        ],
        "examples": ["sell my ethereum", "dump 0.1 BTC"]
      },
      {
        "command": "/alert",
        "description": "Set a price alert",
        "args": [
          {"name": "symbol", "type": "string", "required": true},
          {"name": "price", "type": "number", "required": true},
          {"name": "direction", "type": "enum", "values": ["above", "below"], "required": true}
        ],
        "examples": ["alert me when eth hits 4000", "notify if btc drops below 40k"]
      }
    ],
    "features": {
      "streaming": true,
      "file_upload": true,
      "max_file_size_mb": 10
    }
  }
}
```

The `examples` field helps the LLM understand natural language variations.

### `notification`

Request push notification to user's devices.

```json
{
  "type": "notification",
  "id": "msg_ijk123",
  "ts": 1706400000,
  "payload": {
    "title": "Trade Executed",
    "body": "Bought 0.5 ETH at $3,240",
    "priority": "high",
    "category": "trade",
    "thread_id": "trades",
    "data": {
      "agent_id": "ag_8f7d9a...",
      "message_id": "msg_xyz789",
      "action": "open_chat"
    },
    "actions": [
      {"id": "view", "label": "View"},
      {"id": "undo", "label": "Undo", "destructive": true}
    ]
  }
}
```

#### Notification Priority

| Priority | Behavior |
|----------|----------|
| `low` | Badge only, grouped in digest |
| `normal` | Silent banner + badge |
| `high` | Sound + banner |
| `critical` | Bypass DND, persistent alert |

#### Notification Categories

| Category | Default Actions | Sound |
|----------|-----------------|-------|
| `message` | View | Default |
| `trade` | View, Undo | Trade sound |
| `alert` | View, Dismiss | Alert sound |
| `confirmation` | Approve, Reject | Urgent |
| `report` | View | Silent |
| `error` | View, Retry | Error sound |

### `error`

Report an error to the user.

```json
{
  "type": "error",
  "id": "msg_lmn456",
  "ts": 1706400000,
  "payload": {
    "code": "INTEGRATION_FAILED",
    "title": "Connection Error",
    "message": "Failed to connect to Alpaca: Rate limit exceeded. Retrying in 30 seconds.",
    "severity": "warning",
    "recoverable": true,
    "retry_after": 30,
    "actions": [
      {"id": "retry", "label": "Retry Now"},
      {"id": "dismiss", "label": "Dismiss"}
    ],
    "help_url": "https://docs.spawn.io/errors/INTEGRATION_FAILED"
  }
}
```

#### Error Severity

| Severity | UI Treatment |
|----------|--------------|
| `info` | Blue accent, dismissable |
| `warning` | Yellow accent, dismissable |
| `error` | Red accent, requires action |
| `fatal` | Red accent, agent stops |

### `stream_start` / `stream_chunk` / `stream_end`

For streaming responses (real-time text generation).

```json
{
  "type": "stream_start",
  "id": "msg_opq789",
  "ts": 1706400000,
  "payload": {
    "stream_id": "str_abc123"
  }
}
```

```json
{
  "type": "stream_chunk",
  "id": "msg_rst012",
  "ts": 1706400001,
  "payload": {
    "stream_id": "str_abc123",
    "content": "Based on my analysis, "
  }
}
```

```json
{
  "type": "stream_end",
  "id": "msg_uvw345",
  "ts": 1706400005,
  "payload": {
    "stream_id": "str_abc123",
    "final_message_id": "msg_xyz999"
  }
}
```

---

## Relay Messages

Messages between Relay and connected parties (not end-to-end encrypted).

### `agent_status` (Relay → App)

Agent connection status changed.

```json
{
  "type": "agent_status",
  "agent_id": "ag_8f7d9a...",
  "status": "online",
  "connected_at": 1706400000,
  "host_info": {
    "hostname": "macbook-pro.local",
    "ip_hint": "residential",
    "sdk_version": "1.0.0",
    "uptime_seconds": 86400
  }
}
```

| Status | Meaning |
|--------|---------|
| `online` | Connected and healthy |
| `offline` | Disconnected |
| `reconnecting` | Connection lost, attempting to reconnect |

### `delivery_receipt` (Relay → Host)

Confirm message delivered to App.

```json
{
  "type": "delivery_receipt",
  "message_id": "msg_abc123",
  "status": "delivered",
  "delivered_at": 1706400000
}
```

### `read_receipt` (Relay → Host)

Confirm message read by user.

```json
{
  "type": "read_receipt",
  "message_id": "msg_abc123",
  "read_at": 1706400005
}
```

### `presence` (Relay → Host)

User's app presence changed.

```json
{
  "type": "presence",
  "user_id": "usr_xyz789",
  "status": "active",
  "platform": "ios",
  "last_active_at": 1706400000
}
```

| Status | Meaning |
|--------|---------|
| `active` | App in foreground |
| `background` | App in background |
| `offline` | App closed |

---

## Error Codes

Standard error codes returned by Relay or used in `error` messages.

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_FAILED` | 401 | Invalid or expired token |
| `AGENT_NOT_FOUND` | 404 | Agent ID doesn't exist |
| `AGENT_OFFLINE` | 503 | Agent host not connected |
| `RATE_LIMITED` | 429 | Too many requests |
| `PAYLOAD_TOO_LARGE` | 413 | Message exceeds size limit |
| `INVALID_MESSAGE` | 400 | Malformed message |
| `ENCRYPTION_FAILED` | 400 | Decryption failed |
| `TIMEOUT` | 408 | Request timed out |
| `INTEGRATION_FAILED` | 502 | External API error |
| `INTERNAL_ERROR` | 500 | Relay server error |

---

## Limits

| Resource | Limit |
|----------|-------|
| Message payload size | 1 MB |
| Attachment size (single) | 10 MB |
| Attachment size (chunked) | 100 MB |
| Messages per minute (per agent) | 60 |
| Concurrent connections (per agent) | 5 |
| WebSocket idle timeout | 90 seconds |
| Confirmation timeout (max) | 24 hours |

---

## Icon Set

Standard icons available for cards and UI elements.

| Category | Icons |
|----------|-------|
| **Status** | `success`, `error`, `warning`, `info`, `pending` |
| **Finance** | `chart`, `wallet`, `coin`, `dollar`, `trend_up`, `trend_down`, `exchange` |
| **Actions** | `play`, `pause`, `stop`, `refresh`, `settings`, `edit`, `delete`, `copy` |
| **Objects** | `server`, `database`, `file`, `folder`, `lock`, `key`, `bell`, `calendar` |
| **Arrows** | `arrow_up`, `arrow_down`, `arrow_left`, `arrow_right`, `expand`, `collapse` |
| **Crypto** | `btc`, `eth`, `sol`, `usdc` (extensible) |

---

## Color Palette

Semantic colors for values, charts, and accents.

| Name | Hex | Usage |
|------|-----|-------|
| `green` | `#10B981` | Positive, success, profit |
| `red` | `#EF4444` | Negative, error, loss |
| `yellow` | `#F59E0B` | Warning, pending, caution |
| `blue` | `#3B82F6` | Info, primary, neutral change |
| `gray` | `#6B7280` | Disabled, secondary |
| `purple` | `#8B5CF6` | Special, highlight |

---

## Versioning

The protocol version is declared in connection headers:

```
X-Protocol-Version: 1.0
```

### Compatibility Rules

- Minor version bumps (1.0 → 1.1): Backward compatible, new optional fields
- Major version bumps (1.x → 2.0): Breaking changes, migration required

### Deprecation

Deprecated fields include a warning in responses:

```json
{
  "type": "text",
  "id": "msg_abc",
  "ts": 1706400000,
  "payload": { ... },
  "_warnings": [
    {"field": "payload.color", "message": "Deprecated. Use payload.value.color instead."}
  ]
}
```

---

## Example Conversation Flow

### User asks about portfolio (natural language)

**App → Host:**
```json
{
  "type": "message",
  "id": "msg_001",
  "ts": 1706400000,
  "payload": {
    "text": "how's my portfolio doing today?"
  }
}
```

**Host → App (status):**
```json
{
  "type": "status_update",
  "id": "msg_002",
  "ts": 1706400001,
  "payload": {
    "status": "thinking",
    "label": "Checking portfolio..."
  }
}
```

**Host → App (response):**
```json
{
  "type": "card",
  "id": "msg_003",
  "ts": 1706400002,
  "payload": {
    "style": "stat",
    "title": "Portfolio Value",
    "value": {"text": "$12,450.32", "color": "green"},
    "fields": [
      {"label": "Today", "value": "+$284.50 (2.3%)", "color": "green"},
      {"label": "Week", "value": "+$891.20 (7.7%)", "color": "green"}
    ],
    "actions": [
      {"id": "details", "label": "View Details", "style": "secondary"}
    ]
  }
}
```

**Host → App (status reset):**
```json
{
  "type": "status_update",
  "id": "msg_004",
  "ts": 1706400002,
  "payload": {
    "status": "idle"
  }
}
```

### User initiates trade (needs confirmation)

**App → Host:**
```json
{
  "type": "message",
  "id": "msg_010",
  "ts": 1706400100,
  "payload": {
    "text": "buy 0.5 eth"
  }
}
```

**Host → App (confirmation):**
```json
{
  "type": "confirmation_request",
  "id": "msg_011",
  "ts": 1706400101,
  "payload": {
    "request_id": "cfm_xyz",
    "title": "Confirm Purchase",
    "danger_level": "high",
    "timeout_seconds": 300,
    "summary": "Buy 0.5 ETH at market price",
    "details": [
      {"label": "Asset", "value": "Ethereum (ETH)"},
      {"label": "Amount", "value": "0.5 ETH"},
      {"label": "Est. Price", "value": "$3,240.00"},
      {"label": "Est. Total", "value": "$1,620.00"}
    ],
    "options": [
      {"id": "cancel", "label": "Cancel", "style": "secondary"},
      {"id": "confirm", "label": "Buy ETH", "style": "primary"}
    ],
    "requires_slide": true
  }
}
```

**App → Host (user approves):**
```json
{
  "type": "confirmation_response",
  "id": "msg_012",
  "ts": 1706400150,
  "payload": {
    "request_id": "cfm_xyz",
    "action": "confirm"
  }
}
```

**Host → App (executing):**
```json
{
  "type": "status_update",
  "id": "msg_013",
  "ts": 1706400151,
  "payload": {
    "status": "trading",
    "label": "Executing order..."
  }
}
```

**Host → App (complete):**
```json
{
  "type": "card",
  "id": "msg_014",
  "ts": 1706400153,
  "payload": {
    "style": "default",
    "icon": "success",
    "title": "Trade Executed",
    "fields": [
      {"label": "Action", "value": "BUY"},
      {"label": "Asset", "value": "0.5 ETH"},
      {"label": "Price", "value": "$3,241.20"},
      {"label": "Total", "value": "$1,620.60"},
      {"label": "Order ID", "value": "ORD-789xyz"}
    ]
  }
}
```

**Host → App (notification):**
```json
{
  "type": "notification",
  "id": "msg_015",
  "ts": 1706400153,
  "payload": {
    "title": "Trade Executed",
    "body": "Bought 0.5 ETH at $3,241.20",
    "priority": "high",
    "category": "trade"
  }
}
```

---

## Appendix: JSON Schemas

Full JSON schemas for validation available at:

```
https://schema.spawn.io/v1/message.json
https://schema.spawn.io/v1/card.json
https://schema.spawn.io/v1/chart.json
https://schema.spawn.io/v1/table.json
https://schema.spawn.io/v1/confirmation.json
https://schema.spawn.io/v1/input.json
```

---

## Sub-Agent Spawn Requests

Autonomous agents can request to create sub-agents. Unlike direct spawning, spawn **requests** require user approval—giving humans control over agent reproduction.

### Why Requests, Not Direct Spawning

Direct spawning is dangerous:
- Agent decides it needs help → spawns 10 sub-agents → consumes resources
- Agent spawns sub-agent with elevated permissions → security breach
- Agent spawns sub-agent in a loop → infinite reproduction

Spawn requests solve this:
- Agent proposes a sub-agent → user sees ghost card → approves or rejects
- Permissions are scoped and visible before approval
- User maintains kill switch at all times

### `agent_spawn_request` (Host → App)

Agent requests permission to create a sub-agent.

```json
{
  "type": "agent_spawn_request",
  "id": "msg_spawn_001",
  "ts": 1706400000,
  "payload": {
    "request_id": "spawn_req_abc123",
    "parent_id": "clawdbot_main",
    "proposed_agent": {
      "name": "TestRunner_01",
      "role": "QA Engineer",
      "description": "Runs pytest suite in parallel while I write code",
      "icon": "ladybug.fill",
      "permissions": [
        {
          "scope": "files.read",
          "path": "/projects/backend/tests/**",
          "reason": "Read test files to execute"
        },
        {
          "scope": "files.write", 
          "path": "/projects/backend/tests/reports/**",
          "reason": "Write test reports"
        },
        {
          "scope": "process.execute",
          "command": "pytest",
          "reason": "Run test suite"
        }
      ],
      "lifespan": "task_bound",
      "estimated_duration": "5-10 minutes",
      "resource_budget": {
        "max_tokens": 50000,
        "max_tool_calls": 100
      }
    },
    "reason": "This refactoring task is too large for a single context. I need a dedicated process to run tests in parallel while I continue writing code.",
    "urgency": "normal",
    "auto_approve_eligible": false
  }
}
```

#### Spawn Request Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `request_id` | string | Yes | Unique ID for this request |
| `parent_id` | string | Yes | ID of requesting agent |
| `proposed_agent.name` | string | Yes | Display name |
| `proposed_agent.role` | string | No | Role description (e.g., "QA Engineer") |
| `proposed_agent.description` | string | No | What it will do |
| `proposed_agent.icon` | string | No | SF Symbol name |
| `proposed_agent.permissions` | array | Yes | Requested permissions with scope |
| `proposed_agent.lifespan` | enum | Yes | `task_bound`, `time_bound`, `persistent` |
| `proposed_agent.estimated_duration` | string | No | Human-readable estimate |
| `proposed_agent.resource_budget` | object | No | Token/tool call limits |
| `reason` | string | Yes | Why the agent needs this sub-agent |
| `urgency` | enum | No | `low`, `normal`, `high`, `critical` |
| `auto_approve_eligible` | boolean | No | Can be auto-approved based on user settings |

#### Permission Scopes

| Scope | Description | Risk Level |
|-------|-------------|------------|
| `files.read` | Read files in specified path | Low |
| `files.write` | Write files in specified path | Medium |
| `files.delete` | Delete files in specified path | High |
| `process.execute` | Run specified command | Medium-High |
| `network.fetch` | Make HTTP requests to specified domains | Medium |
| `network.listen` | Open server port | High |
| `agent.message` | Send messages to other agents | Low |
| `agent.spawn` | Spawn its own sub-agents | High |
| `system.env` | Access environment variables | Medium |
| `system.shell` | Execute arbitrary shell commands | Critical |

#### Lifespan Types

| Type | Description | Auto-Terminate |
|------|-------------|----------------|
| `task_bound` | Dies when task completes | Yes, on completion |
| `time_bound` | Lives for specified duration | Yes, on timeout |
| `persistent` | Lives until manually killed | No |
| `parent_bound` | Dies when parent dies | Yes, with parent |

### `agent_spawn_response` (App → Host)

User approves or rejects the spawn request.

```json
{
  "type": "agent_spawn_response",
  "id": "msg_spawn_resp_001",
  "ts": 1706400030,
  "payload": {
    "request_id": "spawn_req_abc123",
    "decision": "approved",
    "modifications": {
      "permissions": [
        {
          "scope": "files.read",
          "path": "/projects/backend/tests/**"
        },
        {
          "scope": "process.execute",
          "command": "pytest"
        }
      ]
    },
    "constraints": {
      "max_duration_seconds": 600,
      "require_confirmation_for": ["files.delete"]
    }
  }
}
```

| Decision | Meaning |
|----------|---------|
| `approved` | Proceed with spawn (possibly with modifications) |
| `rejected` | Do not spawn |
| `deferred` | Ask again later |

### `agent_spawned` (Host → App)

Confirms sub-agent is now active.

```json
{
  "type": "agent_spawned",
  "id": "msg_spawned_001", 
  "ts": 1706400031,
  "payload": {
    "request_id": "spawn_req_abc123",
    "sub_agent_id": "sub_testrunner_01",
    "parent_id": "clawdbot_main",
    "name": "TestRunner_01",
    "role": "QA Engineer",
    "icon": "ladybug.fill",
    "status": "online",
    "permissions": [...],
    "lifespan": "task_bound",
    "started_at": 1706400031
  }
}
```

### `agent_kill_request` (App → Host)

User requests to terminate a sub-agent.

```json
{
  "type": "agent_kill_request",
  "id": "msg_kill_001",
  "ts": 1706400500,
  "payload": {
    "target_id": "sub_testrunner_01",
    "reason": "user_initiated",
    "force": false
  }
}
```

| Reason | Description |
|--------|-------------|
| `user_initiated` | User clicked kill |
| `runaway_detected` | Automatic kill due to exceeded limits |
| `parent_terminated` | Parent agent died |
| `task_complete` | Task finished normally |
| `timeout` | Time limit exceeded |

### Auto-Approve Rules

Users can configure auto-approval for low-risk spawn requests:

```json
{
  "auto_approve": {
    "enabled": true,
    "rules": [
      {
        "condition": "permissions_subset",
        "allowed_scopes": ["files.read", "agent.message"],
        "max_duration_seconds": 300
      },
      {
        "condition": "parent_trusted",
        "parent_ids": ["clawdbot_main"],
        "allowed_scopes": ["files.read", "files.write", "process.execute"]
      }
    ],
    "never_auto_approve": [
      "system.shell",
      "files.delete",
      "agent.spawn"
    ]
  }
}
```

---

## Auto-Spawn Mode

For autonomous operation, users can enable auto-spawn with configurable safety constraints. This allows agents to work overnight or during periods of inattention while maintaining guardrails.

### Auto-Spawn Configuration

```json
{
  "type": "auto_spawn_config",
  "id": "cfg_auto_001",
  "ts": 1706400000,
  "payload": {
    "enabled": true,
    "mode": "constrained",
    
    "permission_limits": {
      "allowed": [
        "files.read",
        "files.write",
        "process.execute",
        "network.fetch",
        "agent.message"
      ],
      "forbidden": [
        "system.shell",
        "files.delete",
        "agent.spawn",
        "network.listen"
      ],
      "require_approval": [
        "files.write:/sensitive/**",
        "process.execute:rm",
        "process.execute:sudo"
      ]
    },
    
    "resource_limits": {
      "max_concurrent_sub_agents": 5,
      "max_sub_agents_per_hour": 10,
      "max_tokens_per_sub_agent": 50000,
      "max_tool_calls_per_sub_agent": 100,
      "max_total_tokens_per_session": 500000
    },
    
    "time_limits": {
      "max_sub_agent_duration_seconds": 1800,
      "auto_terminate_idle_after_seconds": 300
    },
    
    "scope_limits": {
      "allowed_paths": [
        "/projects/**",
        "/home/user/code/**"
      ],
      "forbidden_paths": [
        "/etc/**",
        "/usr/**",
        "~/.ssh/**",
        "~/.aws/**",
        "**/secrets/**",
        "**/.env"
      ]
    },
    
    "notification_settings": {
      "notify_on_spawn": true,
      "notify_on_terminate": true,
      "notify_on_limit_reached": true,
      "batch_notifications": true,
      "summary_interval_minutes": 30
    },
    
    "circuit_breakers": {
      "pause_on_error_count": 3,
      "pause_on_resource_percent": 80,
      "require_checkin_after_hours": 4
    },
    
    "trusted_parents": [
      "clawdbot_main",
      "research_agent"
    ]
  }
}
```

### Auto-Spawn Modes

| Mode | Description | Safety Level |
|------|-------------|--------------|
| `off` | All spawns require approval | Maximum |
| `queue` | Spawns queue until user reviews | High |
| `constrained` | Auto-approve within strict limits | Medium |
| `trusted` | Auto-approve from trusted parents | Lower |
| `unrestricted` | Auto-approve everything (dangerous) | Minimum |

### Permission Limits

#### Allowed Permissions
Spawns requesting only these permissions can auto-approve:

```json
"allowed": [
  "files.read",
  "files.write", 
  "process.execute",
  "network.fetch",
  "agent.message"
]
```

#### Forbidden Permissions
Spawns requesting ANY of these always require manual approval:

```json
"forbidden": [
  "system.shell",      // Arbitrary shell commands
  "files.delete",      // Destructive file operations
  "agent.spawn",       // Recursive spawning (sub-sub-agents)
  "network.listen"     // Opening server ports
]
```

#### Conditional Approval
Specific permission+path combinations that require approval:

```json
"require_approval": [
  "files.write:/sensitive/**",
  "files.write:**/config.*",
  "process.execute:rm",
  "process.execute:sudo",
  "process.execute:docker"
]
```

### Resource Limits

| Limit | Description | Recommended |
|-------|-------------|-------------|
| `max_concurrent_sub_agents` | Active sub-agents at once | 3-5 |
| `max_sub_agents_per_hour` | Spawn rate limit | 10-20 |
| `max_tokens_per_sub_agent` | Token budget per sub-agent | 50k |
| `max_tool_calls_per_sub_agent` | Tool call budget | 100 |
| `max_total_tokens_per_session` | Total budget before pause | 500k |

When a limit is reached:
1. New spawn requests queue (don't reject)
2. User is notified
3. Agent can request limit increase

### Path Restrictions

Whitelist and blacklist for file access:

```json
"scope_limits": {
  "allowed_paths": [
    "/projects/**",
    "/home/user/code/**",
    "/tmp/agent-workspace/**"
  ],
  "forbidden_paths": [
    "/etc/**",
    "/usr/**",
    "/var/**",
    "~/.ssh/**",
    "~/.aws/**",
    "~/.config/gcloud/**",
    "**/secrets/**",
    "**/.env",
    "**/*.pem",
    "**/*.key"
  ]
}
```

Path patterns use glob syntax. Forbidden paths take precedence over allowed paths.

### Circuit Breakers

Automatic safety stops:

| Breaker | Trigger | Action |
|---------|---------|--------|
| `pause_on_error_count` | 3+ errors in sequence | Pause all sub-agents, notify user |
| `pause_on_resource_percent` | 80%+ of budget used | Pause spawning, notify user |
| `require_checkin_after_hours` | 4 hours of autonomous operation | Queue new spawns until user checks in |

### Auto-Spawn Notifications

Even with auto-approve, users stay informed:

**Immediate notifications (if enabled):**
```json
{
  "type": "notification",
  "payload": {
    "title": "Sub-Agent Spawned",
    "body": "Clawdbot → TestRunner_01",
    "priority": "low",
    "category": "auto_spawn",
    "silent": true
  }
}
```

**Batched summary (every 30 min):**
```json
{
  "type": "notification", 
  "payload": {
    "title": "Clawdbot Activity",
    "body": "3 sub-agents spawned, 2 completed, 47k tokens used",
    "priority": "normal",
    "category": "auto_spawn_summary"
  }
}
```

**Limit reached:**
```json
{
  "type": "notification",
  "payload": {
    "title": "⚠️ Spawn Limit Reached",
    "body": "Clawdbot has 5/5 active sub-agents. New spawns queued.",
    "priority": "high",
    "category": "limit_reached"
  }
}
```

### Check-In Flow

After `require_checkin_after_hours`, agent must get user acknowledgment:

```json
{
  "type": "checkin_request",
  "id": "msg_checkin_001",
  "ts": 1706414400,
  "payload": {
    "parent_id": "clawdbot_main",
    "running_since": 1706400000,
    "summary": {
      "sub_agents_spawned": 7,
      "sub_agents_completed": 5,
      "sub_agents_active": 2,
      "tokens_used": 234000,
      "tool_calls": 456,
      "errors": 0
    },
    "pending_spawns": 2,
    "message": "I've been working for 4 hours. Here's my progress on the refactoring task..."
  }
}
```

**User response:**
```json
{
  "type": "checkin_response",
  "id": "msg_checkin_resp_001",
  "ts": 1706414500,
  "payload": {
    "action": "continue",
    "extend_hours": 4,
    "approve_pending_spawns": true,
    "adjust_limits": {
      "max_concurrent_sub_agents": 8
    }
  }
}
```

| Action | Meaning |
|--------|---------|
| `continue` | Keep working, reset check-in timer |
| `pause` | Stop spawning, finish active work |
| `stop` | Terminate all sub-agents |
| `review` | Open full observability panel |

### Auto-Spawn Audit Log

All auto-spawns are logged for review:

```json
{
  "type": "auto_spawn_log",
  "entries": [
    {
      "ts": 1706400100,
      "action": "spawn_auto_approved",
      "parent_id": "clawdbot_main",
      "sub_agent_id": "sub_coderewriter_01",
      "permissions": ["files.read", "files.write"],
      "paths": ["/projects/backend/**"],
      "reason": "matched rule: trusted_parent + allowed_permissions"
    },
    {
      "ts": 1706400500,
      "action": "spawn_queued",
      "parent_id": "clawdbot_main",
      "sub_agent_id": "sub_deployer_01",
      "permissions": ["process.execute"],
      "reason": "permission 'process.execute:docker' requires approval"
    },
    {
      "ts": 1706401000,
      "action": "limit_reached",
      "limit": "max_concurrent_sub_agents",
      "value": 5,
      "queued_count": 2
    }
  ]
}
```

### UI: Auto-Spawn Settings Panel

```
┌─────────────────────────────────────┐
│ ← Auto-Spawn Settings          [?]  │
├─────────────────────────────────────┤
│                                     │
│ Auto-Spawn Mode                     │
│ ┌─────────────────────────────────┐ │
│ │ ○ Off (require approval)       │ │
│ │ ○ Queue (batch for review)     │ │
│ │ ● Constrained (with limits)    │ │
│ │ ○ Trusted (trusted agents)     │ │
│ │ ○ Unrestricted ⚠️              │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Resource Limits                     │
│                                     │
│ Max concurrent sub-agents           │
│ [━━━━━●━━━━━━━━━━━━] 5              │
│                                     │
│ Max spawns per hour                 │
│ [━━━━━━━●━━━━━━━━━━] 10             │
│                                     │
│ Token budget per sub-agent          │
│ [━━━━━━━━━●━━━━━━━━] 50k            │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Forbidden Permissions               │
│ [✓] Shell access (system.shell)     │
│ [✓] Delete files (files.delete)     │
│ [✓] Recursive spawn (agent.spawn)   │
│ [✓] Open ports (network.listen)     │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Protected Paths                     │
│ [✓] ~/.ssh/**                       │
│ [✓] ~/.aws/**                       │
│ [✓] **/.env                         │
│ [+ Add path...]                     │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Circuit Breakers                    │
│                                     │
│ Pause after errors      [3    ]     │
│ Pause at budget %       [80%  ]     │
│ Require check-in after  [4 hrs]     │
│                                     │
│ ─────────────────────────────────── │
│                                     │
│ Notifications                       │
│ [✓] Notify on each spawn            │
│ [✓] Batch notifications (30 min)    │
│ [✓] Alert on limits reached         │
│                                     │
└─────────────────────────────────────┘
```

### Morning Summary

When user opens app after autonomous session:

```
┌─────────────────────────────────────┐
│ ☀️ Overnight Summary                │
├─────────────────────────────────────┤
│                                     │
│ Clawdbot worked for 6h 23m          │
│                                     │
│ Sub-Agents                          │
│ ├─ 8 spawned                        │
│ ├─ 7 completed ✓                    │
│ └─ 1 active (finishing up)          │
│                                     │
│ Resources Used                      │
│ ├─ 342,000 tokens (68% of budget)   │
│ └─ 891 tool calls                   │
│                                     │
│ Queued (need approval)              │
│ ├─ DeployBot (wants docker access)  │
│ └─ CleanupBot (wants delete access) │
│                                     │
│ [View Full Log]  [Review Queued]    │
│                                     │
└─────────────────────────────────────┘
```

---

## Sub-Agent Model

Agents can spawn sub-agents that appear as nested conversations in the app. This enables:

- **Specialized workers** — ETH Watcher, BTC Watcher, Risk Monitor
- **Task delegation** — Parent orchestrates, sub-agents execute
- **Clean UI** — Hierarchical organization instead of flat list
- **Scoped conversations** — Each sub-agent has its own chat thread

### Hierarchy

```
Agent (top-level)
├── Conversation thread: Yes
├── Agent token: Yes (user-provisioned)
├── Runs on: User's host
│
└── Sub-Agent
    ├── Conversation thread: Yes (nested under parent)
    ├── Agent token: No (inherits parent's)
    ├── Runs on: Same process as parent
    ├── Lifetime: Tied to parent
    └── Can spawn children: No (max depth = 1)
```

### Visual Model (App UI)

```
┌─────────────────────────────────────┐
│  🤖 Agents                          │
├─────────────────────────────────────┤
│                                     │
│  ▼ Trading Bot            ● Online  │
│    │                                │
│    ├─ #eth-watcher        ● Online  │
│    │   Monitoring ETH price         │
│    │                                │
│    ├─ #btc-watcher        ● Online  │
│    │   Monitoring BTC price         │
│    │                                │
│    ├─ #risk-monitor       ● Online  │
│    │   Portfolio risk analysis      │
│    │                                │
│    └─ #trade-executor     ○ Paused  │
│        Executes approved trades     │
│                                     │
│  ▶ Research Assistant     ● Online  │
│                                     │
│  ▶ Code Reviewer          ○ Offline │
│                                     │
└─────────────────────────────────────┘
```

### Limits

| Resource | Limit |
|----------|-------|
| Max sub-agents per parent | 20 |
| Max hierarchy depth | 1 (no sub-sub-agents) |
| Sub-agent name length | 32 characters |
| Sub-agent description | 140 characters |

---

## Sub-Agent Protocol Messages

### `sub_agent_spawn` (Host → Relay)

Parent agent creates a new sub-agent.

```json
{
  "type": "sub_agent_spawn",
  "id": "msg_spawn_001",
  "ts": 1706400000,
  "payload": {
    "sub_agent_id": "sub_eth_watcher",
    "name": "ETH Watcher",
    "icon": "eth",
    "description": "Monitors ETH price and alerts on significant moves",
    "status": "online",
    "config": {
      "notify_parent": true,
      "auto_respond": true
    },
    "capabilities": {
      "commands": [
        {
          "command": "/status",
          "description": "Current ETH metrics",
          "examples": ["how's eth?", "eth price"]
        },
        {
          "command": "/alerts",
          "description": "Manage price alerts",
          "examples": ["set alert at 4000", "show my alerts"]
        }
      ]
    }
  }
}
```

#### Spawn Payload Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sub_agent_id` | string | Yes | Unique ID within parent scope |
| `name` | string | Yes | Display name (max 32 chars) |
| `icon` | string | No | Icon identifier |
| `description` | string | No | Short description (max 140 chars) |
| `status` | enum | No | Initial status: `online`, `paused` (default: `online`) |
| `config` | object | No | Sub-agent configuration |
| `capabilities` | object | No | Commands and features |

#### Config Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `notify_parent` | boolean | true | Send events to parent agent |
| `auto_respond` | boolean | true | Sub-agent handles its own messages |
| `inherit_context` | boolean | false | Share parent's conversation context |
| `visible` | boolean | true | Show in app UI |

### `sub_agent_spawned` (Relay → App)

Confirms sub-agent creation, triggers UI update.

```json
{
  "type": "sub_agent_spawned",
  "ts": 1706400001,
  "payload": {
    "agent_id": "ag_parent123",
    "sub_agent_id": "sub_eth_watcher",
    "name": "ETH Watcher",
    "icon": "eth",
    "description": "Monitors ETH price and alerts on significant moves",
    "status": "online",
    "created_at": 1706400000
  }
}
```

### `sub_agent_update` (Host → Relay)

Update sub-agent properties.

```json
{
  "type": "sub_agent_update",
  "id": "msg_update_001",
  "ts": 1706400100,
  "payload": {
    "sub_agent_id": "sub_eth_watcher",
    "changes": {
      "status": "paused",
      "description": "Paused - market closed"
    }
  }
}
```

### `sub_agent_terminate` (Host → Relay)

Remove a sub-agent.

```json
{
  "type": "sub_agent_terminate",
  "id": "msg_term_001",
  "ts": 1706400200,
  "payload": {
    "sub_agent_id": "sub_eth_watcher",
    "reason": "Task complete",
    "notify_user": true
  }
}
```

If `notify_user` is true, app shows a message in the sub-agent's chat:

```
────────────────────────────────
  This agent has been stopped.
  Reason: Task complete
────────────────────────────────
```

### `sub_agent_terminated` (Relay → App)

Confirms termination.

```json
{
  "type": "sub_agent_terminated",
  "ts": 1706400201,
  "payload": {
    "agent_id": "ag_parent123",
    "sub_agent_id": "sub_eth_watcher",
    "reason": "Task complete"
  }
}
```

---

## Message Routing with Sub-Agents

### User → Sub-Agent

Messages from the app include the target:

```json
{
  "type": "message",
  "id": "msg_user_001",
  "ts": 1706400000,
  "payload": {
    "text": "how's eth doing?",
    "target": {
      "type": "sub_agent",
      "id": "sub_eth_watcher"
    },
    "context": {
      "timezone": "America/Los_Angeles"
    }
  }
}
```

If `target` is omitted, message goes to parent agent.

### Sub-Agent → User

Responses include the source:

```json
{
  "type": "card",
  "id": "msg_sub_001",
  "ts": 1706400001,
  "payload": {
    "source": {
      "type": "sub_agent",
      "id": "sub_eth_watcher"
    },
    "style": "stat",
    "title": "ETH",
    "value": {"text": "$3,245.50", "color": "green"},
    "fields": [
      {"label": "24h", "value": "+5.2%", "color": "green"},
      {"label": "Volume", "value": "$12.4B"}
    ]
  }
}
```

### Sub-Agent → Parent (Internal)

Sub-agents can send events to parent. These don't go through relay—handled in SDK.

```json
{
  "type": "internal_event",
  "ts": 1706400000,
  "payload": {
    "from": "sub_eth_watcher",
    "to": "parent",
    "event": "price_alert",
    "data": {
      "symbol": "ETH",
      "price": 3450.00,
      "trigger": "above",
      "threshold": 3400.00,
      "change_percent": 5.2
    }
  }
}
```

Parent can then decide to:
- Surface to user in parent chat
- Trigger another sub-agent
- Execute an action
- Ignore

### Parent → Sub-Agent (Internal)

Parent can send commands to sub-agents:

```json
{
  "type": "internal_command",
  "ts": 1706400000,
  "payload": {
    "from": "parent",
    "to": "sub_eth_watcher",
    "command": "pause",
    "data": {
      "reason": "Market closed",
      "resume_at": 1706443200
    }
  }
}
```

### Broadcast (Parent → All Sub-Agents)

```json
{
  "type": "internal_command",
  "ts": 1706400000,
  "payload": {
    "from": "parent",
    "to": "*",
    "command": "pause",
    "data": {
      "reason": "Emergency stop"
    }
  }
}
```

---

## Sub-Agent Presence & Status

### Status Updates

Sub-agents report status through parent:

```json
{
  "type": "sub_agent_status",
  "id": "msg_status_001",
  "ts": 1706400000,
  "payload": {
    "sub_agent_id": "sub_eth_watcher",
    "status": "working",
    "label": "Analyzing price action...",
    "detail": "Processing 24h candles"
  }
}
```

Status values (same as parent agents):

| Status | Icon | Color | Description |
|--------|------|-------|-------------|
| `online` | ● | green | Ready |
| `working` | ◑ | blue | Processing |
| `paused` | ○ | gray | Manually paused |
| `error` | ● | red | Error state |
| `offline` | ○ | gray | Not running |

### Aggregate Status

Parent can report aggregate status of all sub-agents:

```json
{
  "type": "status_update",
  "id": "msg_agg_001",
  "ts": 1706400000,
  "payload": {
    "status": "working",
    "label": "3 watchers active",
    "sub_agents": {
      "online": 3,
      "paused": 1,
      "error": 0
    }
  }
}
```

---

## Cross-Sub-Agent Communication

Sub-agents can request to message other sub-agents through parent:

```json
{
  "type": "internal_event",
  "ts": 1706400000,
  "payload": {
    "from": "sub_eth_watcher",
    "to": "sub_risk_monitor",
    "event": "position_update",
    "data": {
      "symbol": "ETH",
      "size": 2.5,
      "entry_price": 3100,
      "current_price": 3450
    }
  }
}
```

Parent SDK routes this internally. Sub-agents never communicate directly through relay.

---

## App UI Behavior

### Navigation

| Action | Result |
|--------|--------|
| Tap parent agent | Open parent chat (orchestration view) |
| Tap sub-agent | Open sub-agent chat (dedicated thread) |
| Long-press parent | Show parent config + list of sub-agents |
| Long-press sub-agent | Show sub-agent config (limited options) |
| Swipe sub-agent | Pause / Resume / Delete |

### Parent Chat Features

The parent chat can show:

- Aggregated activity from all sub-agents
- Orchestration commands (`/pause_all`, `/status_all`)
- Events surfaced by sub-agents
- Sub-agent management UI

```
┌─────────────────────────────────────┐
│ ← Trading Bot                  [⋮]  │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Sub-Agents              [+ Add] │ │
│ │                                 │ │
│ │ ● ETH Watcher    ● BTC Watcher  │ │
│ │ ● Risk Monitor   ○ Executor     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─────── Today ───────               │
│                                     │
│ 🤖 ETH Watcher                      │
│ ⚠️ ETH up 5.2% - above threshold    │
│                            2:34 PM  │
│                                     │
│ 🤖 Risk Monitor                     │
│ Portfolio risk level: MODERATE      │
│ Exposure: 65% crypto, 35% stable    │
│                            2:35 PM  │
│                                     │
│ You                                 │
│ pause the eth watcher               │
│                            2:40 PM  │
│                                     │
│ 🤖 Trading Bot                      │
│ Done. ETH Watcher is paused.        │
│                            2:40 PM  │
│                                     │
└─────────────────────────────────────┘
```

### Sub-Agent Chat

Dedicated conversation with one sub-agent:

```
┌─────────────────────────────────────┐
│ ← ETH Watcher              [⋮] [↑]  │
│   Trading Bot • Online              │
├─────────────────────────────────────┤
│                                     │
│ ─────── Today ───────               │
│                                     │
│ You                                 │
│ how's eth doing?                    │
│                            2:30 PM  │
│                                     │
│ 🤖 ETH Watcher                      │
│ ┌─────────────────────────────────┐ │
│ │ ETH                             │ │
│ │ $3,245.50              ▲ 5.2%   │ │
│ │                                 │ │
│ │ 24h High    $3,280              │ │
│ │ 24h Low     $3,050              │ │
│ │ Volume      $12.4B              │ │
│ └─────────────────────────────────┘ │
│                            2:30 PM  │
│                                     │
│ You                                 │
│ alert me if it drops below 3200    │
│                            2:31 PM  │
│                                     │
│ 🤖 ETH Watcher                      │
│ ✓ Alert set: ETH below $3,200      │
│                            2:31 PM  │
│                                     │
└─────────────────────────────────────┘
  [↑] Navigate to parent
```

### Notifications

Sub-agent notifications include parent context:

```json
{
  "aps": {
    "alert": {
      "title": "ETH Watcher",
      "subtitle": "Trading Bot",
      "body": "ETH dropped below $3,200"
    },
    "thread-id": "ag_parent123_sub_eth_watcher"
  }
}
```

Notifications are grouped by parent in Notification Center.

---

## SDK Implementation

### Defining Sub-Agents

```python
from spawn import Agent, SubAgent

# Create parent agent
bot = Agent(token="ag_xxx...")

# Define sub-agents statically
eth_watcher = SubAgent(
    id="eth_watcher",
    name="ETH Watcher",
    icon="eth",
    description="Monitors ETH price movements",
    system_prompt="""
    You monitor ETH price and alert the user on significant moves.
    You can set price alerts and provide market analysis.
    """
)

btc_watcher = SubAgent(
    id="btc_watcher",
    name="BTC Watcher", 
    icon="btc",
    description="Monitors BTC price movements",
    system_prompt="..."
)

# Register with parent
bot.register(eth_watcher)
bot.register(btc_watcher)

# Handle sub-agent messages
@eth_watcher.on_message
async def handle_eth_message(ctx, message):
    if "price" in message.text or "how" in message.text:
        price = await get_eth_price()
        await ctx.send_card(
            style="stat",
            title="ETH",
            value=f"${price:,.2f}",
            value_color="green" if price > ctx.state.get("last_price", 0) else "red"
        )
        ctx.state["last_price"] = price

# Sub-agent scheduled task
@eth_watcher.schedule("*/5 * * * *")  # Every 5 minutes
async def check_eth_price():
    price = await get_eth_price()
    if price > eth_watcher.state.get("alert_threshold"):
        # Notify user directly
        await eth_watcher.notify(
            title="ETH Alert",
            body=f"ETH is above ${eth_watcher.state['alert_threshold']}",
            priority="high"
        )
        # Also tell parent
        await eth_watcher.emit("price_alert", {
            "symbol": "ETH",
            "price": price,
            "trigger": "above"
        })

# Parent listens to sub-agent events
@bot.on_sub_agent_event("price_alert")
async def handle_price_alert(event):
    # Could trigger risk monitor, log, etc.
    await bot.send_text(
        f"⚠️ {event.source.name}: {event.data['symbol']} alert triggered"
    )

bot.run()
```

### Dynamic Spawning

```python
@bot.on_message
async def handle_message(ctx, message):
    # User: "watch sol for me"
    if "watch" in message.text.lower():
        symbols = extract_symbols(message.text)  # ["SOL"]
        
        for symbol in symbols:
            sub = SubAgent(
                id=f"{symbol.lower()}_watcher",
                name=f"{symbol} Watcher",
                icon=symbol.lower(),
                description=f"Monitoring {symbol} price",
                system_prompt=f"You monitor {symbol} price..."
            )
            
            # Define handler inline
            @sub.on_message
            async def handler(ctx, msg, sym=symbol):
                price = await get_price(sym)
                await ctx.send_card(title=sym, value=f"${price:,.2f}")
            
            # Spawn it
            await bot.spawn(sub)
        
        await ctx.send_text(f"Created {len(symbols)} watcher(s). Check the sidebar.")
```

### Parent Commands

```python
@bot.on_message
async def parent_commands(ctx, message):
    text = message.text.lower()
    
    if text == "/status_all" or "all watchers" in text:
        statuses = []
        for sub in bot.sub_agents:
            statuses.append(f"{'●' if sub.status == 'online' else '○'} {sub.name}")
        await ctx.send_text("Sub-agents:\n" + "\n".join(statuses))
    
    elif text == "/pause_all":
        for sub in bot.sub_agents:
            await sub.pause()
        await ctx.send_text("All sub-agents paused.")
    
    elif text == "/resume_all":
        for sub in bot.sub_agents:
            await sub.resume()
        await ctx.send_text("All sub-agents resumed.")
```

---

## Changelog

### 1.0.0-draft (January 2026)
- Initial protocol specification
- Core message types: text, card, chart, table, confirmation, input, progress
- Encryption layer with ECDH key exchange
- Notification hints for push delivery
- Streaming support for real-time responses
- **Sub-agent model with hierarchical organization**
- **Internal event system for agent coordination**
- **Dynamic spawning and termination**
