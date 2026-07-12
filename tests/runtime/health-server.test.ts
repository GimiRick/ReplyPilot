import http from 'node:http';
import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthServer } from '../../src/runtime/health-server';
import { MetricsCollector } from '../../src/runtime/metrics';

describe('HealthServer', () => {
  let servers: HealthServer[] = [];

  afterEach(async () => {
    for (const server of servers) {
      await server.stop();
    }
    servers = [];
  });

  async function createServer(metrics?: MetricsCollector): Promise<HealthServer> {
    const server = new HealthServer({
      port: 0,
      host: '127.0.0.1',
      metrics: metrics ?? new MetricsCollector(),
    });
    await server.start();
    servers.push(server);
    return server;
  }

  function fetchJson(port: number, path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}${path}`, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Failed to parse: ${data}`));
            }
          });
        })
        .on('error', reject);
    });
  }

  it('serves health endpoint', async () => {
    const server = await createServer();
    const body = (await fetchJson(server.getPort(), '/health')) as Record<string, unknown>;

    expect(body.status).toBe('ok');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('serves metrics endpoint', async () => {
    const metrics = new MetricsCollector();
    metrics.recordMessageReceived();
    metrics.recordLlmCall(100);
    const server = await createServer(metrics);

    const body = (await fetchJson(server.getPort(), '/metrics')) as Record<string, unknown>;

    expect(body.messagesReceived).toBe(1);
    expect(body.llmCalls).toBe(1);
  });

  it('returns 404 for unknown paths', async () => {
    const server = await createServer();

    const res = await new Promise<http.IncomingMessage>((resolve) => {
      http.get(`http://127.0.0.1:${server.getPort()}/unknown`, resolve);
    });

    expect(res.statusCode).toBe(404);
  });

  it('reflects updated health status', async () => {
    const server = await createServer();

    server.setHealth({ status: 'degraded' });

    const body = (await fetchJson(server.getPort(), '/health')) as Record<string, unknown>;
    expect(body.status).toBe('degraded');
  });

  it('returns the configured port before server starts', async () => {
    const server = new HealthServer({
      port: 12345,
      host: '127.0.0.1',
      metrics: new MetricsCollector(),
    });

    expect(server.getPort()).toBe(12345);
  });

  it('catches writeHead errors and sends 500 response', async () => {
    const server = await createServer();
    const port = server.getPort();

    const origWriteHead = http.ServerResponse.prototype.writeHead;
    const spy = vi.spyOn(http.ServerResponse.prototype, 'writeHead').mockImplementationOnce(
      function (this: http.ServerResponse, ...args: Parameters<typeof http.ServerResponse.prototype.writeHead>) {
        if (args[0] === 200) {
          throw new Error('writeHead failed');
        }
        return origWriteHead.call(this, ...args);
      },
    );

    try {
      const res = await new Promise<http.IncomingMessage>((resolve) => {
        http.get(`http://127.0.0.1:${port}/health`, resolve);
      });

      expect(res.statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
  });

  it('logs server errors without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = new HealthServer({
      port: 0,
      host: '127.0.0.1',
      metrics: new MetricsCollector(),
    });
    await server.start();
    servers.push(server);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).server.emit('error', new Error('test error'));

    expect(consoleSpy).toHaveBeenCalledWith('Health server error:', 'test error');
    consoleSpy.mockRestore();
  });

  it('recovers from a client socket disconnect before a request is sent', async () => {
    const server = await createServer();
    const port = server.getPort();

    // Connect and immediately destroy the socket. The server should not crash
    // and should remain operational for subsequent requests.
    await new Promise<void>((resolve) => {
      const socket = new net.Socket();
      socket.connect(port, '127.0.0.1', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => resolve());
    });

    // Server should still be operational
    const body = (await fetchJson(port, '/health')) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('stops without error when not started', async () => {
    const server = new HealthServer({
      port: 0,
      host: '127.0.0.1',
      metrics: new MetricsCollector(),
    });

    await expect(server.stop()).resolves.toBeUndefined();
  });
});
