import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://lcmp:lcmp_dev_password_change_me@127.0.0.1:5432/lcmp',
  },
  strict: true,
  verbose: true,
});
