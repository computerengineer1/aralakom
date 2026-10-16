/** Server-side bilingual message catalogue (emails, notifications, public tokens). */
export type Loc = 'ar' | 'en';

type Catalogue = Record<string, { ar: string; en: string }>;

export const messages: Catalogue = {
  'app.received.title': { ar: 'تم استلام طلبكم', en: 'We received your request' },
  'app.received.application.body': {
    ar: 'مرحباً {{name}}،\n\nتم استلام طلب التوظيف الخاص بكم برقم {{reference}}.\nيمكنكم متابعة حالة الطلب عبر الرابط:\n{{url}}\n\nمع الشكر،\nفريق الموارد البشرية',
    en: 'Hello {{name}},\n\nWe received your job application with reference {{reference}}.\nYou can track its status here:\n{{url}}\n\nThank you,\nHR Team',
  },
  'app.received.request.body': {
    ar: 'مرحباً {{name}}،\n\nتم استلام طلبكم بشأن «{{category}}» برقم {{reference}}.\nسيتواصل معكم فريقنا للمتابعة. يمكنكم تتبع الطلب عبر:\n{{url}}\n\nمع الشكر',
    en: 'Hello {{name}},\n\nWe received your contract request for "{{category}}" with reference {{reference}}.\nOur team will contact you. You can track it here:\n{{url}}\n\nThank you',
  },
  'app.status.title': { ar: 'تحديث حالة الطلب {{reference}}', en: 'Status update for {{reference}}' },
  'app.status.body': {
    ar: 'مرحباً {{name}}،\n\nتم تحديث حالة طلبكم {{reference}} إلى: {{status}}.\n{{message}}\n\nللاطلاع: {{url}}',
    en: 'Hello {{name}},\n\nYour request {{reference}} status changed to: {{status}}.\n{{message}}\n\nView details: {{url}}',
  },
  'app.password.reset.title': { ar: 'إعادة تعيين كلمة المرور', en: 'Password reset' },
  'app.password.reset.body': {
    ar: 'مرحباً {{name}}،\n\nطلب أحدهم إعادة تعيين كلمة المرور لحسابكم. الرابط صالح لمدة {{minutes}} دقيقة:\n{{url}}\n\nإن لم تطلبوا ذلك يمكنكم تجاهل هذه الرسالة.',
    en: 'Hello {{name}},\n\nA password reset was requested for your account. This link is valid for {{minutes}} minutes:\n{{url}}\n\nIf you did not request this, you may ignore this email.',
  },
  'app.quote.ready.title': { ar: 'عرض سعر جاهز {{quoteNo}}', en: 'Quotation ready {{quoteNo}}' },
  'app.quote.ready.body': {
    ar: 'مرحباً {{name}}،\n\nعرض السعر {{quoteNo}} بقيمة {{total}} {{currency}} جاهز، وصالح حتى {{validUntil}}.\nيرجى مراجعة العرض والرد بالقبول أو الاعتذار.',
    en: 'Hello {{name}},\n\nQuotation {{quoteNo}} for {{total}} {{currency}} is ready, valid until {{validUntil}}.\nPlease review and respond with acceptance or decline.',
  },
  status: {
    ar: 'الحالة',
    en: 'Status',
  },
};

export const statusLabels: Record<string, { ar: string; en: string }> = {
  draft: { ar: 'مسودة', en: 'Draft' },
  submitted: { ar: 'قيد التقديم', en: 'Submitted' },
  under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  shortlisted: { ar: 'مرشّح للمقابلة', en: 'Shortlisted' },
  interview: { ar: 'مقابلة', en: 'Interview' },
  approved: { ar: 'موافقة', en: 'Approved' },
  rejected: { ar: 'مرفوض', en: 'Rejected' },
  hired: { ar: 'تم التوظيف', en: 'Hired' },
  needs_info: { ar: 'بحاجة لمعلومات إضافية', en: 'Needs more information' },
  site_visit: { ar: 'زيارة موقع', en: 'Site visit' },
  estimating: { ar: 'تسعير', en: 'Estimating' },
  quotation_prepared: { ar: 'تم إعداد العرض', en: 'Quotation prepared' },
  quotation_sent: { ar: 'تم إرسال العرض', en: 'Quotation sent' },
  accepted: { ar: 'مقبول', en: 'Accepted' },
  declined: { ar: 'معتذر', en: 'Declined' },
  expired: { ar: 'منتهي الصلاحية', en: 'Expired' },
  contracted: { ar: 'تم التعاقد', en: 'Contracted' },
  in_progress: { ar: 'قيد التنفيذ', en: 'In progress' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
  planning: { ar: 'تخطيط', en: 'Planning' },
  on_hold: { ar: 'معلّق', en: 'On hold' },
  sent: { ar: 'مرسل', en: 'Sent' },
  partial: { ar: 'مدفوع جزئياً', en: 'Partially paid' },
  paid: { ar: 'مدفوع', en: 'Paid' },
  pending_approval: { ar: 'بانتظار الاعتماد', en: 'Pending approval' },
};

export function t(key: keyof typeof messages | string, loc: Loc, vars: Record<string, string | number> = {}): string {
  const entry = messages[key];
  if (!entry) return key;
  let text = entry[loc] ?? entry.en;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, String(v));
  }
  return text;
}

export function statusLabel(status: string, loc: Loc): string {
  return statusLabels[status]?.[loc] ?? status;
}
