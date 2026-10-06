import { NavLink, Outlet } from 'react-router-dom';
import { useApi } from '../api';

const I = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  registry: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><circle cx="12" cy="10" r="2.6" /><path d="M8 17c.8-2 2.2-3 4-3s3.2 1 4 3" /></>,
  routing: <path d="M4 7h13l-3-3M20 17H7l3 3" />,
  access: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><circle cx="12" cy="11" r="2" /><path d="M12 13v3" /></>,
  guard: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M12 8v5M12 16v.5" /></>,
  telemetry: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  spend: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>
};

const NAV: Array<[string, string, keyof typeof I]> = [
  ['/', 'Overview', 'overview'], ['/registry', 'Registry', 'registry'], ['/routing', 'Routing', 'routing'],
  ['/access', 'Access', 'access'], ['/guard', 'Guard', 'guard'], ['/telemetry', 'Telemetry', 'telemetry'], ['/spend', 'Spend', 'spend']
];

export default function Layout() {
  const me = useApi<{ authenticated: boolean; name: string; initials: string }>('me');
  return (
    <div className="app">
      <aside className="rail">
        <div className="logo" style={{ width: 36, height: 36, color: 'var(--accent)' }}>
          <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="36" aria-hidden="true"><circle cx="18" cy="18" r="4.5" /><circle cx="7" cy="9" r="2.6" /><circle cx="29" cy="9" r="2.6" /><circle cx="18" cy="31" r="2.6" /><path d="M9 10.5l5.5 4.5M27 10.5l-5.5 4.5M18 22.5v6" /></svg>
        </div>
        <nav className="railnav" aria-label="Primary">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{I[icon]}</svg>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <a className="avatar" href={me.data?.authenticated ? '/.auth/logout' : '/.auth/login/aad'} title={me.data?.authenticated ? `${me.data.name} · sign out` : 'Sign in'} aria-label={me.data?.authenticated ? `Signed in as ${me.data.name}. Sign out` : 'Sign in'} style={{ color: '#fff' }}>
          {me.data?.initials ?? '··'}
        </a>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
