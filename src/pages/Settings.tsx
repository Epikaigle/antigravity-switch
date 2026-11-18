import { useEffect, useState } from 'react';
import {
    Check,
    ChevronDown,
    Clock3,
    Database,
    FolderOpen,
    Globe2,
    Monitor,
    Moon,
    RefreshCw,
    Sun,
    Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import DesktopSettings from '../components/settings/DesktopSettings';
import NetworkSettings from '../components/settings/NetworkSettings';
import { showToast } from '../components/common/ToastContainer';
import { normalizeLanguage } from '../i18n';
import { useConfigStore } from '../stores/useConfigStore';
import type { AppConfig } from '../types/config';
import { request as invoke } from '../utils/request';

const LANGUAGES = [
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'English' },
    { code: 'zh', label: '简体中文' },
];

const REFRESH_INTERVALS = [5, 15, 30, 60];

function Settings() {
    const { t } = useTranslation();
    const { config, loading, error, loadConfig, saveConfig } = useConfigStore();
    const [dataDirPath, setDataDirPath] = useState('~/.antigravity_switch');

    useEffect(() => {
        loadConfig();
        invoke<string>('get_data_dir_path')
            .then(setDataDirPath)
            .catch(() => {});
    }, [loadConfig]);

    const updateConfig = async (patch: Partial<AppConfig>) => {
        if (!config) return;
        try {
            await saveConfig({ ...config, ...patch }, true);
            showToast(t('local_settings.saved', { lng: patch.language || config.language }), 'success');
        } catch (err) {
            showToast(t('local_settings.save_failed', { error: String(err) }), 'error');
        }
    };

    const openDataFolder = async () => {
        try {
            await invoke('open_data_folder');
        } catch (err) {
            showToast(t('local_settings.open_failed', { error: String(err) }), 'error');
        }
    };

    const chooseExecutable = async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
                title: t('local_settings.choose_executable'),
            });
            if (typeof selected === 'string') {
                await updateConfig({ antigravity_executable: selected });
            }
        } catch (err) {
            showToast(t('local_settings.save_failed', { error: String(err) }), 'error');
        }
    };

    const themeOptions = [
        { value: 'system', label: t('local_settings.system'), icon: Monitor },
        { value: 'light', label: t('local_settings.light'), icon: Sun },
        { value: 'dark', label: t('local_settings.dark'), icon: Moon },
    ];

    const selectedLanguage = normalizeLanguage(config?.language);
    const refreshInterval = config?.refresh_interval ?? 15;
    const refreshOptions = [...new Set([...REFRESH_INTERVALS, refreshInterval])].sort((a, b) => a - b);
    const hasCustomExecutable = Boolean(config?.antigravity_executable);

    return (
        <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
            <header>
                <h1
                    className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-100"
                    style={{ textWrap: 'balance' }}
                >
                    {t('local_settings.title')}
                </h1>
                <p
                    className="mt-1 text-sm text-gray-600 dark:text-slate-400"
                    style={{ textWrap: 'pretty' }}
                >
                    {t('local_settings.subtitle')}
                </p>
            </header>

            {error && (
                <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                    <p>{t('settings_sections.config_failed', { error })}</p>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => void loadConfig()}
                        className="mt-3 min-h-8 rounded-lg border border-current px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                        {t(loading ? 'common.loading' : 'common.retry')}
                    </button>
                </div>
            )}

            {/* 1. Appearance and Language */}
            <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                        <Sun className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                            {t('settings_sections.appearance_and_language')}
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                            {t('settings_sections.appearance_and_language_desc')}
                        </p>
                    </div>
                </div>

                <div>
                    <div className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300">
                        {t('local_settings.theme')}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                        {themeOptions.map(({ value, label, icon: Icon }) => {
                            const selected = (config?.theme || 'system') === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => void updateConfig({ theme: value })}
                                    disabled={!config}
                                    aria-pressed={selected}
                                    className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        selected
                                            ? 'border-blue-500 bg-blue-50/70 text-blue-700 shadow-xs dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                                            : 'border-gray-200 bg-gray-50/60 text-gray-600 hover:border-gray-300 hover:bg-gray-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:border-slate-700'
                                    }`}
                                >
                                    <Icon
                                        className={`h-4 w-4 ${selected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
                                        aria-hidden="true"
                                    />
                                    <span>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <div className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Globe2 className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                        <span>{t('local_settings.language')}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-100/80 p-1 dark:bg-slate-800/60">
                        {LANGUAGES.map((language) => {
                            const selected = selectedLanguage === language.code;
                            return (
                                <button
                                    key={language.code}
                                    type="button"
                                    onClick={() => void updateConfig({ language: language.code })}
                                    disabled={!config}
                                    aria-pressed={selected}
                                    className={`min-h-9 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        selected
                                            ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-700 dark:text-blue-300'
                                            : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white'
                                    }`}
                                >
                                    {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                    <span>{language.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 2. Background Quota Auto-Refresh */}
            <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                            <RefreshCw className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                                {t('local_settings.auto_refresh')}
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                                {t('local_settings.auto_refresh_desc')}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-label={t('local_settings.auto_refresh')}
                        aria-checked={Boolean(config?.auto_refresh)}
                        disabled={!config}
                        onClick={() => void updateConfig({ auto_refresh: !config?.auto_refresh })}
                        className="mt-1 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config?.auto_refresh ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${config?.auto_refresh ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                            />
                        </span>
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3.5 dark:border-slate-800">
                    <label
                        htmlFor="refresh-interval"
                        className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-slate-300"
                    >
                        <Clock3 className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        <span>{t('local_settings.refresh_interval')}</span>
                    </label>
                    <select
                        id="refresh-interval"
                        value={refreshInterval}
                        disabled={!config || !config.auto_refresh}
                        onChange={(event) => void updateConfig({ refresh_interval: Number(event.target.value) })}
                        className="select select-sm select-bordered w-32 border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs rounded-lg"
                    >
                        {refreshOptions.map((minutes) => (
                            <option key={minutes} value={minutes}>
                                {t('local_settings.minutes', { count: minutes })}
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            {/* 3. Desktop Integration */}
            <DesktopSettings />

            {/* 4. Collapsed Advanced Options (no headings inside <summary>) */}
            <details className="group rounded-2xl border border-gray-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:p-6 text-sm font-semibold text-gray-800 dark:text-slate-200 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
                    <span className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                            <Wrench className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="text-left leading-snug">{t('local_settings.advanced_options')}</span>
                    </span>
                    <ChevronDown
                        className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                    />
                </summary>

                <div className="space-y-4 border-t border-gray-100 p-5 sm:p-6 dark:border-slate-800">
                    {/* Linked Antigravity Desktop Path */}
                    <div className="rounded-xl border border-gray-200/70 bg-gray-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Monitor className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                                <span className="text-xs font-semibold text-gray-800 dark:text-slate-200">
                                    {t('local_settings.app_label')}
                                </span>
                                <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                        hasCustomExecutable
                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    }`}
                                >
                                    {hasCustomExecutable
                                        ? t('local_settings.custom_path')
                                        : t('local_settings.automatic_detection')}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={!config}
                                    onClick={() => void chooseExecutable()}
                                    className="min-h-8 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                                >
                                    {t('local_settings.choose_executable')}
                                </button>
                                {hasCustomExecutable && (
                                    <button
                                        type="button"
                                        onClick={() => void updateConfig({ antigravity_executable: undefined })}
                                        className="min-h-8 rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                                    >
                                        {t('local_settings.reset_detection')}
                                    </button>
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-slate-400">
                            {t('local_settings.application_paths_desc')}
                        </p>
                        <div className="font-mono text-xs text-gray-600 dark:text-slate-300 break-all">
                            {config?.antigravity_executable || t('local_settings.auto_detect_note')}
                        </div>
                    </div>

                    {/* Local Data Folder */}
                    <div className="rounded-xl border border-gray-200/70 bg-gray-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <Database className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                                    <span>{t('local_settings.data_directory')}</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
                                    {t('local_settings.data_directory_desc')}
                                </p>
                                <div className="mt-2 inline-block rounded-lg bg-white px-2.5 py-1 font-mono text-xs text-gray-600 dark:bg-slate-900/90 dark:text-slate-300 border border-gray-200/80 dark:border-slate-700/80 break-all">
                                    {dataDirPath}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void openDataFolder()}
                                className="min-h-8 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
                            >
                                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{t('local_settings.open_directory')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Network Proxy */}
                    <NetworkSettings />
                </div>
            </details>
        </div>
    );
}

export default Settings;
