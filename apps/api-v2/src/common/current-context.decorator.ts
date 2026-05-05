import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { buildRequestContextFromHeaders, type RequestContext } from './request-context';

type RequestWithContext = {
  headers: Record<string, string | string[] | undefined>;
  context?: RequestContext;
};

export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest<RequestWithContext>();
  if (request.context) {
    return request.context;
  }
  return buildRequestContextFromHeaders(request.headers);
});
