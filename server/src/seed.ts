/**
 * DEVELOPMENT / DEMO seed data.
 *
 * Refuses to run unless ALLOW_DEMO_SEED=true. Creates demo accounts with a
 * printed one-time password, configurable categories/services, and realistic
 * sample records across all modules. NEVER use in production.
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from './db/index.js';
import * as S from './db/schema.js';
import { hashPassword } from './lib/password.js';
import { setSetting } from './lib/settings.js';
import { config } from './config.js';
import { lineTotal, computeTotals } from './lib/money.js';

const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'Demo!Owner123';

async function main(): Promise<void> {
  if (!config.allowDemoSeed) {
    console.error('Refusing to seed: ALLOW_DEMO_SEED is not true. This script is for development/demo only.');
    process.exit(1);
  }
  const db = getDb();
  console.log('Seeding demo data (development only)...');

  // ---- settings
  await setSetting(db, 'company', {
    nameEn: 'Al-Binaa Contracting & Finishing',
    nameAr: 'البناء للمقاولات والتشطيبات',
    taglineEn: 'Construction, finishing and contracting services across Lebanon',
    taglineAr: 'خدمات البناء والتشطيب والمقاولات في كل لبنان',
    phone: '+961 1 234 567', whatsapp: '+961 3 456 789', email: 'demo@example.com',
    addressEn: 'Dora Highway, Beirut, Lebanon', addressAr: 'أوتوستراد الدورة، بيروت، لبنان',
    defaultLocale: 'ar', primaryCurrency: 'USD',
    aboutEn: 'DEMO COMPANY — Al-Binaa delivers building, painting, tiling, plastering, gypsum, electrical, plumbing, carpentry, aluminum, waterproofing, renovation and maintenance works across Lebanon since 2009.',
    aboutAr: 'شركة تجريبية — البناء تنفّذ أعمال البناء والدهان والبلاط والقصارة والجبس والكهرباء والسباكة والنجارة والألمنيوم والعزل والترميم والصيانة في لبنان منذ ٢٠٠٩.',
  }, null);

  // ---- categories (trades)
  const trades: Array<[string, string, string]> = [
    ['painter', 'Painter', 'دهّان'],
    ['mason', 'Builder / Mason', 'بنّاء'],
    ['tile_installer', 'Tile installer', 'مبلّط'],
    ['plasterer', 'Plasterer', 'قصّار'],
    ['gypsum', 'Gypsum board installer', 'فنّي جبس وأسقف مستعارة'],
    ['electrician', 'Electrician', 'كهربائي'],
    ['plumber', 'Plumber', 'سبّاك'],
    ['carpenter', 'Carpenter', 'نجّار'],
    ['aluminum', 'Aluminum technician', 'فنّي ألمنيوم'],
    ['welder', 'Welder', 'لحّام'],
    ['waterproofing', 'Waterproofing specialist', 'اختصاصي عزل'],
    ['hvac', 'HVAC technician', 'فنّي تكييف'],
    ['heavy_equipment', 'Heavy equipment operator', 'سائق آليات ثقيلة'],
    ['laborer', 'General laborer', 'عامل عادي'],
  ];
  const engineers: Array<[string, string, string]> = [
    ['civil_eng', 'Civil engineer', 'مهندس مدني'],
    ['arch_eng', 'Architectural engineer', 'مهندس معماري'],
    ['elec_eng', 'Electrical engineer', 'مهندس كهرباء'],
    ['mech_eng', 'Mechanical engineer', 'مهندس ميكانيك'],
    ['site_supervisor', 'Site supervisor', 'مشرف موقع'],
    ['quantity_surveyor', 'Quantity surveyor', 'مسّاح كميات'],
    ['safety_officer', 'Safety officer', 'مسؤول سلامة'],
  ];
  const requestCats: Array<[string, string, string]> = [
    ['new_construction', 'New construction', 'بناء جديد'],
    ['painting_req', 'Painting', 'أعمال دهان'],
    ['tiling_req', 'Tiling', 'أعمال بلاط'],
    ['renovation_req', 'Renovation', 'ترميم'],
    ['plaster_gypsum', 'Plastering & gypsum', 'قصارة وجبس'],
    ['electrical_req', 'Electrical work', 'أعمال كهرباء'],
    ['plumbing_req', 'Plumbing', 'أعمال سباكة'],
    ['carpentry_aluminum', 'Carpentry & aluminum', 'نجارة وألمنيوم'],
    ['waterproofing_req', 'Waterproofing & insulation', 'عزل ورطوبة'],
    ['maintenance_req', 'Maintenance', 'صيانة'],
    ['full_finishing', 'Full apartment/building finishing', 'تشطيب كامل'],
    ['custom_project', 'Custom construction project', 'مشروع خاص'],
  ];
  const catIds: Record<string, string> = {};
  for (const [group, list] of [['trade', trades], ['engineering', engineers], ['request', requestCats]] as const) {
    for (let i = 0; i < list.length; i++) {
      const [code, en, ar] = list[i]!;
      const [row] = await db.insert(S.categories).values({
        kind: group, code, nameEn: en, nameAr: ar, sortOrder: i,
      }).onConflictDoNothing().returning({ id: S.categories.id });
      if (row) catIds[code] = row.id;
      else {
        const [ex] = await db.select({ id: S.categories.id }).from(S.categories)
          .where(sql`kind = ${group} AND code = ${code}`).limit(1);
        if (ex) catIds[code] = ex.id;
      }
    }
  }

  // ---- services (public website)
  const svcList: Array<[string, string, string, string, string, string]> = [
    ['construction', 'Construction & Building', 'البناء والتشييد', 'Structural works, concrete, masonry and complete building execution.', 'أعمال الهيكل والباطون والبناء وتنفيذ المباني الكاملة.', 'building'],
    ['painting', 'Painting & Decoration', 'الدهان والديكور', 'Interior and exterior painting, decorative finishes and protective coatings.', 'دهان داخلي وخارجي وتشطيبات ديكورية وطلاءات واقية.', 'brush'],
    ['tiling', 'Tiling & Marble', 'البلاط والرخام', 'Floor and wall tiling, marble, granite and mosaic installation.', 'تبليط أرضيات وجدران ورخام وجرانيت وموزاييك.', 'grid'],
    ['gypsum', 'Gypsum & False Ceilings', 'الجبس والأسقف المستعارة', 'Gypsum board partitions, false ceilings and decorative cornices.', 'قواطع جبس بورد وأسقف مستعارة وكورنيش ديكوري.', 'layers'],
    ['electrical', 'Electrical Works', 'الأعمال الكهربائية', 'Full electrical installations, panels, lighting and low-current systems.', 'تمديدات كهربائية كاملة ولوحات وإنارة وأنظمة تيار خفيف.', 'bolt'],
    ['plumbing', 'Plumbing & Sanitary', 'السباكة والصحي', 'Water supply, drainage, sanitary units and water heating systems.', 'تمديدات مياه وصرف صحي وأدوات صحية وأنظمة تسخين مياه.', 'droplet'],
    ['carpentry', 'Carpentry & Aluminum', 'النجارة والألمنيوم', 'Doors, kitchens, closets, aluminum windows and facade systems.', 'أبواب ومطابخ وخزائن ونوافذ ألمنيوم وواجهات.', 'hammer'],
    ['waterproofing', 'Waterproofing & Insulation', 'العزل المائي والحراري', 'Roof, foundation and wet-area waterproofing with warranty.', 'عزل أسطح وأساسات ومناطق رطبة مع ضمان.', 'shield'],
    ['renovation', 'Renovation & Maintenance', 'الترميم والصيانة', 'Complete renovation, finishing upgrades and periodic maintenance contracts.', 'ترميم شامل وتحديث تشطيبات وعقود صيانة دورية.', 'refresh'],
  ];
  for (let i = 0; i < svcList.length; i++) {
    const [slug, en, ar, sEn, sAr, icon] = svcList[i]!;
    await db.insert(S.services).values({
      slug, titleEn: en, titleAr: ar, summaryEn: sEn, summaryAr: sAr, iconKey: icon, sortOrder: i, published: true,
    }).onConflictDoNothing();
  }

  // ---- users (demo accounts)
  const pw = await hashPassword(DEMO_PASSWORD);
  const demoAccounts: Array<[string, string, S.User['role']]> = [
    ['owner@demo.local', 'Demo Owner', 'owner'],
    ['admin@demo.local', 'Demo Administrator', 'admin'],
    ['hr@demo.local', 'Demo HR Manager', 'hr'],
    ['pm@demo.local', 'Demo Project Manager', 'pm'],
    ['accountant@demo.local', 'Demo Accountant', 'accountant'],
    ['engineer@demo.local', 'Demo Site Engineer', 'engineer'],
  ];
  const userIds: Record<string, string> = {};
  for (const [email, name, role] of demoAccounts) {
    const [row] = await db.insert(S.users).values({
      email, fullName: name, role, passwordHash: pw, status: 'active', locale: 'en',
    }).onConflictDoNothing().returning({ id: S.users.id });
    if (row) userIds[role] = row.id;
    else {
      const [ex] = await db.select({ id: S.users.id }).from(S.users).where(sql`email = ${email}`).limit(1);
      if (ex) userIds[role] = ex.id;
    }
  }

  // ---- personnel
  const people: Array<[string, S.Personnel['personType'], string, string, string, string, number]> = [
    ['Ahmad Khalil', 'worker', 'painter', 'Beirut', '+9613100001', 'active', 12],
    ['Mahmoud Saad', 'worker', 'mason', 'Mount Lebanon', '+9613100002', 'active', 20],
    ['Hassan Darwish', 'worker', 'tile_installer', 'South', '+9613100003', 'active', 9],
    ['Elias Khoury', 'worker', 'electrician', 'Mount Lebanon', '+9613100004', 'active', 15],
    [' Bilal Odeh', 'worker', 'plumber', 'North', '+9613100005', 'active', 8],
    ['Yousef Haddad', 'technician', 'aluminum', 'Beqaa', '+9613100006', 'active', 11],
    [' Georges Nassar', 'technician', 'hvac', 'Mount Lebanon', '+9613100007', 'on_leave', 7],
    ['Rami Zeidan', 'worker', 'gypsum', 'Beirut', '+9613100008', 'active', 6],
    ['Sari Ghanem', 'worker', 'waterproofing', 'South', '+9613100009', 'active', 10],
    ['Omar Barakat', 'worker', 'carpenter', 'North', '+9613100010', 'candidate', 4],
    ['Eng. Lara Hamdan', 'engineer', 'civil_eng', 'Beirut', '+9613200001', 'active', 9],
    ['Eng. Tarek Fakhoury', 'engineer', 'arch_eng', 'Mount Lebanon', '+9613200002', 'active', 14],
    ['Eng. Nadim Sleiman', 'engineer', 'elec_eng', 'North', '+9613200003', 'active', 6],
    ['Fouad Mrad', 'technician', 'site_supervisor', 'Beqaa', '+9613200004', 'active', 18],
    ['Ziad Aboud', 'technician', 'quantity_surveyor', 'Beirut', '+9613200005', 'active', 12],
  ];
  const personnelIds: string[] = [];
  for (let i = 0; i < people.length; i++) {
    const [name, ptype, catCode, gov, phone, status, exp] = people[i]!;
    const [row] = await db.insert(S.personnel).values({
      recordNo: `EMP-${String(i + 1).padStart(6, '0')}`,
      personType: ptype, fullName: name.trim(), phone, governorate: gov,
      categoryId: catIds[catCode] ?? null, experienceYears: exp,
      employmentStatus: status as S.Personnel['employmentStatus'],
      availability: status === 'on_leave' ? 'unavailable' : 'available',
      payModel: ptype === 'engineer' ? 'monthly' : 'day_rate',
      rateAmount: ptype === 'engineer' ? '1200.0000' : '45.0000',
      rateCurrency: 'USD',
      hireDate: '2023-01-15',
      createdBy: userIds.hr ?? null,
    }).onConflictDoNothing().returning({ id: S.personnel.id });
    if (row) personnelIds.push(row.id);
  }

  // link engineer user to personnel record
  if (userIds.engineer && personnelIds[10]) {
    await db.update(S.users).set({ personnelId: personnelIds[10] }).where(sql`id = ${userIds.engineer}`);
  }

  // ---- customers + requests
  const custDefs: Array<[string, string | null, string, string]> = [
    ['Karim Mezher', 'Mezher Trading SAL', '+9613300001', 'karim@example.com'],
    ['Sonia Abi Rahal', null, '+9613300002', 'sonia@example.com'],
    ['Bahaa Industries', 'Bahaa Industries SARL', '+9613300003', 'ops@bahaa.example'],
  ];
  const customerIds: string[] = [];
  for (const [name, company, phone, email] of custDefs) {
    const [row] = await db.insert(S.customers).values({ name, company, phone, email, language: 'ar' })
      .onConflictDoNothing().returning({ id: S.customers.id });
    if (row) customerIds.push(row.id);
  }

  const reqDefs: Array<[string, string, S.Request['status'], string]> = [
    ['Full finishing of a 220m² apartment in Ashrafieh', 'full_finishing', 'estimating', customerIds[0]!],
    ['Exterior painting of a 4-floor building, Jounieh', 'painting_req', 'submitted', customerIds[1]!],
    ['Waterproofing of factory roof, Choueifat', 'waterproofing_req', 'quotation_sent', customerIds[2]!],
  ];
  const requestIds: string[] = [];
  for (let i = 0; i < reqDefs.length; i++) {
    const [desc, catCode, status, custId] = reqDefs[i]!;
    const [row] = await db.insert(S.requests).values({
      reference: `REQ-${new Date().getFullYear()}-${String(i + 1).padStart(6, '0')}`,
      accessTokenHash: `demo-${i}`, // demo only; real tokens are random hashes
      customerId: custId, contactName: custDefs[i]![0], phone: custDefs[i]![2], email: custDefs[i]![3],
      language: 'ar', categoryId: catIds[catCode] ?? null, description: desc,
      governorate: 'Mount Lebanon', status, consentGiven: true,
      assignedTo: userIds.pm ?? null,
    }).onConflictDoNothing().returning({ id: S.requests.id });
    if (row) requestIds.push(row.id);
  }

  // ---- projects
  const projDefs: Array<[string, string, S.Project['status'], string | null]> = [
    ['Ashrafieh Apartment Finishing', 'Ashrafieh, Beirut', 'in_progress', customerIds[0]!],
    ['Jounieh Building Repaint', 'Jounieh, Keserwan', 'planning', customerIds[1]!],
    ['Choueifat Factory Roof Waterproofing', 'Choueifat, Aley', 'in_progress', customerIds[2]!],
  ];
  const projectIds: string[] = [];
  for (let i = 0; i < projDefs.length; i++) {
    const [name, loc, status, custId] = projDefs[i]!;
    const [row] = await db.insert(S.projects).values({
      projectNo: `PRJ-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      name, customerId: custId, requestId: requestIds[i] ?? null,
      description: `Demo project: ${name}`, governorate: loc.split(',')[1]?.trim() ?? 'Beirut', town: loc.split(',')[0]?.trim() ?? '',
      status, priority: i === 2 ? 'high' : 'normal',
      managerId: userIds.pm ?? null,
      startDate: '2026-01-05', targetEndDate: '2026-12-20',
      contractAmount: i === 0 ? '85000.0000' : i === 2 ? '23000.0000' : null,
      contractCurrency: 'USD',
      budgetAmount: i === 0 ? '80000.0000' : null, budgetCurrency: 'USD',
      createdBy: userIds.owner ?? null,
    }).onConflictDoNothing().returning({ id: S.projects.id });
    if (row) projectIds.push(row.id);
  }

  // team + milestones + tasks for project 1
  const p1 = projectIds[0];
  if (p1) {
    for (const pid of personnelIds.slice(0, 6)) {
      await db.insert(S.projectTeam).values({ projectId: p1, personnelId: pid, roleInProject: 'crew', assignedBy: userIds.pm ?? null }).onConflictDoNothing();
    }
    if (userIds.pm) await db.insert(S.projectTeam).values({ projectId: p1, userId: userIds.pm, roleInProject: 'manager', assignedBy: userIds.owner ?? null }).onConflictDoNothing();
    const msDefs: Array<[string, string, string, number]> = [
      ['Demolition & site prep', '2026-02-01', 'done', 2],
      ['Electrical & plumbing first fix', '2026-04-15', 'done', 3],
      ['Plastering & gypsum ceilings', '2026-06-30', 'in_progress', 3],
      ['Tiling & painting', '2026-09-15', 'pending', 4],
      ['Finishing, fixtures & handover', '2026-11-30', 'pending', 3],
    ];
    for (let i = 0; i < msDefs.length; i++) {
      const [title, due, status, weight] = msDefs[i]!;
      await db.insert(S.milestones).values({
        projectId: p1, title, dueDate: due, weight, status: status as 'done',
        completedAt: status === 'done' ? new Date(due) : null, sortOrder: i,
      }).onConflictDoNothing();
    }
    await db.insert(S.tasks).values([
      { projectId: p1, title: 'Order gypsum boards', status: 'in_progress', priority: 'high', dueDate: '2026-03-10', assigneePersonnelId: personnelIds[7] ?? null },
      { projectId: p1, title: 'Fix leak in master bathroom', status: 'todo', priority: 'urgent', dueDate: '2026-03-05', assigneePersonnelId: personnelIds[4] ?? null },
      { projectId: p1, title: 'Client color selection meeting', status: 'done', priority: 'normal', dueDate: '2026-02-20', completedAt: new Date() },
    ]).onConflictDoNothing();
    await db.insert(S.issues).values({
      projectId: p1, title: 'Delay risk: material shipment customs hold', kind: 'risk', severity: 'high', status: 'open', ownerId: userIds.pm ?? null,
    }).onConflictDoNothing();
    // expenses (per currency)
    await db.insert(S.expenses).values([
      { projectId: p1, category: 'materials', description: 'Gypsum boards batch 1', amount: '3200.0000', currency: 'USD', expenseDate: '2026-02-10', recordedBy: userIds.accountant ?? null },
      { projectId: p1, category: 'materials', description: 'Cables & conduits', amount: '1850.0000', currency: 'USD', expenseDate: '2026-02-18', recordedBy: userIds.accountant ?? null },
      { projectId: p1, category: 'labor', description: 'Crew wages Feb', amount: '45000000.0000', currency: 'LBP', expenseDate: '2026-02-28', recordedBy: userIds.accountant ?? null },
      { projectId: p1, category: 'transportation', description: 'Material delivery trips', amount: '420.0000', currency: 'USD', expenseDate: '2026-03-02', recordedBy: userIds.accountant ?? null },
    ]).onConflictDoNothing();
  }

  // ---- quotation + invoice + receipt (idempotent: skip if already seeded)
  if (customerIds[0] && userIds.accountant) {
    const quoNo = `QUO-${new Date().getFullYear()}-0001`;
    const [existingQuo] = await db.select({ id: S.quotations.id }).from(S.quotations).where(sql`quote_no = ${quoNo} AND version = 1`).limit(1);
    if (!existingQuo) {
      const items = [
        { kind: 'labor' as const, description: 'Plastering works — 220 m²', qty: '220', unit: 'm2', unitPrice: '9.5' },
        { kind: 'material' as const, description: 'Gypsum board ceilings supply', qty: '180', unit: 'm2', unitPrice: '14' },
        { kind: 'labor' as const, description: 'Painting 3 coats — walls & ceilings', qty: '620', unit: 'm2', unitPrice: '3.25' },
        { kind: 'material' as const, description: 'Tiles supply (porcelain 60x60)', qty: '240', unit: 'm2', unitPrice: '18' },
        { kind: 'equipment' as const, description: 'Scaffolding & equipment rental', qty: '1', unit: 'lot', unitPrice: '1500' },
      ];
      const totals = computeTotals(items.map((it) => lineTotal(it.qty, it.unitPrice)), 3, 0);
      const [quo] = await db.insert(S.quotations).values({
        quoteNo: quoNo, version: 1, customerId: customerIds[0],
        projectId: p1 ?? null, requestId: requestIds[0] ?? null,
        status: 'sent', currency: 'USD', title: 'Apartment full finishing — Ashrafieh',
        scopeOfWork: 'Complete interior finishing per attached BOQ.', paymentTerms: '40% advance, 40% mid-progress, 20% on handover.',
        validUntil: '2026-05-01', discountPct: '3', taxPct: '0', ...totals,
        approvedBy: userIds.owner ?? null, approvedAt: new Date(), sentAt: new Date(), createdBy: userIds.accountant,
      }).returning({ id: S.quotations.id });
      await db.insert(S.quotationItems).values(items.map((it, idx) => ({
        quotationId: quo!.id, kind: it.kind, description: it.description, qty: it.qty, unit: it.unit,
        unitPrice: it.unitPrice, lineTotal: lineTotal(it.qty, it.unitPrice), sortOrder: idx,
      })));

      const invTotals = computeTotals([lineTotal(1, totals.total.replace(/\.0000$/, ''))], 0, 0);
      const [inv] = await db.insert(S.invoices).values({
        invoiceNo: `INV-${new Date().getFullYear()}-0001`, customerId: customerIds[0], projectId: p1 ?? null,
        quotationId: quo!.id, status: 'partial', currency: 'USD', issueDate: '2026-01-20', dueDate: '2026-02-20',
        subtotal: invTotals.subtotal, taxAmount: '0', total: invTotals.total, paidTotal: '20000.0000',
        createdBy: userIds.accountant,
      }).returning({ id: S.invoices.id });
      await db.insert(S.invoiceItems).values({
        invoiceId: inv!.id, description: 'Advance payment — apartment finishing works',
        qty: '1', unit: 'lot', unitPrice: invTotals.total, lineTotal: invTotals.total, sortOrder: 0,
      });
      await db.insert(S.receipts).values({
        receiptNo: `REC-${new Date().getFullYear()}-0001`, invoiceId: inv!.id, customerId: customerIds[0],
        amount: '20000.0000', currency: 'USD', method: 'transfer', receivedOn: '2026-01-25',
        recordedBy: userIds.accountant,
      });
    } else {
      console.log('Quotation/invoice/receipt data already exists, skipping...');
    }
  }

  // ---- exchange rate (explicitly demo/manual)
  await db.insert(S.exchangeRates).values({
    fromCurrency: 'USD', toCurrency: 'LBP', rate: '89500.00000000',
    rateDate: new Date().toISOString().slice(0, 10), source: 'DEMO manual entry — replace with verified source',
    enteredBy: userIds.owner ?? null,
  }).onConflictDoNothing();

  // ---- assignments & attendance (this week)
  if (p1 && personnelIds.length > 3) {
    const base = new Date();
    for (let d = -5; d <= 3; d++) {
      const day = new Date(base.getTime() + d * 864e5).toISOString().slice(0, 10);
      for (const pid of personnelIds.slice(0, 4)) {
        await db.insert(S.assignments).values({ personnelId: pid, projectId: p1, workDate: day, shift: 'full_day', createdBy: userIds.pm ?? null }).onConflictDoNothing();
        if (d < 0) {
          await db.insert(S.attendance).values({
            personnelId: pid, projectId: p1, workDate: day,
            status: d % 7 === 0 ? 'absent' : 'present',
            regularHours: d % 7 === 0 ? '0' : '8', overtimeHours: d % 3 === 0 ? '2' : '0',
            approvalStatus: d < -1 ? 'approved' : 'submitted',
            approvedBy: d < -1 ? userIds.pm ?? null : null,
            approvedAt: d < -1 ? new Date() : null,
            submittedBy: userIds.pm ?? null, submittedAt: new Date(),
          }).onConflictDoNothing();
        }
      }
    }
  }

  // ---- worker payments
  if (personnelIds[0] && userIds.accountant) {
    await db.insert(S.workerPayments).values([
      { personnelId: personnelIds[0], projectId: p1 ?? null, type: 'advance', amount: '200.0000', currency: 'USD', paidOn: '2026-02-01', status: 'approved', approvedBy: userIds.accountant, createdBy: userIds.accountant },
      { personnelId: personnelIds[0], projectId: p1 ?? null, type: 'payment', amount: '850.0000', currency: 'USD', paidOn: '2026-02-28', status: 'approved', approvedBy: userIds.accountant, createdBy: userIds.accountant },
    ]).onConflictDoNothing();
  }

  // ---- portfolio (published)
  await db.insert(S.portfolioProjects).values([
    { titleEn: 'Achrafieh Residence Finishing', titleAr: 'تشطيب سكن في الأشرفية', descriptionEn: 'Full interior finishing of a 220m² apartment: gypsum, tiling, painting and custom carpentry.', descriptionAr: 'تشطيب داخلي كامل لشقة ٢٢٠ م٢: جبس وبلاط ودهان ونجارة خاصة.', category: 'Finishing', location: 'Achrafieh, Beirut', completedYear: 2025, published: true, sortOrder: 0 },
    { titleEn: 'Jounieh Commercial Facade', titleAr: 'واجهة مبنى تجاري في جونية', descriptionEn: 'Aluminum facade and exterior cladding for a 6-floor commercial building.', descriptionAr: 'واجهة ألمنيوم وتكسية خارجية لمبنى تجاري من ٦ طوابق.', category: 'Aluminum & Facades', location: 'Jounieh', completedYear: 2024, published: true, sortOrder: 1 },
    { titleEn: 'Zahle Villa Renovation', titleAr: 'ترميم فيلا في زحلة', descriptionEn: 'Structural reinforcement, waterproofing, MEP upgrade and complete renovation.', descriptionAr: 'تدعيم إنشائي وعزل وتحديث كهروميكانيكي وترميم كامل.', category: 'Renovation', location: 'Zahle', completedYear: 2025, published: true, sortOrder: 2 },
  ]).onConflictDoNothing();

  // ---- doc counters alignment
  await db.execute(sql`INSERT INTO doc_counters (key, last_value) VALUES (${`PRJ-${new Date().getFullYear()}`}, 3), (${`QUO-${new Date().getFullYear()}`}, 1), (${`INV-${new Date().getFullYear()}`}, 1), (${`REC-${new Date().getFullYear()}`}, 1), ('EMP', 15), (${`REQ-${new Date().getFullYear()}`}, 3) ON CONFLICT (key) DO NOTHING`);

  console.log('');
  console.log('='.repeat(64));
  console.log('DEMO SEED COMPLETE');
  console.log(`Demo accounts (password: ${DEMO_PASSWORD}):`);
  console.log('  owner@demo.local / admin@demo.local / hr@demo.local');
  console.log('  pm@demo.local / accountant@demo.local / engineer@demo.local');
  console.log('These are DEMO credentials for development only.');
  console.log('='.repeat(64));
  await closeDb();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await closeDb();
  process.exit(1);
});
