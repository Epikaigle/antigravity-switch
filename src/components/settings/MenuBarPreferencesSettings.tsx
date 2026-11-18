import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../../i18n';
import { useConfigStore } from '../../stores/useConfigStore';
import { request } from '../../utils/request';
import { isTauri } from '../../utils/env';
import { DEFAULT_MENU_BAR_PREFERENCES, menuBarResetTimeDisplay, type MenuBarPreferences, type MenuBarQuotaScope, type MenuBarResetTimeDisplay } from '../../types/config';

const COPY = {
  fr: {
    saveError: 'Impossible d’enregistrer. Vérifiez ces options et réessayez.',
    title: 'Affichage du panneau système',
    quotaScope: 'Quotas agrégés',
    familyScope: 'Familles affichées par compte',
    allFamilies: 'Gemini / Claude & GPT',
    geminiFamily: 'Gemini',
    otherFamily: 'Claude & GPT',
    labelStyle: 'Format du nom de compte',
    emailFirst: 'E-mail d’abord',
    noteFirst: 'Note d’abord',
    emailOnly: 'E-mail uniquement',
    resetDisplay: 'Affichage des réinitialisations',
    hover: 'Au survol',
    always: 'Toujours',
    hidden: 'Masqué',
    showAggregate: 'Afficher les quotas agrégés',
    hideUnavailable: 'Masquer les comptes désactivés/invalides',
    showSession: 'Afficher le quota 5 h',
    showWeekly: 'Afficher le quota hebdo',
    showIcons: 'Afficher les icônes',
    greenAbove: 'Vert : au-dessus de',
    greenAria: 'Seuil vert du quota',
    redBelow: 'Rouge : en dessous de',
    redAria: 'Seuil rouge du quota',
    thresholdHint: 'Les valeurs entre les seuils sont jaunes, bornes incluses.',
    aggHint: 'Les quotas agrégés représentent la moyenne des comptes valides.',
    availHint: 'Conservez au moins une fenêtre de quota active.',
  },
  en: {
    saveError: 'Could not save. Check these options and retry.',
    title: 'Menu bar display',
    quotaScope: 'Menu bar aggregate quotas',
    familyScope: 'Account quota family',
    allFamilies: 'Gemini / Claude & GPT',
    geminiFamily: 'Gemini',
    otherFamily: 'Claude & GPT',
    labelStyle: 'Account name format',
    emailFirst: 'Email first',
    noteFirst: 'Note first',
    emailOnly: 'Email only',
    resetDisplay: 'Reset time display',
    hover: 'On hover',
    always: 'Always',
    hidden: 'Hidden',
    showAggregate: 'Show aggregate quotas',
    hideUnavailable: 'Hide invalid and disabled accounts',
    showSession: 'Show 5-hour quota',
    showWeekly: 'Show weekly quota',
    showIcons: 'Show app and model icons',
    greenAbove: 'Green: above',
    greenAria: 'Green quota threshold',
    redBelow: 'Red: below',
    redAria: 'Red quota threshold',
    thresholdHint: 'Values between the thresholds are yellow, including boundaries.',
    aggHint: 'Aggregate quotas are mean remaining percentages across valid accounts, calculated separately for 5-hour and weekly windows. Missing or stale data is excluded.',
    availHint: 'Keep at least one quota window. Display settings save automatically and apply when reopening the menu.',
  },
  zh: {
    saveError: '保存失败，请检查选项后重试',
    title: '菜单栏显示',
    quotaScope: '菜单栏聚合额度',
    familyScope: '账号区显示系列',
    allFamilies: 'Gemini 与 Claude/GPT',
    geminiFamily: 'Gemini 系列',
    otherFamily: 'Claude 和 GPT 系列',
    labelStyle: '账号名称格式',
    emailFirst: '邮箱优先',
    noteFirst: '备注优先',
    emailOnly: '仅邮箱',
    resetDisplay: '重置时间显示',
    hover: '悬浮显示',
    always: '始终显示',
    hidden: '不显示',
    showAggregate: '显示整体额度',
    hideUnavailable: '隐藏失效和禁用账号',
    showSession: '显示 5 小时额度',
    showWeekly: '显示周额度',
    showIcons: '显示应用和模型图标',
    greenAbove: '绿色：高于',
    greenAria: '绿色额度阈值',
    redBelow: '红色：低于',
    redAria: '红色额度阈值',
    thresholdHint: '两个阈值之间为黄色，包含边界值。',
    aggHint: '聚合额度为有效账号剩余比例的平均值，分别统计 5 小时与周窗口；缺失或过期数据不参与计算。',
    availHint: '至少保留一个额度窗口；显示设置自动保存，重新打开菜单后生效。',
  },
} as const;

