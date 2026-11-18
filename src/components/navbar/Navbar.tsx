import { Moon, Settings, Sun, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/useConfigStore';
import { isLinux, isMac, isTauri } from '../../utils/env';
import { NavLogo } from './NavLogo';
import { NavMenu } from './NavMenu';
import type { NavItem } from './constants';

function Navbar() {
    const { t } = useTranslation();
    const { config, saveConfig } = useConfigStore();
    const showMacInset = isTauri() && isMac();

    const navItems: NavItem[] = [
        { path: '/', label: t('nav.accounts'), icon: Users, priority: 'high' },
        { path: '/settings', label: t('nav.settings'), icon: Settings, priority: 'high' },
    ];

    const isCurrentlyDark =
        config?.theme === 'dark' ||
        (config?.theme !== 'light' &&
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('dark'));

    const toggleTheme = async (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!config) return;
        const newTheme = isCurrentlyDark ? 'light' : 'dark';

        if ('startViewTransition' in document && !isLinux()) {
            const x = event.clientX;
            const y = event.clientY;
            const endRadius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y)
            );

            // @ts-ignore
            const transition = document.startViewTransition(async () => {
                await saveConfig({ ...config, theme: newTheme }, true);
            });

            transition.ready.then(() => {
                const isDarkMode = newTheme === 'dark';
                const clipPath = isDarkMode
                    ? [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
                    : [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];

                document.documentElement.animate(
                    { clipPath },
                    {
                        duration: 450,
                        easing: 'ease-in-out',
                        fill: 'forwards',
                        pseudoElement: isDarkMode ? '::view-transition-old(root)' : '::view-transition-new(root)',
                    }
                );
            });
        } else {
            await saveConfig({ ...config, theme: newTheme }, true);
        }
    };

    const themeLabel = isCurrentlyDark ? t('nav.theme_to_light') : t('nav.theme_to_dark');

    return (
        <header
            className={`sticky top-0 z-[150] border-b border-gray-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur transition-colors ${showMacInset ? 'pt-9' : ''}`}
        >
            <div className="max-w-4xl mx-auto px-4 sm:px-6 min-h-14 py-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center min-w-0 shrink-0">
                    <NavLogo />
                </div>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <NavMenu navItems={navItems} />

                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label={themeLabel}
                        title={themeLabel}
                        className="min-h-9 min-w-9 px-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {isCurrentlyDark ? (
                            <Sun className="w-4 h-4" aria-hidden="true" />
                        ) : (
                            <Moon className="w-4 h-4" aria-hidden="true" />
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
}

export default Navbar;
