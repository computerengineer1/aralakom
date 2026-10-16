import { describe, expect, it } from 'vitest';
import { hasPerm, permsFor, PRIVILEGED_ROLES, ROLES } from '../src/lib/rbac.js';
import { validatePasswordStrength } from '../src/lib/password.js';
import { redact } from '../src/lib/audit.js';
import { sniffMime } from '../src/lib/files.js';

describe('RBAC (deny by default)', () => {
  it('denies everything for unknown/empty roles', () => {
    expect(hasPerm(null, 'settings.read')).toBe(false);
    expect(hasPerm(undefined, 'personnel.read')).toBe(false);
    expect(hasPerm('hacker' as never, 'users.manage')).toBe(false);
    expect(hasPerm('customer', 'personnel.read')).toBe(false);
  });

  it('worker/engineer/customer have no global permissions (resource-scoped only)', () => {
    expect(permsFor('worker')).toEqual([]);
    expect(permsFor('engineer')).toEqual([]);
    expect(permsFor('customer')).toEqual([]);
  });

  it('HR can review applications but not manage finances', () => {
    expect(hasPerm('hr', 'applications.review')).toBe(true);
    expect(hasPerm('hr', 'personnel.sensitive')).toBe(true);
    expect(hasPerm('hr', 'quotes.approve')).toBe(false);
    expect(hasPerm('hr', 'invoices.write')).toBe(false);
    expect(hasPerm('hr', 'users.manage')).toBe(false);
    expect(hasPerm('hr', 'settings.write')).toBe(false);
  });

  it('accountant has finance permissions but not user management', () => {
    expect(hasPerm('accountant', 'invoices.write')).toBe(true);
    expect(hasPerm('accountant', 'quotes.approve')).toBe(true);
    expect(hasPerm('accountant', 'finance.reports')).toBe(true);
    expect(hasPerm('accountant', 'users.manage')).toBe(false);
    expect(hasPerm('accountant', 'applications.review')).toBe(false);
    expect(hasPerm('accountant', 'settings.write')).toBe(false);
  });

  it('PM can write projects/schedule but not approve quotes or manage users', () => {
    expect(hasPerm('pm', 'projects.write')).toBe(true);
    expect(hasPerm('pm', 'schedule.write')).toBe(true);
    expect(hasPerm('pm', 'attendance.approve')).toBe(true);
    expect(hasPerm('pm', 'quotes.approve')).toBe(false);
    expect(hasPerm('pm', 'payments.workers')).toBe(false);
    expect(hasPerm('pm', 'users.manage')).toBe(false);
    expect(hasPerm('pm', 'audit.read')).toBe(false);
  });

  it('owner and admin have full permissions', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(hasPerm(role, 'settings.write')).toBe(true);
      expect(hasPerm(role, 'users.manage')).toBe(true);
      expect(hasPerm(role, 'audit.read')).toBe(true);
    }
  });

  it('privileged roles are flagged for MFA policy', () => {
    expect(PRIVILEGED_ROLES).toContain('owner');
    expect(PRIVILEGED_ROLES).toContain('accountant');
    expect(PRIVILEGED_ROLES).not.toContain('worker');
    expect(ROLES.length).toBe(8);
  });
});

describe('password policy', () => {
  it('rejects weak passwords', () => {
    expect(validatePasswordStrength('short1').some((i) => i.code === 'too_short')).toBe(true);
    expect(validatePasswordStrength('password').some((i) => i.code === 'common')).toBe(true);
    expect(validatePasswordStrength('abcdefghijk').some((i) => i.code === 'no_digits')).toBe(true);
    expect(validatePasswordStrength('123456789012').some((i) => i.code === 'no_letters')).toBe(true);
  });
  it('accepts strong passwords', () => {
    expect(validatePasswordStrength('Str0ng-Pass!2026')).toEqual([]);
  });
});

describe('audit redaction', () => {
  it('redacts sensitive keys at any depth', () => {
    const out = redact({ email: 'a@b.c', password: 'x', nested: { token: 'y', ok: 1 }, arr: [{ secret: 'z' }] }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect(((out.arr as unknown[])[0] as Record<string, unknown>).secret).toBe('[redacted]');
    expect(out.email).toBe('a@b.c');
  });
});

describe('file type sniffing', () => {
  it('detects real mime types from magic bytes', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(sniffMime(Buffer.from('hello world'))).toBe(null);
  });
});
