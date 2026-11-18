import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, Loader2, LogOut, RefreshCw, Settings, Users } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../i18n';
import { request } from '../utils/request';
import { isTauri } from '../utils/env';
import { useConfigStore } from '../stores/useConfigStore';
import { aggregateMenuBar, menuBarAccount, quotaDisplay, quotaTone, type MenuBarSnapshot, type QuotaReason, type QuotaWindow } from '../utils/menuBarOverview';
import '../components/menubar/MenuBarDashboard.css';
import { DEFAULT_MENU_BAR_PREFERENCES, menuBarResetTimeDisplay, type MenuBarPreferences } from '../types/config';
import logo from '../assets/logo.png';

interface Appearance { platform?: string; native_material: boolean; reduced_transparency: boolean; high_contrast: boolean; material_kind?: string }

const MB_COPY = {
  fr: {
    gemini: 'Gemini',
    other: 'Claude & GPT',
    allFamilies: 'Gemini / Claude & GPT',
    win5h: '5 heures',
    winWeekly: 'Hebdo',
    reasons: {
      disabled: 'Désactivé',
      blocked: 'Vérif. requise',
      forbidden: 'Accès refusé',
      unreadable: 'Illisible',
      stale: 'Actualisation req.',
      protected: 'Protégé',
      unknown: 'Non signalé',
      expired: 'Réinit. due',
      conflict: 'Données en conflit',
    } satisfies Record<QuotaReason, string>,
    refreshNeeded: 'Actualiser',
    resetPrefix: 'Réinit. : ',
    readError: 'Impossible de lire les comptes. Réessayez.',
    partialRefreshFail: (n: number) => `${n} compte(s) non actualisé(s). Cache conservé.`,
    refreshFail: 'Échec de l’actualisation. Réessayez.',
    switchFail: 'Échec du basculement. Vérifiez ce compte dans l’application.',
    pagination: 'Pagination',
    prevPage: 'Page précédente',
    nextPage: 'Page suivante',
    refreshAll: 'Actualiser tous les quotas',
    settings: 'Paramètres',
    aggQuotas: 'Quotas agrégés',
    remainingQuota: 'Quota restant',
    meanRemaining: 'Moyenne restante',
    available: 'Dispo ',
    remaining: 'Restant',
    retryRead: 'Réessayer',
    accountsHeading: 'Comptes',
    accountsCount: (n: number) => `${n} compte(s)`,
    loading: 'Chargement',
    unavailable: 'Données indisponibles',
    addHint: 'Ajoutez des comptes pour voir leurs quotas',
    manageAccounts: 'Gérer les comptes',
    argonAvailable: 'Gemini 4 Argon disponible',
    switchTo: (name: string) => `Basculer vers ${name}`,
    disabledLabel: 'Désactivé',
    verifiedRunning: 'Confirmé dans l’application en cours',
    savedAccount: 'Compte enregistré',
    switchAndReopen: 'Basculer et rouvrir Antigravity',
    switchVerb: 'Basculer',
    multiple: 'Plusieurs',
    unknown: 'Inconnu',
    accountsBtn: 'Comptes',
    quit: 'Quitter',
  },
  en: {
    gemini: 'Gemini',
    other: 'Claude & GPT',
    allFamilies: 'Gemini / Claude & GPT',
    win5h: '5 hours',
    winWeekly: 'Weekly',
    reasons: {
      disabled: 'Disabled',
      blocked: 'Verification required',
      forbidden: 'Access denied',
      unreadable: 'Unreadable',
      stale: 'Refresh needed',
      protected: 'Protected',
      unknown: 'Not reported',
      expired: 'Reset due',
      conflict: 'Conflicting data',
    } satisfies Record<QuotaReason, string>,
    refreshNeeded: 'Refresh needed',
    resetPrefix: 'Reset: ',
    readError: 'Could not read accounts. Retry.',
    partialRefreshFail: (n: number) => `${n} accounts failed to refresh. Cached data retained.`,
    refreshFail: 'Refresh failed. Retry.',
    switchFail: 'Switch failed. Check this account in the app.',
    pagination: 'Pagination',
    prevPage: 'Previous page',
    nextPage: 'Next page',
    refreshAll: 'Refresh all quotas',
    settings: 'Settings',
    aggQuotas: 'Aggregate quotas',
    remainingQuota: 'Remaining quota',
    meanRemaining: 'Mean remaining',
    available: 'Available ',
    remaining: 'Remaining',
    retryRead: 'Retry read',
    accountsHeading: 'Accounts',
    accountsCount: (n: number) => `${n} accounts`,
    loading: 'Loading',
    unavailable: 'Data unavailable',
    addHint: 'Add accounts to see quotas',
    manageAccounts: 'Manage accounts',
    argonAvailable: 'Gemini 4 Argon available',
    switchTo: (name: string) => `Switch to ${name}`,
    disabledLabel: 'Disabled',
    verifiedRunning: 'Verified running app',
    savedAccount: 'Saved Switch account',
    switchAndReopen: 'Switch and reopen app',
    switchVerb: 'Switch',
    multiple: 'Multiple',
    unknown: 'Unknown',
    accountsBtn: 'Accounts',
    quit: 'Quit',
  },
  zh: {
    gemini: 'Gemini 系列',
    other: 'Claude 和 GPT 系列',
    allFamilies: 'Gemini 与 Claude/GPT',
    win5h: '5 小时',
    winWeekly: '每周',
    reasons: {
      disabled: '禁用',
      blocked: '待验证',
      forbidden: '访问受限',
      unreadable: '读取失败',
      stale: '待刷新',
      protected: '额度保护中',
      unknown: '未报告',
      expired: '已到重置时间',
      conflict: '数据冲突',
    } satisfies Record<QuotaReason, string>,
    refreshNeeded: '请刷新',
    resetPrefix: '重置: ',
    readError: '账号读取失败，请重试',
    partialRefreshFail: (n: number) => `${n} 个账号刷新失败，已保留缓存`,
    refreshFail: '刷新失败，请重试',
    switchFail: '切换失败，请在 App 中检查账号状态',
    pagination: '分页',
    prevPage: '上一页',
    nextPage: '下一页',
    refreshAll: '刷新全部额度',
    settings: '偏好设置',
    aggQuotas: '聚合额度',
    remainingQuota: '剩余额度',
    meanRemaining: '平均剩余',
    available: '可用 ',
    remaining: '剩余',
    retryRead: '重试读取',
    accountsHeading: '账号列表',
    accountsCount: (n: number) => `${n} 个账号`,
    loading: '正在读取',
    unavailable: '暂无可读取的数据',
    addHint: '添加账号后显示额度',
    manageAccounts: '管理账号',
    argonAvailable: '可使用 Gemini 4 Argon',
    switchTo: (name: string) => `切换到 ${name}`,
    disabledLabel: '禁用',
    verifiedRunning: '运行中的 App 已确认',
    savedAccount: 'Switch 保存的账号',
    switchAndReopen: '切换并重新打开 App',
    switchVerb: '切换',
    multiple: '多组',
    unknown: '未报告',
    accountsBtn: '管理账号',
    quit: '退出',
  },
} as const;

