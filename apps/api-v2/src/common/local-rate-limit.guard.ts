import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isProductionLike } from './runtime-env';

type HttpRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

@Injectable()
export class LocalRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!this.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const now = Date.now();
    const windowMs = this.positiveNumber(process.env.LOCAL_RATE_LIMIT_WINDOW_MS, 60_000);
    const maxRequests = this.positiveNumber(process.env.LOCAL_RATE_LIMIT_MAX, 600);
    const key = this.buildKey(request);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      this.compact(now);
      return true;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      throw new HttpException('Muitas requisicoes em curto periodo. Aguarde e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private isEnabled(): boolean {
    if (process.env.LOCAL_RATE_LIMIT_ENABLED === 'false') {
      return false;
    }
    if (process.env.LOCAL_RATE_LIMIT_ENABLED === 'true') {
      return true;
    }
    const appEnv = String(process.env.APP_ENV ?? '').toLowerCase();
    return !isProductionLike() && ['local', 'dev', 'development'].includes(appEnv);
  }

  private buildKey(request: HttpRequest): string {
    const forwarded = this.firstHeader(request.headers['x-forwarded-for'])?.split(',')[0]?.trim();
    const ip = forwarded || request.ip || request.socket?.remoteAddress || 'local';
    const companyId = this.firstHeader(request.headers['x-company-id']) ?? 'no-company';
    return `${companyId}:${ip}`;
  }

  private firstHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private compact(now: number) {
    if (buckets.size < 1000) return;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }
}
