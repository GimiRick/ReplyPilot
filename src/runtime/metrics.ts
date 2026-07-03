export type MetricsSnapshot = {
  uptimeSeconds: number;
  messagesReceived: number;
  messagesIgnored: number;
  messagesProcessed: number;
  messagesFailed: number;
  llmCalls: number;
  llmErrors: number;
  llmLatencyMs: {
    avg: number;
    min: number;
    max: number;
    count: number;
  };
  processingTimeMs: {
    avg: number;
    min: number;
    max: number;
    count: number;
  };
};

export class MetricsCollector {
  private startTime = Date.now();
  private messagesReceived = 0;
  private messagesIgnored = 0;
  private messagesProcessed = 0;
  private messagesFailed = 0;
  private llmCalls = 0;
  private llmErrors = 0;
  private llmTotalLatency = 0;
  private llmMinLatency = Infinity;
  private llmMaxLatency = 0;
  private processingCount = 0;
  private processingTotalLatency = 0;
  private processingMinLatency = Infinity;
  private processingMaxLatency = 0;

  recordMessageReceived(): void {
    this.messagesReceived++;
  }

  recordMessageIgnored(): void {
    this.messagesIgnored++;
  }

  recordMessageProcessed(): void {
    this.messagesProcessed++;
  }

  recordMessageFailed(): void {
    this.messagesFailed++;
  }

  recordLlmCall(durationMs: number): void {
    this.llmCalls++;
    this.llmTotalLatency += durationMs;
    if (durationMs < this.llmMinLatency) {
      this.llmMinLatency = durationMs;
    }
    if (durationMs > this.llmMaxLatency) {
      this.llmMaxLatency = durationMs;
    }
  }

  recordLlmError(): void {
    this.llmErrors++;
  }

  recordProcessingTime(durationMs: number): void {
    this.processingCount++;
    this.processingTotalLatency += durationMs;
    if (durationMs < this.processingMinLatency) {
      this.processingMinLatency = durationMs;
    }
    if (durationMs > this.processingMaxLatency) {
      this.processingMaxLatency = durationMs;
    }
  }

  reset(): void {
    this.startTime = Date.now();
    this.messagesReceived = 0;
    this.messagesIgnored = 0;
    this.messagesProcessed = 0;
    this.messagesFailed = 0;
    this.llmCalls = 0;
    this.llmErrors = 0;
    this.llmTotalLatency = 0;
    this.llmMinLatency = Infinity;
    this.llmMaxLatency = 0;
    this.processingCount = 0;
    this.processingTotalLatency = 0;
    this.processingMinLatency = Infinity;
    this.processingMaxLatency = 0;
  }

  snapshot(): MetricsSnapshot {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      uptimeSeconds: uptime,
      messagesReceived: this.messagesReceived,
      messagesIgnored: this.messagesIgnored,
      messagesProcessed: this.messagesProcessed,
      messagesFailed: this.messagesFailed,
      llmCalls: this.llmCalls,
      llmErrors: this.llmErrors,
      llmLatencyMs: {
        avg: this.llmCalls > 0 ? Math.round(this.llmTotalLatency / this.llmCalls) : 0,
        min: this.llmCalls > 0 ? this.llmMinLatency : 0,
        max: this.llmCalls > 0 ? this.llmMaxLatency : 0,
        count: this.llmCalls,
      },
      processingTimeMs: {
        avg:
          this.processingCount > 0
            ? Math.round(this.processingTotalLatency / this.processingCount)
            : 0,
        min: this.processingCount > 0 ? this.processingMinLatency : 0,
        max: this.processingCount > 0 ? this.processingMaxLatency : 0,
        count: this.processingCount,
      },
    };
  }
}
