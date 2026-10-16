import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordIssues {
  code: 'too_short' | 'too_long' | 'no_letters' | 'no_digits' | 'common';
}

const COMMON = new Set([
  'password', 'password1', '123456', '12345678', '123456789', 'qwerty', 'qwerty123',
  'abc12345', 'letmein', 'welcome1', 'iloveyou', 'password123', 'admin123', '1234567890',
]);

/** Basic strength policy; document that stronger policies can be layered via config. */
export function validatePasswordStrength(pw: string): PasswordIssues[] {
  const issues: PasswordIssues[] = [];
  if (pw.length < 10) issues.push({ code: 'too_short' });
  if (pw.length > 128) issues.push({ code: 'too_long' });
  if (!/[A-Za-z\u0600-\u06FF]/.test(pw)) issues.push({ code: 'no_letters' });
  if (!/[0-9]/.test(pw)) issues.push({ code: 'no_digits' });
  if (COMMON.has(pw.toLowerCase())) issues.push({ code: 'common' });
  return issues;
}
