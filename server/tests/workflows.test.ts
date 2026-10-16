import { describe, expect, it } from 'vitest';
import { APPLICATION_TRANSITIONS, assertApplicationTransition } from '../src/modules/applications.js';
import { REQUEST_TRANSITIONS, assertRequestTransition } from '../src/modules/requests.js';
import { assertTransition } from '../src/modules/finance.js';

const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['sent', 'draft', 'cancelled'],
  sent: ['accepted', 'declined', 'expired'],
  accepted: [], declined: [], expired: [], cancelled: [],
};

describe('application workflow transitions', () => {
  it('allows the documented happy path', () => {
    for (const [from, to] of [['submitted', 'under_review'], ['under_review', 'shortlisted'], ['shortlisted', 'interview'], ['interview', 'approved'], ['approved', 'hired']]) {
      expect(() => assertApplicationTransition(from, to)).not.toThrow();
    }
  });
  it('rejects skipping review (submitted → hired)', () => {
    expect(() => assertApplicationTransition('submitted', 'hired')).toThrow(/Cannot move/);
  });
  it('rejects leaving hired state', () => {
    expect(APPLICATION_TRANSITIONS.hired).toEqual([]);
    expect(() => assertApplicationTransition('hired', 'submitted')).toThrow();
  });
  it('allows reopening a rejection with audit (rejected → under_review)', () => {
    expect(() => assertApplicationTransition('rejected', 'under_review')).not.toThrow();
  });
  it('same-state is a no-op', () => {
    expect(() => assertApplicationTransition('submitted', 'submitted')).not.toThrow();
  });
});

describe('customer request workflow transitions', () => {
  it('allows the full sales path', () => {
    const path = ['submitted', 'under_review', 'estimating', 'quotation_prepared', 'quotation_sent', 'accepted', 'contracted', 'in_progress', 'completed'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertRequestTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });
  it('rejects jumping from submitted to accepted', () => {
    expect(() => assertRequestTransition('submitted', 'accepted')).toThrow();
  });
  it('rejects escaping terminal states', () => {
    expect(() => assertRequestTransition('completed', 'in_progress')).toThrow();
    expect(() => assertRequestTransition('cancelled', 'under_review')).toThrow();
  });
  it('needs_info and site_visit loop back correctly', () => {
    expect(() => assertRequestTransition('under_review', 'needs_info')).not.toThrow();
    expect(() => assertRequestTransition('needs_info', 'estimating')).not.toThrow();
    expect(() => assertRequestTransition('site_visit', 'estimating')).not.toThrow();
  });
  it('every status key has a transitions entry', () => {
    const all = ['submitted', 'under_review', 'needs_info', 'site_visit', 'estimating', 'quotation_prepared', 'quotation_sent', 'accepted', 'declined', 'expired', 'contracted', 'in_progress', 'completed', 'cancelled'];
    for (const s of all) expect(REQUEST_TRANSITIONS[s]).toBeDefined();
  });
});

describe('quotation/invoice transitions', () => {
  it('draft cannot be sent directly', () => {
    expect(() => assertTransition(QUOTE_TRANSITIONS, 'draft', 'sent', 'quotation')).toThrow();
  });
  it('approval path works', () => {
    expect(() => assertTransition(QUOTE_TRANSITIONS, 'draft', 'pending_approval', 'quotation')).not.toThrow();
    expect(() => assertTransition(QUOTE_TRANSITIONS, 'pending_approval', 'approved', 'quotation')).not.toThrow();
    expect(() => assertTransition(QUOTE_TRANSITIONS, 'approved', 'sent', 'quotation')).not.toThrow();
  });
  it('accepted quotations are final', () => {
    expect(() => assertTransition(QUOTE_TRANSITIONS, 'accepted', 'draft', 'quotation')).toThrow();
  });
});
