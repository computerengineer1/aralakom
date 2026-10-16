/**
 * Secure initial owner-account setup.
 *
 * Usage:
 *   OWNER_SETUP_TOKEN=<random> npm run setup:owner -- --email owner@company.com --token <random>
 *
 * The password is prompted interactively (hidden) or read from stdin, never from
 * argv (shell history safety). If a token is configured in the environment, it
 * must be supplied and matched (constant-time). There is NO default password.
 */
import { createInterface } from 'node:readline';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, closeDb } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword, validatePasswordStrength } from './lib/password.js';
import { config } from './config.js';
import { safeEqual } from './lib/tokens.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(question);
    let buf = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    const onData = (ch: Buffer): void => {
      const s = ch.toString('utf8');
      if (s === '\n' || s === '\r' || s === '\u0004') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(buf);
        return;
      }
      if (s === '\u0003') { // Ctrl+C
        stdin.setRawMode?.(false);
        process.exit(130);
      }
      if (s === '\u007f' || s === '\b') { // backspace
        buf = buf.slice(0, -1);
        return;
      }
      buf += s;
      stdout.write('*');
    };
    stdin.on('data', onData);
  });
}

async function promptPlain(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main(): Promise<void> {
  const db = getDb();

  const token = getArg('token') ?? process.env.OWNER_SETUP_TOKEN_CLI ?? '';
  if (config.ownerSetupToken) {
    if (!token || !safeEqual(token, config.ownerSetupToken)) {
      console.error('OWNER_SETUP_TOKEN mismatch. Aborting.');
      process.exit(1);
    }
  } else {
    console.warn('WARNING: OWNER_SETUP_TOKEN is not configured; anyone with shell access can run this script.');
  }

  const existingOwner = await db.select({ id: users.id, email: users.email }).from(users)
    .where(and(eq(users.role, 'owner'), isNull(users.deletedAt))).limit(1);
  if (existingOwner[0]) {
    console.error(`An owner account already exists (${existingOwner[0].email}). Refusing to create another.`);
    await closeDb();
    process.exit(1);
  }

  let email = getArg('email');
  if (!email) email = await promptPlain('Owner email: ');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) {
    console.error('Invalid email.');
    process.exit(1);
  }

  const stdinIsTty = process.stdin.isTTY;
  let password: string;
  if (stdinIsTty) {
    password = await promptHidden('Owner password (min 10 chars, letters+digits): ');
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  } else {
    // Non-interactive: read password from stdin (piped). Used by automated setup.
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    password = Buffer.concat(chunks).toString('utf8').trim();
  }

  const issues = validatePasswordStrength(password);
  if (issues.length) {
    console.error('Password does not meet policy:', issues.map((i) => i.code).join(', '));
    process.exit(1);
  }

  const name = getArg('name') ?? (stdinIsTty ? await promptPlain('Owner full name: ') : 'System Owner');
  const hash = await hashPassword(password);
  const [row] = await db.insert(users).values({
    email: email!.toLowerCase(),
    fullName: name,
    role: 'owner',
    passwordHash: hash,
    status: 'active',
    locale: 'en',
  }).returning({ id: users.id, email: users.email });

  console.log(`Owner account created: ${row!.email} (${row!.id})`);
  console.log('Next: sign in, enable MFA (Profile → Security), and update company settings.');
  await closeDb();
}

main().catch(async (err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
