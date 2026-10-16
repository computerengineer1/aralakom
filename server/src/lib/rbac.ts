/**
 * Role-Based Access Control.
 *
 * Deny-by-default: a role only has the permissions explicitly listed here.
 * Resource-level checks (ownership, project assignment) are enforced separately
 * in service code — hiding UI elements is never authorization.
 */
export const ROLES = ['owner', 'admin', 'hr', 'pm', 'accountant', 'engineer', 'worker', 'customer'] as const;
export type Role = (typeof ROLES)[number];

export type Perm =
  | 'settings.read' | 'settings.write'
  | 'users.manage'
  | 'personnel.read' | 'personnel.write' | 'personnel.sensitive' | 'personnel.export' | 'personnel.merge'
  | 'applications.read' | 'applications.review'
  | 'customers.read' | 'customers.write'
  | 'requests.read' | 'requests.manage'
  | 'projects.read_all' | 'projects.write' | 'projects.create'
  | 'schedule.read' | 'schedule.write' | 'attendance.approve' | 'payments.workers'
  | 'quotes.read' | 'quotes.write' | 'quotes.approve'
  | 'contracts.read' | 'contracts.write'
  | 'invoices.read' | 'invoices.write'
  | 'expenses.read' | 'expenses.write'
  | 'finance.reports' | 'rates.manage'
  | 'audit.read' | 'portfolio.manage' | 'notifications.manage';

const OWNER_PERMS: Perm[] = [
  'settings.read', 'settings.write', 'users.manage',
  'personnel.read', 'personnel.write', 'personnel.sensitive', 'personnel.export', 'personnel.merge',
  'applications.read', 'applications.review',
  'customers.read', 'customers.write', 'requests.read', 'requests.manage',
  'projects.read_all', 'projects.write', 'projects.create',
  'schedule.read', 'schedule.write', 'attendance.approve', 'payments.workers',
  'quotes.read', 'quotes.write', 'quotes.approve',
  'contracts.read', 'contracts.write',
  'invoices.read', 'invoices.write',
  'expenses.read', 'expenses.write',
  'finance.reports', 'rates.manage', 'audit.read', 'portfolio.manage', 'notifications.manage',
];

const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: OWNER_PERMS,
  // Administrator: full operational administration. Owner-only guardrails
  // (e.g. editing owner accounts, retention/deletion policies) are enforced
  // in route handlers via requireOwner().
  admin: [...OWNER_PERMS] as Perm[],
  hr: [
    'personnel.read', 'personnel.write', 'personnel.sensitive', 'personnel.export', 'personnel.merge',
    'applications.read', 'applications.review',
    'customers.read', 'requests.read',
    'schedule.read',
  ],
  pm: [
    'personnel.read',
    'requests.read',
    'projects.read_all', 'projects.write',
    'schedule.read', 'schedule.write', 'attendance.approve',
    'quotes.read', 'expenses.read', 'expenses.write',
    'customers.read',
  ],
  accountant: [
    'customers.read', 'customers.write',
    'requests.read',
    'projects.read_all',
    'quotes.read', 'quotes.write', 'quotes.approve',
    'contracts.read', 'contracts.write',
    'invoices.read', 'invoices.write',
    'expenses.read', 'expenses.write',
    'finance.reports', 'rates.manage',
    'personnel.read', 'personnel.sensitive', 'payments.workers',
  ],
  engineer: [], // resource-scoped only: assigned projects, own records (checked inline)
  worker: [],   // resource-scoped only: own profile, assignments, attendance, payments
  customer: [], // resource-scoped only: own requests/quotations/invoices/projects
};

export function hasPerm(role: Role | string | null | undefined, perm: Perm): boolean {
  if (!role) return false;
  const perms = ROLE_PERMS[role as Role];
  if (!perms) return false;
  return perms.includes(perm);
}

export function permsFor(role: Role): Perm[] {
  return ROLE_PERMS[role] ?? [];
}

/** Roles considered privileged: MFA strongly recommended / enforced when configured. */
export const PRIVILEGED_ROLES: Role[] = ['owner', 'admin', 'hr', 'accountant'];

/** Roles allowed to exist as staff accounts in the internal app. */
export const STAFF_ROLES: Role[] = ['owner', 'admin', 'hr', 'pm', 'accountant', 'engineer', 'worker'];
