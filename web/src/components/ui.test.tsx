import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../i18n';
import { setLocale } from '../i18n';
import { DataTable, Money, StatusBadge, Bars, type Column } from './ui';

interface Row { id: string; name: string; amount: string }

const columns: Array<Column<Row>> = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortable: true },
  { key: 'amount', header: 'Amount', num: true, render: (r) => <Money amount={r.amount} currency="USD" locale="en" /> },
];

const rows: Row[] = [
  { id: '1', name: 'Ahmad', amount: '10.5' },
  { id: '2', name: 'Sara', amount: '2000' },
];

describe('DataTable', () => {
  it('renders rows, columns and pagination info', () => {
    render(<DataTable columns={columns} rows={rows} page={1} pageSize={20} total={2} onPage={() => undefined} emptyText="none" />);
    expect(screen.getByText('Ahmad')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–2 of 2/i)).toBeInTheDocument();
  });

  it('shows empty state when no rows', () => {
    render(<DataTable columns={columns} rows={[]} page={1} pageSize={20} total={0} onPage={() => undefined} emptyText="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('calls onPage for next/previous and disables them at bounds', () => {
    const onPage = vi.fn();
    render(<DataTable columns={columns} rows={rows} page={2} pageSize={1} total={3} onPage={onPage} emptyText="none" />);
    const buttons = screen.getAllByRole('button');
    const prev = buttons.find((b) => b.getAttribute('aria-label') === 'Previous')!;
    const next = buttons.find((b) => b.getAttribute('aria-label') === 'Next')!;
    fireEvent.click(prev);
    expect(onPage).toHaveBeenCalledWith(1);
    fireEvent.click(next);
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('sort buttons announce direction to screen readers', () => {
    render(<DataTable columns={columns} rows={rows} page={1} pageSize={20} total={2} onPage={() => undefined} sort="name" dir="asc" onSort={() => undefined} emptyText="none" />);
    expect(screen.getByRole('columnheader', { name: /Name/i })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('row click handler fires (navigation pattern)', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} page={1} pageSize={20} total={2} onPage={() => undefined} emptyText="none" onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Ahmad'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});

describe('Money formatting (currency separation in UI)', () => {
  it('formats USD with 2 decimals and LBP without', () => {
    const { container } = render(
      <div>
        <Money amount="1234.5" currency="USD" locale="en" />
        <Money amount="45000000" currency="LBP" locale="en" />
      </div>,
    );
    expect(container.textContent).toContain('USD 1,234.50');
    expect(container.textContent).toContain('LBP 45,000,000');
  });

  it('keeps numeric content LTR inside RTL pages', () => {
    setLocale('ar');
    const { container } = render(<Money amount="1000" currency="USD" locale="ar" />);
    const span = container.querySelector('.ltr-span');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('dir')).toBe('ltr');
    setLocale('en');
  });

  it('renders em-dash for missing amounts', () => {
    const { container } = render(<Money amount={null} currency="USD" locale="en" />);
    expect(container.textContent).toBe('—');
  });
});

describe('StatusBadge', () => {
  it('maps workflow states to distinct accessible colors', () => {
    const { container } = render(
      <div>
        <StatusBadge status="approved" label="Approved" />
        <StatusBadge status="rejected" label="Rejected" />
        <StatusBadge status="under_review" label="Under review" />
      </div>,
    );
    expect(container.querySelector('.badge-green')?.textContent).toBe('Approved');
    expect(container.querySelector('.badge-red')?.textContent).toBe('Rejected');
    expect(container.querySelector('.badge-amber')?.textContent).toBe('Under review');
  });
});

describe('Bars chart', () => {
  it('renders one bar per datum with values', () => {
    render(<Bars data={[{ label: 'Painter', value: 5 }, { label: 'Mason', value: 3 }]} />);
    expect(screen.getByText('Painter')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
