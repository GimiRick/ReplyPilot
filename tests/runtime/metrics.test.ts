import { describe, expect, it } from 'vitest';

import { MetricsCollector } from '../../src/runtime/metrics';

describe('MetricsCollector', () => {
  it('starts with zero counters', () => {
    const metrics = new MetricsCollector();
    const snap = metrics.snapshot();

    expect(snap.messagesReceived).toBe(0);
    expect(snap.messagesIgnored).toBe(0);
    expect(snap.messagesProcessed).toBe(0);
    expect(snap.messagesFailed).toBe(0);
    expect(snap.llmCalls).toBe(0);
    expect(snap.llmErrors).toBe(0);
  });

  it('tracks message counts', () => {
    const metrics = new MetricsCollector();

    metrics.recordMessageReceived();
    metrics.recordMessageReceived();
    metrics.recordMessageIgnored();
    metrics.recordMessageProcessed();
    metrics.recordMessageFailed();

    const snap = metrics.snapshot();
    expect(snap.messagesReceived).toBe(2);
    expect(snap.messagesIgnored).toBe(1);
    expect(snap.messagesProcessed).toBe(1);
    expect(snap.messagesFailed).toBe(1);
  });

  it('tracks LLM call counts and latency', () => {
    const metrics = new MetricsCollector();

    metrics.recordLlmCall(150);
    metrics.recordLlmCall(250);
    metrics.recordLlmCall(100);

    const snap = metrics.snapshot();
    expect(snap.llmCalls).toBe(3);
    expect(snap.llmLatencyMs.avg).toBe(167);
    expect(snap.llmLatencyMs.min).toBe(100);
    expect(snap.llmLatencyMs.max).toBe(250);
    expect(snap.llmLatencyMs.count).toBe(3);
  });

  it('tracks LLM errors separately', () => {
    const metrics = new MetricsCollector();

    metrics.recordLlmCall(200);
    metrics.recordLlmError();
    metrics.recordLlmError();

    const snap = metrics.snapshot();
    expect(snap.llmCalls).toBe(1);
    expect(snap.llmErrors).toBe(2);
  });

  it('returns zero latency values when no calls recorded', () => {
    const metrics = new MetricsCollector();

    const snap = metrics.snapshot();
    expect(snap.llmLatencyMs.avg).toBe(0);
    expect(snap.llmLatencyMs.min).toBe(0);
    expect(snap.llmLatencyMs.max).toBe(0);
    expect(snap.llmLatencyMs.count).toBe(0);
  });

  it('reports positive uptime', () => {
    const metrics = new MetricsCollector();

    expect(metrics.snapshot().uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('tracks processing time durations', () => {
    const metrics = new MetricsCollector();

    metrics.recordProcessingTime(500);
    metrics.recordProcessingTime(1500);
    metrics.recordProcessingTime(1000);

    const snap = metrics.snapshot();
    expect(snap.processingTimeMs.avg).toBe(1000);
    expect(snap.processingTimeMs.min).toBe(500);
    expect(snap.processingTimeMs.max).toBe(1500);
    expect(snap.processingTimeMs.count).toBe(3);
  });

  it('returns zero processing time when none recorded', () => {
    const metrics = new MetricsCollector();

    const snap = metrics.snapshot();
    expect(snap.processingTimeMs.avg).toBe(0);
    expect(snap.processingTimeMs.min).toBe(0);
    expect(snap.processingTimeMs.max).toBe(0);
    expect(snap.processingTimeMs.count).toBe(0);
  });

  it('resets all counters to initial state', () => {
    const metrics = new MetricsCollector();

    metrics.recordMessageReceived();
    metrics.recordLlmCall(500);
    metrics.recordProcessingTime(1000);
    metrics.reset();

    const snap = metrics.snapshot();
    expect(snap.messagesReceived).toBe(0);
    expect(snap.llmCalls).toBe(0);
    expect(snap.processingTimeMs.count).toBe(0);
    expect(snap.uptimeSeconds).toBeLessThanOrEqual(1);
  });
});
