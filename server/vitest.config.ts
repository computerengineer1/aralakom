import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    globalSetup: ['tests/global-setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://lcmp:lcmp_dev_password_change_me@127.0.0.1:5432/lcmp_test',
      ALLOW_DEMO_SEED: 'true',
      DEMO_OWNER_PASSWORD: 'Demo!Owner123',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
      UPLOAD_DIR: './data/test-uploads',
      LOG_LEVEL: 'error',
    },
  },
});
