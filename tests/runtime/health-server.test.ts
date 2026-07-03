import http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

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

  it('stops without error when not started', async () => {
    const server = new HealthServer({
      port: 0,
      host: '127.0.0.1',
      metrics: new MetricsCollector(),
    });

    await expect(server.stop()).resolves.toBeUndefined();
  });
});
