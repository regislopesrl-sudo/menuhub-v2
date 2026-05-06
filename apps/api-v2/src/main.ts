import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigin.length === 1 && corsOrigin[0] === '*' ? true : corsOrigin,
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3202);
  await app.listen(port);
}

void bootstrap();
