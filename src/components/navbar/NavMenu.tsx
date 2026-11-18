import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isActive, type NavItem } from './constants';

interface NavMenuProps {
    navItems: NavItem[];
}

export function NavMenu({ navItems }: NavMenuProps) {
    const location = useLocation();
    const { t } = useTranslation();

    return (
        <nav
            aria-label={t('nav.primary', 'Navigation principale')}
            className="flex flex-wrap items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800/80"
        >
            {navItems.map((item) => {
                const active = isActive(location.pathname, item.path);
                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        draggable="false"
                        aria-current={active ? 'page' : undefined}
                        className={`min-h-9 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            active
                                ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-700 dark:text-white'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/60'
                        }`}
                    >
                        <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
