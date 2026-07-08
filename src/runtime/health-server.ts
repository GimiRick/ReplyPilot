import http from 'node:http';

import { type MetricsCollector } from './metrics';

export type HealthServerOptions = {
  port: number;
  host: string;
  metrics: MetricsCollector;
};

export type HealthInfo = {
  status: 'ok' | 'degraded' | 'error';
};

export class HealthServer {
  private readonly server: http.Server;
  private readonly metrics: MetricsCollector;
  private readonly port: number;
  private readonly host: string;
  private health: HealthInfo = { status: 'ok' };

  constructor(options: HealthServerOptions) {
    this.metrics = options.metrics;
    this.port = options.port;
    this.host = options.host;
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  setHealth(health: HealthInfo): void {
    this.health = health;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.removeAllListeners('error');
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.closeAllConnections();
      this.server.close(() => resolve());
    });
  }

  getPort(): number {
    const addr = this.server.address();
    if (addr && typeof addr === 'object') {
      return addr.port;
    }
    return this.port;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: this.health.status,
            uptimeSeconds: this.metrics.snapshot().uptimeSeconds,
          }),
        );
        return;
      }

      if (req.url === '/metrics' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.metrics.snapshot()));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
