import './Sidebar.css';

export type Page = 'habits' | 'settings';

interface SidebarProps {
  page: Page;
  onNavigate(page: Page): void;
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar__brand" aria-label="AwakeN">
        Awake<span className="sidebar__brand-n">N</span>
      </div>

      <ul className="sidebar__list">
        <li>
          <button
            type="button"
            className="sidebar__item"
            aria-current={page === 'habits' ? 'page' : undefined}
            onClick={() => onNavigate('habits')}
          >
            Habits
          </button>
        </li>
        <li>
          <button type="button" className="sidebar__item" disabled>
            Calendar <span className="sidebar__tag">later</span>
          </button>
        </li>
      </ul>

      <button
        type="button"
        className="sidebar__item sidebar__item--small"
        aria-current={page === 'settings' ? 'page' : undefined}
        onClick={() => onNavigate('settings')}
      >
        Settings
      </button>
    </nav>
  );
}
