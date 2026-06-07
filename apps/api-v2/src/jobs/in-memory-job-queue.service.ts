import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { JobDefinition, JobQueueProvider, JobSnapshot, JobStatus } from './job-queue.provider';

type StoredJob = JobSnapshot & {
  payload: Record<string, unknown>;
};

@Injectable()
export class InMemoryJobQueueService implements JobQueueProvider {
  private readonly jobs: StoredJob[] = [];

  async enqueue(input: JobDefinition): Promise<JobSnapshot> {
    const now = new Date().toISOString();
    const job: StoredJob = {
      id: randomUUID(),
      name: input.name,
      payload: input.payload ?? {},
      status: 'queued',
      attempts: 0,
      maxAttempts: Math.max(1, Number(input.maxAttempts ?? 3)),
      queuedAt: now,
    };

    this.jobs.unshift(job);
    this.trim();
    queueMicrotask(() => this.run(job.id));
    return this.toSnapshot(job);
  }

  list(): JobSnapshot[] {
    return this.jobs.map((job) => this.toSnapshot(job));
  }

  stats(): Record<JobStatus, number> & { total: number } {
    const base = { queued: 0, running: 0, completed: 0, failed: 0, total: this.jobs.length };
    return this.jobs.reduce((acc, job) => {
      acc[job.status] += 1;
      return acc;
    }, base);
  }

  private run(jobId: string) {
    const job = this.jobs.find((item) => item.id === jobId);
    if (!job || job.status !== 'queued') return;

    job.status = 'running';
    job.attempts += 1;
    job.startedAt = new Date().toISOString();

    try {
      job.status = 'completed';
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : 'Erro desconhecido';
      job.status = job.attempts >= job.maxAttempts ? 'failed' : 'queued';
      if (job.status === 'queued') {
        queueMicrotask(() => this.run(job.id));
      }
    }
  }

  private toSnapshot(job: StoredJob): JobSnapshot {
    const { payload: _payload, ...snapshot } = job;
    return snapshot;
  }

  private trim() {
    if (this.jobs.length > 200) {
      this.jobs.splice(200);
    }
  }
}
