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
  console.log(pink('  ║') + chalk.white.bold('          Spawn.wtf Skill Setup         ') + pink('║'));
  console.log(pink('  ╚═══════════════════════════════════════╝'));
  console.log('');
}

function printSuccess(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

function printError(message) {
  console.log(chalk.red('✗') + ' ' + message);
}

async function detectClaudeInstallation() {
  // Check common Claude Code locations
  const possiblePaths = [
    path.join(process.env.HOME || '', '.claude'),
    path.join(process.cwd(), '.claude'),
    path.join(process.cwd(), 'CLAUDE.md'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return { found: true, path: p };
    }
  }

  // Check if we're in a project directory
  if (fs.existsSync(path.join(process.cwd(), 'package.json')) ||
      fs.existsSync(path.join(process.cwd(), 'Cargo.toml')) ||
      fs.existsSync(path.join(process.cwd(), 'pyproject.toml'))) {
    return { found: true, path: process.cwd(), isProject: true };
  }

  return { found: false };
}

async function createSkillFiles(token, agentName) {
  const skillDir = path.join(process.cwd(), 'spawn');

  // Create spawn directory
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Create SKILL.md
  const skillMd = `# Spawn.wtf Agent Skill

This skill connects your Claude agent to the Spawn.wtf mobile app for real-time monitoring and control.

## Features

- Real-time status updates visible in the iOS app
- Send/receive messages from your phone
- Confirmation requests for sensitive actions
- Sub-agent spawn approval workflow

## Configuration

Agent Name: ${agentName}
Token: ${token.slice(0, 20)}...

## Usage

The skill automatically:
1. Connects to Spawn.wtf relay on startup
2. Sends status updates as you work
3. Forwards messages between you and the mobile app

## Commands

- \`/spawn status\` - Check connection status
- \`/spawn send <message>\` - Send message to app
- \`/spawn notify <title> <body>\` - Send push notification
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);

  // Create config file
  const config = {
    name: agentName,
    token: token,
    relay: 'wss://spawn-relay.ngvsqdjj5r.workers.dev/v1/agent',
    autoConnect: true,
  };

  fs.writeFileSync(
    path.join(skillDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  // Create .env if it doesn't exist, or append to it
  const envPath = path.join(process.cwd(), '.env');
  const envLine = `SPAWN_TOKEN=${token}\nSPAWN_AGENT_NAME=${agentName}\n`;

  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf-8');
    if (!existing.includes('SPAWN_TOKEN')) {
      fs.appendFileSync(envPath, '\n# Spawn.wtf Agent Configuration\n' + envLine);
    }
  } else {
    fs.writeFileSync(envPath, '# Spawn.wtf Agent Configuration\n' + envLine);
  }

  // Create a simple connector script
  const connectorScript = `/**
 * Spawn.wtf Agent Connector
 *
 * This script connects your agent to the Spawn.wtf mobile app.
 * Run with: node spawn/connect.js
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

const ws = new WebSocket(config.relay, {
  headers: {
    'Authorization': \`Bearer \${config.token}\`,
  },
});

ws.on('open', () => {
  console.log('Connected to Spawn.wtf relay');

  // Send initial status
  ws.send(JSON.stringify({
    type: 'status_update',
    id: \`msg_\${Date.now()}\`,
    ts: Date.now(),
    payload: {
      status: 'idle',
      label: 'Ready',
    },
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.type);

  if (msg.type === 'message') {
    console.log('Message from app:', msg.payload.text);
  }
});

ws.on('close', () => {
  console.log('Disconnected from relay');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

// Keep alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'ping',
      id: \`ping_\${Date.now()}\`,
      ts: Date.now(),
      payload: {},
    }));
  }
}, 30000);

console.log('Spawn.wtf agent connector running...');
console.log('Press Ctrl+C to disconnect');
`;

  fs.writeFileSync(path.join(skillDir, 'connect.js'), connectorScript);

  return skillDir;
}

async function main() {
  printBanner();

  // Check for token argument
  const args = process.argv.slice(2);
  let token = null;
  let agentName = 'Claude';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' || args[i] === '-t') {
      token = args[i + 1];
    }
    if (args[i] === '--name' || args[i] === '-n') {
      agentName = args[i + 1];
    }
    if (args[i] === 'init') {
      // Just the init command, continue
    }
  }

  // Detect Claude installation
  const spinner = ora('Detecting Claude installation...').start();
  const detection = await detectClaudeInstallation();

  if (detection.found) {
    spinner.succeed('Detected Claude Code installation');
  } else {
    spinner.info('No Claude installation detected, setting up in current directory');
  }

  console.log('');

  // Prompt for token if not provided
  if (!token) {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Enter your Spawn.wtf agent token:',
        mask: '*',
        validate: (input) => {
          if (!input.startsWith('spwn_sk_')) {
            return 'Token should start with spwn_sk_';
          }
          if (input.length < 20) {
            return 'Token seems too short';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'agentName',
        message: 'Agent name:',
        default: agentName,
      },
    ]);

    token = answers.token;
    agentName = answers.agentName;
  }

  console.log('');

  // Create files
  const createSpinner = ora('Creating skill files...').start();
  try {
    const skillDir = await createSkillFiles(token, agentName);
    createSpinner.succeed('Created skill files');
    printSuccess('Added token to .env');
  } catch (err) {
    createSpinner.fail('Failed to create skill files');
    printError(err.message);
    process.exit(1);
  }

  console.log('');
  console.log(chalk.green.bold('✓ Spawn.wtf skill installed successfully!'));
  console.log('');

  console.log('  Files created:');
  console.log(dim('    spawn/SKILL.md'));
  console.log(dim('    spawn/config.json'));
  console.log(dim('    spawn/connect.js'));
  console.log('');

  console.log('  Next steps:');
  console.log('');
  console.log('  1. ' + chalk.cyan('Test connection:'));
  console.log('     ' + dim('node spawn/connect.js'));
  console.log('');
  console.log('  2. ' + chalk.cyan('Open Spawn.wtf app') + ' - your agent should appear!');
  console.log('');
  console.log('  Docs: ' + pink('https://spawn.wtf/docs'));
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
