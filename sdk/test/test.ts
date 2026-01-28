/**
 * Spawn Agent SDK Test Script
 *
 * This script connects to the Spawn relay and demonstrates
 * the basic functionality of the agent SDK.
 *
 * Run with: npm test (or npx tsx test/test.ts)
 */

import { SpawnAgent } from '../src/index.js';
import type { SpawnMessage } from '../src/index.js';

// Agent token - MUST be set via TOKEN env var
const TEST_TOKEN = process.env.TOKEN;
if (!TEST_TOKEN) {
  console.error('Error: TOKEN environment variable is required');
  console.error('Usage: TOKEN=spwn_sk_xxx npm test');
  process.exit(1);
}
const AGENT_NAME = process.env.NAME || 'Clawdbot';

console.log('='.repeat(50));
console.log('Spawn Agent SDK - Connecting...');
console.log('='.repeat(50));
console.log(`Agent: ${AGENT_NAME}`);
console.log(`Token: ${TEST_TOKEN.slice(0, 20)}...`);
console.log('');

const agent = new SpawnAgent({
  token: TEST_TOKEN,
  name: AGENT_NAME,
  debug: true,

  onConnect: () => {
    console.log('');
    console.log('[TEST] Connected to Spawn relay!');
    console.log('');

    // Send welcome message
    agent.sendText(`${AGENT_NAME} is online and ready!`);

    // Send a sample card after a short delay
    setTimeout(() => {
      agent.sendCard({
        title: 'System Status',
        subtitle: 'Agent Health Check',
        style: 'success',
        fields: [
          { label: 'Status', value: 'Online' },
          { label: 'Uptime', value: 'Just started' },
          { label: 'Version', value: '1.0.0' },
          { label: 'SDK', value: '@spawn/agent-sdk' },
        ],
        footer: 'Updated just now',
      });

      // Update status to idle
      agent.updateStatus('idle', 'Ready for commands');

      console.log('');
      console.log('[TEST] Initial messages sent. Waiting for incoming messages...');
      console.log('[TEST] Press Ctrl+C to disconnect');
      console.log('');
    }, 500);
  },

  onMessage: (msg: SpawnMessage) => {
    console.log('');
    console.log('[TEST] Received message:');
    console.log('  Type:', msg.type);
    console.log('  Payload:', JSON.stringify(msg.payload, null, 2));
    console.log('');

    // Handle incoming text messages from user
    if (msg.type === 'message') {
      const payload = msg.payload as { text?: string };
      const text = payload.text || '';

      // Update status to thinking
      agent.updateStatus('thinking', 'Processing...');

      // Simulate processing delay
      setTimeout(() => {
        // Echo back the message
        agent.sendText(`You said: "${text}"`);

        // Handle some simple commands
        if (text.toLowerCase().includes('status')) {
          agent.sendCard({
            title: 'Current Status',
            style: 'info',
            fields: [
              { label: 'Connected', value: 'Yes' },
              { label: 'Messages Received', value: '1+' },
              { label: 'Last Command', value: text },
            ],
          });
        }

        if (text.toLowerCase().includes('help')) {
          agent.sendText(
            'Available commands:\n' +
            '- "status" - Show current status\n' +
            '- "ping" - Test connectivity\n' +
            '- "notify" - Send a test notification',
            'markdown'
          );
        }

        if (text.toLowerCase().includes('ping')) {
          agent.sendText('Pong!');
        }

        if (text.toLowerCase().includes('notify')) {
          agent.notify('Test Notification', 'This is a test notification from Clawdbot!', 'normal');
          agent.sendText('Notification sent!');
        }

        // Return to idle
        agent.updateStatus('idle', 'Ready for commands');
      }, 500);
    }
  },

  onDisconnect: () => {
    console.log('');
    console.log('[TEST] Disconnected from relay');
    console.log('');
  },

  onError: (error: Error) => {
    console.error('');
    console.error('[TEST] Error:', error.message);
    console.error('');
  },
});

// Connect to the relay
console.log('[TEST] Connecting to relay...');
console.log('');

agent.connect().catch((err: Error) => {
  console.error('[TEST] Failed to connect:', err.message);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('[TEST] Shutting down...');
  agent.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  agent.disconnect();
  process.exit(0);
});
