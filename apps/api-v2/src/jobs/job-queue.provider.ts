export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type JobDefinition<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  name: string;
  payload?: TPayload;
  maxAttempts?: number;
};

export type JobSnapshot = {
  id: string;
  name: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
};

export interface JobQueueProvider {
  enqueue(input: JobDefinition): Promise<JobSnapshot>;
  list(): JobSnapshot[];
  stats(): Record<JobStatus, number> & { total: number };
}