export default function MenuBarPreferencesSettings() {
  const { i18n } = useTranslation();
  const copy = COPY[normalizeLanguage(i18n.language)];
  const { config, loadConfig } = useConfigStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Partial<MenuBarPreferences>>({});
  const lock = useRef(false);
  const preferences = { ...DEFAULT_MENU_BAR_PREFERENCES, ...config?.menu_bar, ...pending };
  const disabled = busy || !config || !isTauri();
  const update = async (patch: Partial<MenuBarPreferences>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setPending(patch); setError('');
    try {
      const next = await request<MenuBarPreferences>('set_menu_bar_preferences', { patch });
      useConfigStore.setState(state => ({ config: state.config ? { ...state.config, menu_bar: next } : null }));
      await loadConfig();
    } catch { setError(copy.saveError); }
    finally { lock.current = false; setPending({}); setBusy(false); }
  };
  const selectStyle = 'min-h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800';
  const toggle = (key: 'hide_unavailable' | 'show_aggregate' | 'show_session' | 'show_weekly' | 'show_icons', text: string) => <label className="flex min-h-11 items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5 text-sm leading-5 text-gray-700 dark:bg-slate-800/50 dark:text-gray-300"><input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" checked={preferences[key]} disabled={disabled || (key === 'show_session' && !preferences.show_weekly) || (key === 'show_weekly' && !preferences.show_session)} onChange={event => void update({ [key]: event.target.checked })} />{text}</label>;
  return <div className="mt-5 space-y-5 border-t border-gray-100 pt-5 dark:border-slate-800" role="region" aria-labelledby="menu-bar-settings-title">
    <h3 id="menu-bar-settings-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">{copy.title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <label htmlFor="menu-bar-scope" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{copy.quotaScope}</label>
        <select id="menu-bar-scope" value={preferences.quota_scope} disabled={disabled} onChange={event => void update({ quota_scope: event.target.value as MenuBarQuotaScope })} className={selectStyle}><option value="all">{copy.allFamilies}</option><option value="gemini">{copy.geminiFamily}</option><option value="other">{copy.otherFamily}</option></select>
      </div>
      <div className="min-w-0 space-y-2">
        <label htmlFor="menu-bar-display" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{copy.familyScope}</label>
        <select id="menu-bar-display" className={selectStyle} value={preferences.display_scope} disabled={disabled} onChange={event => void update({ display_scope: event.target.value as MenuBarQuotaScope })}><option value="gemini">{copy.geminiFamily}</option><option value="other">{copy.otherFamily}</option><option value="all">{copy.allFamilies}</option></select>
      </div>
      <div className="min-w-0 space-y-2">
        <label htmlFor="menu-bar-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{copy.labelStyle}</label>
        <select id="menu-bar-label" className={selectStyle} value={preferences.label_style} disabled={disabled} onChange={event => void update({ label_style: event.target.value as MenuBarPreferences['label_style'] })}><option value="email_then_label">{copy.emailFirst}</option><option value="label_then_email">{copy.noteFirst}</option><option value="email_only">{copy.emailOnly}</option></select>
      </div>
      <div className="min-w-0 space-y-2">
        <label htmlFor="menu-bar-reset-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{copy.resetDisplay}</label>
        <select id="menu-bar-reset-time" className={selectStyle} value={menuBarResetTimeDisplay(preferences)} disabled={disabled} onChange={event => void update({ reset_time_display: event.target.value as MenuBarResetTimeDisplay })}><option value="hover">{copy.hover}</option><option value="always">{copy.always}</option><option value="hidden">{copy.hidden}</option></select>
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">{toggle('show_aggregate', copy.showAggregate)}{toggle('hide_unavailable', copy.hideUnavailable)}{toggle('show_session', copy.showSession)}{toggle('show_weekly', copy.showWeekly)}{toggle('show_icons', copy.showIcons)}</div>
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">{copy.greenAbove} <input aria-label={copy.greenAria} type="number" min={preferences.red_below + 1} max={100} defaultValue={preferences.green_above} key={'green' + preferences.green_above} disabled={disabled} className="h-10 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800" onBlur={event => { const value = Number(event.target.value); if (value !== preferences.green_above && Number.isInteger(value) && value > preferences.red_below && value <= 100) void update({ green_above: value }); else event.target.value = String(preferences.green_above); }} /> %</label>
        <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">{copy.redBelow} <input aria-label={copy.redAria} type="number" min={0} max={preferences.green_above - 1} defaultValue={preferences.red_below} key={'red' + preferences.red_below} disabled={disabled} className="h-10 w-20 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800" onBlur={event => { const value = Number(event.target.value); if (value !== preferences.red_below && Number.isInteger(value) && value >= 0 && value < preferences.green_above) void update({ red_below: value }); else event.target.value = String(preferences.red_below); }} /> %</label>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{copy.thresholdHint}</p>
    </div>
    <div className="space-y-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
      <p>{copy.aggHint}</p>
      <p>{copy.availHint}</p>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
