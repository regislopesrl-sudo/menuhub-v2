import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { buildRequestContextFromHeaders, type RequestContext } from './request-context';

export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  return buildRequestContextFromHeaders(request.headers);
});

