#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colors matching Spawn.wtf brand
const pink = chalk.hex('#ff2d92');
const dim = chalk.gray;

function printBanner() {
  console.log('');
  console.log(pink('  ╔═══════════════════════════════════════╗'));
  console.log(pink('  ║') + chalk.white.bold('          SPAWN.WTF Skill Setup         ') + pink('║'));
  console.log(pink('  ╚═══════════════════════════════════════╝'));
  console.log('');
}

function printSuccess(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

const SKILL_MD = `# Spawn Integration Skill

## Overview

You are connected to **Spawn**, a mobile/desktop app that serves as your user interface. Instead of raw terminal output, your responses are rendered as rich UI components on the user's phone or computer.

This skill teaches you how to:

1. Communicate through structured UI components
2. Request approval for sensitive actions
3. Spawn and manage sub-agents
4. Respect the user's safety settings

**Important:** The user has configured safety settings in the Spawn app. You must respect these settings. They represent the user's explicit preferences about what you can do autonomously vs. what requires approval.

---

## Communication Protocol

### Sending Messages

\`\`\`python
from spawn import ui

# Simple text
ui.send_text("I've analyzed the codebase. Found 3 issues.")

# Card with stats
ui.send_card(
    title="Code Analysis",
    value="3 issues",
    style="warning",
    fields=[
        {"label": "Critical", "value": "1"},
        {"label": "Warning", "value": "2"},
        {"label": "Files scanned", "value": "47"},
    ]
)
\`\`\`

### Status Updates

Keep the user informed about what you're doing:

\`\`\`python
from spawn import status

status.set("thinking", "Analyzing codebase...")
status.set("working", "Refactoring auth.py (3/12)")
status.set("idle")  # When done
\`\`\`

---

## Approval Flows

### When to Ask for Approval

**Always ask** when:
- The action involves money or trades
- The action is irreversible (delete, deploy, send)
- You're unsure if the user would want this

**Never ask** when:
- The action is read-only
- You're just gathering information

### How to Request Approval

\`\`\`python
from spawn import approval

approved = await approval.confirm(
    title="Delete old logs?",
    message="This will remove 47 log files older than 30 days.",
    danger_level="medium"  # low, medium, high, critical
)

if approved:
    delete_logs()
else:
    ui.send_text("Okay, I won't delete the logs.")
\`\`\`

### Danger Levels

| Level | When to Use | UI Treatment |
|-------|-------------|--------------|
| \`low\` | Reversible, low impact | Tap to confirm |
| \`medium\` | Moderate impact, recoverable | Yellow card, tap to confirm |
| \`high\` | Significant impact, hard to reverse | Red card, slide to confirm |
| \`critical\` | Irreversible, financial, destructive | Red card, biometric required |

---

## Sub-Agent Spawning

### Requesting a Sub-Agent

\`\`\`python
from spawn import agents

sub = await agents.request_spawn(
    name="TestRunner",
    role="QA Engineer",
    description="Run tests in parallel while I refactor",
    permissions=[
        {"scope": "files.read", "path": "/projects/tests/**"},
        {"scope": "process.execute", "command": "pytest"},
    ],
    reason="I need parallel test execution to catch breaking changes quickly."
)

if sub is None:
    ui.send_text("Understood, I'll run tests sequentially instead.")
else:
    await sub.start()
\`\`\`

---

## Path Restrictions

Before accessing any file, check if it's allowed:

\`\`\`python
from spawn import policy

if policy.is_path_forbidden(path):
    ui.send_text("I can't access that path - it's protected.")
    return
\`\`\`

### Common Forbidden Paths

- \`~/.ssh/**\` - SSH keys
- \`~/.aws/**\` - AWS credentials
- \`**/.env\` - Environment files
- \`**/*.pem\`, \`**/*.key\` - Private keys

---

## Notifications

Send push notifications for important events:

\`\`\`python
from spawn import notify

notify.send(
    title="Refactoring Complete",
    body="All 12 files updated, tests passing.",
    priority="normal"  # silent, normal, high, critical
)
\`\`\`

---

## Best Practices

1. **Always check settings first** before taking actions
2. **Prefer asking over assuming** - users prefer being asked
3. **Keep user informed** - update status during long operations
4. **Graceful degradation** - if denied, explain alternatives
5. **Respect the spirit** - don't exploit technical loopholes

The user trusts you enough to give you capabilities. Honor that trust by respecting their configured limits.
`;

function getTypeScriptConnector(token, agentName) {
  return `/**
 * Spawn.wtf Agent Connector
 * Run with: node connect.js
 */

import WebSocket from 'ws';

const TOKEN = '${token}';
const NAME = '${agentName}';
const RELAY = 'wss://spawn-relay.ngvsqdjj5r.workers.dev/v1/agent';

let ws;

function send(type, payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type,
      id: \`msg_\${Date.now()}\`,
      ts: Date.now(),
      payload
    }));
  }
}

function sendText(text) {
  send('message', { content_type: 'text', text, format: 'plain' });
}

function updateStatus(status, label) {
  send('status_update', { status, label });
}

function connect() {
  ws = new WebSocket(RELAY, {
    headers: { 'Authorization': \`Bearer \${TOKEN}\` }
  });

  ws.on('open', () => {
    console.log('Connected to Spawn.wtf!');
    // Auth happens via token in header - just start working
    sendText(\`\${NAME} is online and ready.\`);
    updateStatus('idle', 'Ready for commands');
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg.type);

    if (msg.type === 'message') {
      console.log('Message from app:', msg.payload);
      const text = msg.payload?.text || '';

      updateStatus('thinking', 'Processing...');
      setTimeout(() => {
        sendText(\`You said: "\${text}"\`);
        updateStatus('idle', 'Ready');
      }, 500);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from relay');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Keep alive
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    send('ping', {});
  }
}, 30000);

console.log('Connecting to Spawn.wtf...');
connect();

process.on('SIGINT', () => {
  console.log('Shutting down...');
  ws?.close();
  process.exit(0);
});
`;
}

function getPythonConnector(token, agentName) {
  return `"""
Spawn.wtf Agent Connector
Run with: python connect.py
"""

import asyncio
import json
import signal
import sys
from spawn_sdk import SpawnAgent

agent = SpawnAgent(
    token='${token}',
    name='${agentName}'
)

@agent.on('connect')
async def on_connect():
    print('Connected to Spawn.wtf!')
    await agent.send_text('${agentName} is online and ready.')
    await agent.update_status('idle', 'Ready for commands')

@agent.on('message')
async def on_message(msg):
    print(f'Message from app: {msg}')

    if msg.get('type') == 'message':
        text = msg.get('payload', {}).get('text', '')
        await agent.update_status('thinking', 'Processing...')

        # Echo back
        await asyncio.sleep(0.5)
        await agent.send_text(f'You said: "{text}"')
        await agent.update_status('idle', 'Ready')

@agent.on('disconnect')
async def on_disconnect():
    print('Disconnected from Spawn.wtf')

@agent.on('error')
async def on_error(err):
    print(f'Error: {err}')

def signal_handler(sig, frame):
    asyncio.create_task(agent.disconnect())
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

if __name__ == '__main__':
    print('Connecting to Spawn.wtf...')
    asyncio.run(agent.connect())
`;
}

function getPythonSDK() {
  return `"""
Spawn.wtf Python SDK
"""

import asyncio
import json
import websockets
from typing import Callable, Optional, Dict, Any

class SpawnAgent:
    def __init__(self, token: str, name: str, relay_url: str = 'wss://spawn-relay.ngvsqdjj5r.workers.dev/v1/agent'):
        self.token = token
        self.name = name
        self.relay_url = relay_url
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._handlers: Dict[str, Callable] = {}
        self._connected = False

    def on(self, event: str):
        """Decorator to register event handlers"""
        def decorator(func: Callable):
            self._handlers[event] = func
            return func
        return decorator

    async def connect(self):
        """Connect to the Spawn relay"""
        try:
            self.ws = await websockets.connect(
                self.relay_url,
                extra_headers={'Authorization': f'Bearer {self.token}'}
            )
            self._connected = True

            # Auth happens via token header - trigger connect immediately
            if 'connect' in self._handlers:
                await self._handlers['connect']()

            # Start message loop
            await self._message_loop()

        except Exception as e:
            if 'error' in self._handlers:
                await self._handlers['error'](str(e))
            raise

    async def _message_loop(self):
        """Main message receiving loop"""
        try:
            async for message in self.ws:
                data = json.loads(message)
                msg_type = data.get('type', '')

                if msg_type == 'message':
                    if 'message' in self._handlers:
                        await self._handlers['message'](data)
                elif msg_type == 'pong':
                    pass  # Keep-alive response

        except websockets.ConnectionClosed:
            self._connected = False
            if 'disconnect' in self._handlers:
                await self._handlers['disconnect']()

    async def _send(self, data: Dict[str, Any]):
        """Send a message to the relay"""
        if self.ws and self._connected:
            await self.ws.send(json.dumps(data))

    async def send_text(self, text: str, format: str = 'plain'):
        """Send a text message"""
        await self._send({
            'type': 'message',
            'id': f'msg_{int(asyncio.get_event_loop().time() * 1000)}',
            'ts': int(asyncio.get_event_loop().time() * 1000),
            'payload': {
                'content_type': 'text',
                'text': text,
                'format': format
            }
        })

    async def send_card(self, title: str, subtitle: str = None, style: str = 'default',
                        fields: list = None, footer: str = None):
        """Send a card message"""
        await self._send({
            'type': 'message',
            'id': f'msg_{int(asyncio.get_event_loop().time() * 1000)}',
            'ts': int(asyncio.get_event_loop().time() * 1000),
            'payload': {
                'content_type': 'card',
                'card': {
                    'title': title,
                    'subtitle': subtitle,
                    'style': style,
                    'fields': fields or [],
                    'footer': footer
                }
            }
        })

    async def update_status(self, status: str, label: str = None):
        """Update agent status"""
        await self._send({
            'type': 'status_update',
            'id': f'status_{int(asyncio.get_event_loop().time() * 1000)}',
            'ts': int(asyncio.get_event_loop().time() * 1000),
            'payload': {
                'status': status,
                'label': label
            }
        })

    async def notify(self, title: str, body: str, priority: str = 'normal'):
        """Send a push notification"""
        await self._send({
            'type': 'notification',
            'id': f'notif_{int(asyncio.get_event_loop().time() * 1000)}',
            'ts': int(asyncio.get_event_loop().time() * 1000),
            'payload': {
                'title': title,
                'body': body,
                'priority': priority
            }
        })

    async def disconnect(self):
        """Disconnect from the relay"""
        if self.ws:
            await self.ws.close()
            self._connected = False
`;
}

async function createSkillFiles(token, agentName, language) {
  const skillDir = path.join(process.cwd(), 'spawn');

  // Create spawn directory
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Create SKILL.md
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD);

  // Create config file
  const config = {
    name: agentName,
    token: token,
    relay: 'wss://spawn-relay.ngvsqdjj5r.workers.dev/v1/agent',
    language: language
  };
  fs.writeFileSync(path.join(skillDir, 'config.json'), JSON.stringify(config, null, 2));

  if (language === 'typescript') {
    // TypeScript/Node setup
    fs.writeFileSync(path.join(skillDir, 'connect.js'), getTypeScriptConnector(token, agentName));

    const packageJson = {
      name: "spawn-agent",
      version: "1.0.0",
      type: "module",
      dependencies: {
        ws: "^8.16.0"
      }
    };
    fs.writeFileSync(path.join(skillDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  } else {
    // Python setup
    fs.writeFileSync(path.join(skillDir, 'connect.py'), getPythonConnector(token, agentName));
    fs.writeFileSync(path.join(skillDir, 'spawn_sdk.py'), getPythonSDK());
    fs.writeFileSync(path.join(skillDir, 'requirements.txt'), 'websockets>=12.0\n');
  }

  return { skillDir, language };
}

async function main() {
  printBanner();

  // Parse arguments
  const args = process.argv.slice(2);
  let token = null;
  let agentName = 'Claude';
  let language = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' || args[i] === '-t') {
      token = args[i + 1];
    }
    if (args[i] === '--name' || args[i] === '-n') {
      agentName = args[i + 1];
    }
    if (args[i] === '--python' || args[i] === '-py') {
      language = 'python';
    }
    if (args[i] === '--node' || args[i] === '--typescript' || args[i] === '-ts') {
      language = 'typescript';
    }
  }

  // Interactive prompts
  const questions = [];

  if (!token) {
    questions.push({
      type: 'password',
      name: 'token',
      message: 'Enter your Spawn.wtf agent token:',
      mask: '*',
      validate: (input) => {
        if (!input.startsWith('spwn_sk_')) {
          return 'Token should start with spwn_sk_';
        }
        return true;
      }
    });
  }

  questions.push({
    type: 'input',
    name: 'agentName',
    message: 'Agent name:',
    default: agentName
  });

  if (!language) {
    questions.push({
      type: 'list',
      name: 'language',
      message: 'Choose your language:',
      choices: [
        { name: 'TypeScript / Node.js', value: 'typescript' },
        { name: 'Python', value: 'python' }
      ]
    });
  }

  const answers = await inquirer.prompt(questions);

  token = token || answers.token;
  agentName = answers.agentName || agentName;
  language = language || answers.language;

  console.log('');

  // Create files
  const createSpinner = ora('Creating skill files...').start();
  try {
    const { skillDir } = await createSkillFiles(token, agentName, language);
    createSpinner.succeed('Created skill files');
  } catch (err) {
    createSpinner.fail('Failed to create skill files');
    console.error(err.message);
    process.exit(1);
  }

  console.log('');
  console.log(chalk.green.bold('✓ Spawn.wtf skill installed!'));
  console.log('');

  if (language === 'typescript') {
    console.log('  Files created:');
    console.log(dim('    spawn/SKILL.md'));
    console.log(dim('    spawn/config.json'));
    console.log(dim('    spawn/connect.js'));
    console.log(dim('    spawn/package.json'));
    console.log('');
    console.log('  Next steps:');
    console.log('');
    console.log('  1. ' + chalk.cyan('Install dependencies:'));
    console.log('     ' + dim('cd spawn && npm install'));
    console.log('');
    console.log('  2. ' + chalk.cyan('Run the connector:'));
    console.log('     ' + dim('node spawn/connect.js'));
  } else {
    console.log('  Files created:');
    console.log(dim('    spawn/SKILL.md'));
    console.log(dim('    spawn/config.json'));
    console.log(dim('    spawn/connect.py'));
    console.log(dim('    spawn/spawn_sdk.py'));
    console.log(dim('    spawn/requirements.txt'));
    console.log('');
    console.log('  Next steps:');
    console.log('');
    console.log('  1. ' + chalk.cyan('Install dependencies:'));
    console.log('     ' + dim('cd spawn && pip install -r requirements.txt'));
    console.log('');
    console.log('  2. ' + chalk.cyan('Run the connector:'));
    console.log('     ' + dim('python spawn/connect.py'));
  }

  console.log('');
  console.log('  3. ' + chalk.cyan('Open Spawn.wtf app') + ' - your agent should appear!');
  console.log('');
  console.log('  Docs: ' + pink('https://github.com/SpawnWTF/spawn'));
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
