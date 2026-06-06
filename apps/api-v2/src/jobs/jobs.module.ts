import { Module } from '@nestjs/common';
import { InMemoryJobQueueService } from './in-memory-job-queue.service';

@Module({
  providers: [InMemoryJobQueueService],
  exports: [InMemoryJobQueueService],
})
export class JobsModule {}