function Meter({ value, label, preferences, disabled }: { value: number | null; label: string; preferences: MenuBarPreferences; disabled?: boolean }) {
  if (value === null) return <div className="mb-meter unknown" role="img" aria-label={label + ': —'} />;
  return <div className={'mb-meter ' + quotaTone(value, preferences) + (disabled ? ' disabled-quota' : '')} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-valuetext={quotaDisplay(value)}>
    <span style={{ width: String(value ?? 0) + '%' }} />
  </div>;
}

export default function MenuBarDashboard() {
  const { i18n, t } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const copy = MB_COPY[lang];
  const config = useConfigStore(state => state.config);
  const [snapshot, setSnapshot] = useState<MenuBarSnapshot | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  const [capacity, setCapacity] = useState(3);
  const content = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(true);
  const preferences = useMemo(() => ({ ...DEFAULT_MENU_BAR_PREFERENCES, ...config?.menu_bar }), [config?.menu_bar]);
  const resetTimeDisplay = menuBarResetTimeDisplay(preferences);
  const scope = preferences.quota_scope;
  const periods: QuotaWindow[] = [...(preferences.show_session ? ['5h' as const] : []), ...(preferences.show_weekly ? ['weekly' as const] : [])];
  const families = preferences.display_scope === 'all' ? ['gemini', 'other'] as const : [preferences.display_scope];
  const scopeName = scope === 'gemini' ? copy.gemini : scope === 'other' ? copy.other : copy.allFamilies;
  const windowName = (window: QuotaWindow) => window === '5h' ? copy.win5h : copy.winWeekly;
  const reasonName = (reason: QuotaReason | null) => reason ? copy.reasons[reason] : '';
  const resetLabel = (reset: string) => {
    const diff = Date.parse(reset) - now;
    if (!Number.isFinite(diff)) return '—';
    if (diff <= 0) return copy.refreshNeeded;
    const minutes = Math.ceil(diff / 60000);
    const countdown = minutes < 60 ? minutes + 'm' : minutes < 1440 ? Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm' : Math.floor(minutes / 1440) + 'd ' + Math.floor(minutes % 1440 / 60) + 'h';
    return countdown;
  };
  const reload = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return; }
    const id = ++generation.current;
    try {
      const next = await request<MenuBarSnapshot>('get_menu_bar_snapshot');
      if (mounted.current && id === generation.current) { setSnapshot(next); setNow(Date.now()); setError(''); }
    } catch {
      if (mounted.current && id === generation.current) {
        setSnapshot(null);
        setError(MB_COPY[normalizeLanguage(i18n.language)].readError);
      }
    } finally { if (mounted.current && id === generation.current) setLoading(false); }
  }, [i18n]);
  const readAppearance = useCallback(async () => {
    try { const next = await request<Appearance>('get_menu_bar_appearance'); if (mounted.current) setAppearance(next); }
    catch { if (mounted.current) setAppearance(null); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    document.documentElement.classList.add('panel-window'); document.body.classList.add('panel-window');
    void reload();
    if (!isTauri()) return;
    void readAppearance();
    const subscriptions = [
      listen('menubar://opened', () => { void reload(); void readAppearance(); }),
      ...['menubar://data-updated', 'tray://account-switched', 'accounts://refreshed'].map(event => listen(event, () => void reload())),
      listen<Appearance>('menubar://appearance', event => setAppearance(event.payload)),
    ];
    return () => { mounted.current = false; generation.current++; void Promise.all(subscriptions).then(stops => stops.forEach(stop => stop())); };
  }, [reload, readAppearance]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') setNow(Date.now()); }, 30000);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (isTauri()) void request('hide_menu_bar_dashboard'); }
    };
    window.addEventListener('keydown', key);
    return () => { clearInterval(timer); window.removeEventListener('keydown', key); };
  }, []);
  useLayoutEffect(() => {
    if (!content.current) return;
    const element = content.current;
    const measure = () => { const accountArea = element.querySelector('.mb-accounts');
      if (accountArea) { const rows = [...accountArea.querySelectorAll('.mb-account-row')]; const rowHeight = rows.length ? Math.max(...rows.map(row => row.getBoundingClientRect().height + parseFloat(getComputedStyle(row).marginBottom))) : 86; setCapacity(Math.max(1, Math.floor((accountArea.clientHeight + 6) / rowHeight))); } };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [loading, snapshot, preferences.display_scope, preferences.show_weekly]);
  const accounts = useMemo(() => (snapshot?.accounts || []).map(account => menuBarAccount(account, now, config?.refresh_interval)).filter(view => !preferences.hide_unavailable || view.switchable), [snapshot, now, config?.refresh_interval, preferences.hide_unavailable]);
  const threshold = config?.quota_protection.threshold_percentage ?? 10;
  const aggregate = (window: QuotaWindow) => aggregateMenuBar(accounts, scope, window, threshold);
  const pageCount = Math.max(1, Math.ceil(accounts.length / capacity));
  const visiblePage = Math.min(page, pageCount - 1);
  const visible = accounts.slice(visiblePage * capacity, (visiblePage + 1) * capacity);
  const busy = refreshing || Boolean(switching);
  const openPage = (page: string) => { if (isTauri()) void request('open_app_page', { page }); };
  const refresh = async () => {
    if (operation.current || busy) return;
    operation.current = true; setRefreshing(true); setError('');
    try {
      const result = await request<{ failed: number }>('refresh_all_quotas');
      await reload();
      if (mounted.current && result.failed) setError(copy.partialRefreshFail(result.failed));
    } catch { if (mounted.current) setError(copy.refreshFail); }
    finally { operation.current = false; if (mounted.current) setRefreshing(false); }
  };
  const switchAccount = async (id: string) => {
    const target = accounts.find(view => view.account.id === id);
    if (operation.current || busy || !target?.switchable || (snapshot?.current_identity_source === 'running_app' && id === snapshot.current_account_id)) return;
    operation.current = true; setSwitching(id); setError('');
    try {
      await request('switch_account', { accountId: id }); await reload();
    } catch { await reload(); if (mounted.current) setError(copy.switchFail); }
    finally { operation.current = false; if (mounted.current) setSwitching(null); }
  };
  const pager = (index: number, total: number, update: (page: number) => void) => <nav className="mb-pagination" aria-label={copy.pagination}>
    <button aria-label={copy.prevPage} disabled={index === 0} onClick={() => update(index - 1)}><ChevronLeft size={13} /></button><span>{index + 1} / {total}</span><button aria-label={copy.nextPage} disabled={index + 1 >= total} onClick={() => update(index + 1)}><ChevronRight size={13} /></button>
  </nav>;
  return <div className={'menubar-app ' + (preferences.show_weekly && preferences.display_scope !== 'other' && accounts.some(view => view.argonReported) ? 'has-argon-pools ' : '') + (appearance?.native_material ? 'native-material' : 'opaque-material') + (appearance?.high_contrast ? ' high-contrast' : '')} data-language={lang} data-platform={appearance?.platform || 'unknown'} data-material={appearance?.material_kind || (appearance?.native_material ? 'vibrancy' : 'opaque')}>
    <header className="mb-header">
      <div className="mb-brand">{preferences.show_icons && <img src={logo} alt="" width="24" height="24" />}<div><span className="mb-eyebrow">Antigravity Switch</span></div></div>
      <div className="mb-header-actions"><button aria-label={copy.refreshAll} disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button><button aria-label={copy.settings} onClick={() => openPage('settings')}><Settings size={16} /></button></div>
    </header>
    {preferences.show_aggregate && <section className="mb-overview" aria-label={copy.aggQuotas}>
      <div className="mb-overview-heading"><h2>{copy.remainingQuota}</h2><span>{scopeName}  {copy.meanRemaining}</span></div>
      {periods.map(window => { const data = aggregate(window); return <div className="mb-aggregate" key={window}>
        <div><span>{windowName(window)}</span><span className="mb-availability">{copy.available}{data.usable}/{data.total}</span><span>{copy.remaining} <strong>{quotaDisplay(data.remaining)}</strong></span></div><Meter preferences={preferences} value={data.remaining} label={scopeName + ' ' + windowName(window)} />
      </div>; })}
    </section>}
    {error && <div className="mb-message error" role="alert">{error}{!refreshing && <button onClick={() => void reload()}>{copy.retryRead}</button>}</div>}
    <div className="mb-content" ref={content}>
      <div className="mb-account-heading"><strong>{copy.accountsHeading}</strong><span>{copy.accountsCount(accounts.length)}{snapshot && (snapshot.current_identity_source === 'unavailable' || (snapshot.current_identity_source === 'running_app' && !snapshot.current_account_id)) && <span role="status">{'  ' + t('tray.identity_unavailable')}</span>}</span></div>
      <div className="mb-accounts">{loading ? <div className="mb-empty"><Loader2 size={18} className="animate-spin" />{copy.loading}</div> : !accounts.length ? <div className="mb-empty">{error ? copy.unavailable : copy.addHint}<button onClick={() => openPage('accounts')}>{copy.manageAccounts}</button></div> : visible.map(view => {
        const account = view.account; const selected = account.id === snapshot?.current_account_id;
        const current = selected && snapshot?.current_identity_source === 'running_app';
        const label = account.custom_label || account.name || account.email.split('@')[0];
        return <article className={'mb-account-row ' + (families.length === 2 ? 'has-families ' : '') + (preferences.show_weekly && preferences.display_scope !== 'other' && view.argonReported ? 'has-argon ' : '') + (current ? 'current ' : selected ? 'selected ' : '') + (account.disabled ? 'disabled ' : '') + (resetTimeDisplay === 'hover' ? 'hover-resets' : resetTimeDisplay === 'always' ? 'always-resets' : '')} key={account.id}>
          <div className="mb-account-identity"><div className="mb-account-label"><span className="mb-account-name"><span>{preferences.label_style === 'label_then_email' && account.custom_label ? account.custom_label : account.email}</span>{view.argonReported && !account.disabled && <i className="mb-argon-dot" role="img" aria-label={copy.argonAvailable} title={copy.argonAvailable} />}</span>{families.length === 1 && <small>{preferences.label_style === 'email_only' ? '' : preferences.label_style === 'label_then_email' && account.custom_label ? account.email : account.custom_label ? account.custom_label : ''}</small>}</div><button className="mb-account-switch" aria-label={copy.switchTo(label)} title={account.disabled ? copy.disabledLabel : selected ? snapshot?.current_identity_source === 'running_app' ? copy.verifiedRunning : copy.savedAccount : copy.switchAndReopen} disabled={current || busy || !view.switchable} onClick={() => void switchAccount(account.id)}>{switching === account.id ? <Loader2 size={12} className="animate-spin" /> : account.disabled ? <Ban size={12} /> : current ? <CheckCircle2 size={12} /> : <ArrowLeftRight size={12} />}{account.disabled ? copy.disabledLabel : current ? t('tray.current') : selected ? t('tray.saved') : copy.switchVerb}</button></div>
          <>{families.length === 2 && <div className="mb-account-families"><span>Gemini</span><span>Claude / GPT</span></div>}<div className="mb-account-quotas">{periods.map(window => <div className="mb-account-window" key={window}>{families.map(family => { const quota = view.windows[window][family]; const remaining = account.disabled ? 0 : quota.remaining; const reset = account.disabled ? reasonName('disabled') : quota.resets.length > 1 ? copy.multiple : quota.resets.length ? resetLabel(quota.resets[0]) : reasonName(quota.reason) || copy.unknown; return <div className={'mb-mini ' + family} key={family}><span className="mb-period" title={(family === 'gemini' ? 'Gemini' : 'Claude / GPT') + ' · ' + windowName(window)}>{windowName(window)}</span><Meter preferences={preferences} disabled={account.disabled} value={remaining} label={label + ' ' + (family === 'gemini' ? 'Gemini' : 'Claude / GPT') + ' ' + windowName(window)} />{resetTimeDisplay !== 'hidden' && <span className="mb-reset-label"><Clock3 size={9} /><span>{reset}</span></span>}<strong>{quotaDisplay(remaining)}</strong></div>; })}</div>)}</div></>
          {preferences.show_weekly && preferences.display_scope !== 'other' && view.argonReported && <div className="mb-argon" title="Gemini 4 Argon">
            <span>Argon · {windowName('weekly')}</span>
            <Meter preferences={preferences} disabled={account.disabled} value={account.disabled ? 0 : view.argonWeekly.remaining} label={label + ' Gemini 4 Argon ' + windowName('weekly')} />
            <strong>{quotaDisplay(account.disabled ? 0 : view.argonWeekly.remaining)}</strong>
            {resetTimeDisplay !== 'hidden' && <span className="mb-argon-reset">{account.disabled ? reasonName('disabled') : view.argonWeekly.resets.length === 1 ? resetLabel(view.argonWeekly.resets[0]) : reasonName(view.argonWeekly.reason) || copy.multiple}</span>}
          </div>}
        </article>;
      })}</div>
      {pageCount > 1 && pager(visiblePage, pageCount, setPage)}
    </div>
    <footer className="mb-footer">
      <div className="mb-footer-actions"><button onClick={() => openPage('accounts')}>{preferences.show_icons && <Users size={13} />}{copy.accountsBtn}</button><button aria-label="GitHub" onClick={() => void request('open_project_page')}>{preferences.show_icons ? <ExternalLink size={14} /> : 'GitHub'}</button><button aria-label={copy.quit} onClick={() => void request('quit_app')}>{preferences.show_icons ? <LogOut size={14} /> : copy.quit}</button></div>
    </footer>
  </div>;
}
