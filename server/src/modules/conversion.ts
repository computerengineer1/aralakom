/**
 * Conversion helpers shared by application/request workflows.
 * Conversions run inside the caller's transaction so no partial state is possible.
 */
import { eq, and, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { applications, personnel, customers, requests, projects } from '../db/schema.js';
import { nextReference } from '../lib/ref.js';
import { badRequest } from '../lib/http.js';

type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** Create a personnel record from an approved application (explicit HR action). */
export async function nextPersonnelFromApplication(tx: Tx, app: typeof applications.$inferSelect, actorId: string): Promise<string> {
  const recordNo = await nextReference(tx as Db, { prefix: 'EMP', yearScoped: false, width: 6 });
  const [row] = await tx.insert(personnel).values({
    recordNo,
    personType: app.personType,
    fullName: app.fullName,
    phone: app.phone,
    email: app.email,
    categoryId: app.categoryId,
    secondarySkills: app.skills,
    experienceYears: app.experienceYears,
    qualifications: app.qualifications,
    languages: app.languages,
    governorate: app.governorate,
    district: app.district,
    town: app.town,
    employmentStatus: 'active',
    availability: 'available',
    hireDate: new Date().toISOString().slice(0, 10),
    notes: `Created from application ${app.reference}`,
    sourceApplicationId: app.id,
    createdBy: actorId,
    updatedBy: actorId,
  }).returning({ id: personnel.id });
  await tx.update(applications).set({ personnelId: row!.id }).where(eq(applications.id, app.id));
  return row!.id;
}

/** Convert an accepted customer request into a project, preserving history. */
export async function convertRequestToProject(
  tx: Tx,
  requestId: string,
  input: { name: string; description?: string | null; managerId?: string | null; startDate?: string | null; targetEndDate?: string | null; contractAmount?: string | null; contractCurrency?: 'LBP' | 'USD' | null; priority?: 'low' | 'normal' | 'high' | 'urgent' },
  actorId: string,
): Promise<{ projectId: string; projectNo: string; customerId: string }> {
  const db = tx as Db;
  const [reqRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!reqRow) throw badRequest('NOT_FOUND', 'Request not found');
  if (!['accepted', 'contracted', 'quotation_sent'].includes(reqRow.status)) {
    throw badRequest('INVALID_STATE', `Request in status '${reqRow.status}' cannot be converted; it must be accepted first`);
  }
  if (reqRow.projectId) throw badRequest('ALREADY_CONVERTED', 'This request is already linked to a project');

  let customerId = reqRow.customerId;
  if (!customerId) {
    const [cust] = await db.insert(customers).values({
      name: reqRow.contactName, company: reqRow.company, phone: reqRow.phone,
      email: reqRow.email, language: reqRow.language,
      address: [reqRow.town, reqRow.district, reqRow.governorate].filter(Boolean).join(', '),
    }).returning({ id: customers.id });
    customerId = cust!.id;
    await db.update(requests).set({ customerId }).where(eq(requests.id, requestId));
  }

  const projectNo = await nextReference(db, { prefix: 'PRJ', width: 4 });
  const [proj] = await db.insert(projects).values({
    projectNo,
    name: input.name,
    customerId,
    requestId,
    description: input.description ?? reqRow.description,
    governorate: reqRow.governorate,
    district: reqRow.district,
    town: reqRow.town,
    status: 'planning',
    priority: input.priority ?? 'normal',
    managerId: input.managerId ?? null,
    startDate: input.startDate ?? null,
    targetEndDate: input.targetEndDate ?? null,
    contractAmount: input.contractAmount ?? null,
    contractCurrency: input.contractCurrency ?? null,
    createdBy: actorId,
  }).returning({ id: projects.id });

  await db.update(requests).set({ projectId: proj!.id, status: 'contracted' }).where(eq(requests.id, requestId));
  return { projectId: proj!.id, projectNo, customerId };
}

export { isNull, and };
