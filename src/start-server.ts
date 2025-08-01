#!/usr/bin/env node

import { BridgeServer } from './bridge-server.js';
import { normalizeLogLevel } from './utils.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHttpApp, startHttpServer } from './mcp-http-transport.js';

// Parse command line arguments
const args = process.argv.slice(2);
// MCP is always enabled - it's in our product name!

const port = parseInt(process.env.WS_PORT || '8080', 10);
const host = process.env.WS_HOST || '0.0.0.0';
const logLevel = normalizeLogLevel(process.env.LOG_LEVEL);
const mcpToken = process.env.MCP_TOKEN;

// Only enable HTTP transport if explicitly requested
const enableHttpTransport = args.includes('--mcp-http') || !!process.env.MCP_PORT || !!mcpToken;

console.log('🚀 Starting ble-mcp-test Server');
console.log('\n📡 Bridge Configuration:');
console.log(`   WebSocket: ${host}:${port}`);
console.log(`   Log level: ${logLevel}`);
console.log('   Device-agnostic - UUIDs provided by client');

// Show any BLE timing overrides
const bleOverrides = [
  'BLE_CONNECTION_STABILITY',
  'BLE_PRE_DISCOVERY_DELAY', 
  'BLE_NOBLE_RESET_DELAY',
  'BLE_SCAN_TIMEOUT',
  'BLE_CONNECTION_TIMEOUT',
  'BLE_DISCONNECT_COOLDOWN'
].filter(key => process.env[key]);

if (bleOverrides.length > 0) {
  console.log('   BLE timing overrides:');
  bleOverrides.forEach(key => {
    console.log(`     ${key}: ${process.env[key]}ms`);
  });
}

// Show MCP configuration
console.log('\n🔌 MCP Server Configuration:');

// Check if we have TTY for stdio
const hasTty = process.stdin.isTTY && process.stdout.isTTY;
if (hasTty && !process.env.DISABLE_STDIO) {
  console.log('   Stdio transport: Enabled (default)');
} else if (process.env.DISABLE_STDIO) {
  console.log('   Stdio transport: Disabled (DISABLE_STDIO set)');
} else {
  console.log('   Stdio transport: Disabled (no TTY)');
}

if (enableHttpTransport) {
  console.log(`   HTTP transport: Port ${process.env.MCP_PORT || '8081'}`);
  if (mcpToken) {
    console.log('   Authentication: Bearer token required');
  } else {
    console.log('   Authentication: ⚠️  None (local network only!)');
  }
} else {
  console.log('   HTTP transport: Disabled (use --mcp-http or set MCP_TOKEN/MCP_PORT to enable)');
}

console.log('\n   Press Ctrl+C to stop\n');

const server = new BridgeServer(logLevel);

// Start server and handle startup errors
server.start(port).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Initialize MCP transports - always enabled
const mcpServer = server.getMcpServer();

// Auto-detect TTY and enable stdio transport (default)
if (hasTty && !process.env.DISABLE_STDIO) {
  const stdioTransport = new StdioServerTransport();
  mcpServer.connect(stdioTransport).then(() => {
    console.log('[MCP] Stdio transport connected');
  }).catch(error => {
    console.error('[MCP] Failed to connect stdio transport:', error);
  });
}

// Start HTTP transport only if explicitly enabled
if (enableHttpTransport) {
  const httpApp = createHttpApp(mcpServer, mcpToken);
  startHttpServer(httpApp);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});