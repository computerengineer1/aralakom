import type { JSX } from 'react';
import type { SVGProps } from 'react';

/** Inline SVG icon set (no external dependencies, crisp at any size). */
type P = SVGProps<SVGSVGElement> & { size?: number };
function base(size: number, props: P) {
  const { size: _s, ...rest } = props;
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest };
}

export const IconHardHat = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M2 18h20v2H2z" /><path d="M4 18v-3a8 8 0 0 1 16 0v3" /><path d="M10 7.5V4h4v3.5" /></svg>);
export const IconBuilding = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></svg>);
export const IconBrush = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" /></svg>);
export const IconGrid = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>);
export const IconLayers = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>);
export const IconBolt = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>);
export const IconDroplet = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>);
export const IconHammer = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9" /><path d="M17.64 15 22 10.64" /><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" /></svg>);
export const IconShield = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
export const IconRefresh = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>);
export const IconTools = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>);
export const IconUsers = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
export const IconUser = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
export const IconFile = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>);
export const IconFileText = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>);
export const IconFolder = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const IconClock = (p: P) => (<svg {...base(p.size ?? 20, p)}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
export const IconMoney = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>);
export const IconInvoice = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>);
export const IconChart = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></svg>);
export const IconSettings = (p: P) => (<svg {...base(p.size ?? 20, p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
export const IconAudit = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M9 12l2 2 4-4" /><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" /></svg>);
export const IconBell = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);
export const IconDashboard = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="3" y="3" width="8" height="10" rx="1" /><rect x="13" y="3" width="8" height="6" rx="1" /><rect x="13" y="11" width="8" height="10" rx="1" /><rect x="3" y="15" width="8" height="6" rx="1" /></svg>);
export const IconInbox = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>);
export const IconContract = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m8 17 2-2 1.5 1.5L15 13l1 1" /></svg>);
export const IconMenu = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>);
export const IconX = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M20 6 9 17l-5-5" /></svg>);
export const IconPlus = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconSearch = (p: P) => (<svg {...base(p.size ?? 20, p)}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>);
export const IconAlert = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>);
export const IconPhone = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
export const IconMail = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>);
export const IconPin = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
export const IconLogout = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>);
export const IconDownload = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>);
export const IconTrash = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
export const IconEdit = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>);
export const IconChevronLeft = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="m15 18-6-6 6-6" /></svg>);
export const IconChevronRight = (p: P) => (<svg {...base(p.size ?? 20, p)}><path d="m9 18 6-6-6-6" /></svg>);
export const IconArchive = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>);
export const IconLock = (p: P) => (<svg {...base(p.size ?? 20, p)}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);

export const SERVICE_ICONS: Record<string, (p: P) => JSX.Element> = {
  building: IconBuilding, brush: IconBrush, grid: IconGrid, layers: IconLayers, bolt: IconBolt,
  droplet: IconDroplet, hammer: IconHammer, shield: IconShield, refresh: IconRefresh, tools: IconTools,
};
