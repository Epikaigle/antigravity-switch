import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RouterProvider } from 'react-router/dom';

import Layout from './components/layout/Layout';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import ThemeManager from './components/common/ThemeManager';
import { useEffect } from 'react';
import { useConfigStore } from './stores/useConfigStore';
import { useAccountStore } from './stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from './i18n';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './utils/env';
import { installMainWindowPresentation } from './utils/mainWindowPresentation';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Accounts />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

function App() {
  const { config, loadConfig } = useConfigStore();
  const { fetchCurrentAccount, fetchAccounts } = useAccountStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    loadConfig();
    fetchCurrentAccount();
    fetchAccounts();
  }, [loadConfig, fetchCurrentAccount, fetchAccounts]);

  // Sync language from config
  useEffect(() => {
    if (config?.language) {
      i18n.changeLanguage(normalizeLanguage(config.language));
      document.documentElement.dir = 'ltr';
    }
  }, [config?.language, i18n]);

  // Listen for tray events
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(listen('config://updated', () => { loadConfig(); }));
    unlistenPromises.push(installMainWindowPresentation(route => router.navigate(route, { flushSync: true })));

    unlistenPromises.push(
      listen('tray://account-switched', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    unlistenPromises.push(
      listen('tray://refresh-current', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    unlistenPromises.push(
      listen('accounts://refreshed', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    return () => {
      Promise.all(unlistenPromises).then(unlisteners => {
        unlisteners.forEach(unlisten => unlisten());
      });
    };
  }, [fetchCurrentAccount, fetchAccounts, loadConfig]);

  return (
    <>
      <ThemeManager />
      <RouterProvider router={router} />
    </>
  );
}

export default App;
