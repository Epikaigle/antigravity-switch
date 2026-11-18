import { Bot, BrainCircuit, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../../i18n';
import { cn } from '../../utils/cn';
import { formatTimeRemaining, getQuotaColor } from '../../utils/format';
import type { QuotaWindowMetric, ResolvedQuotaPool } from '../../utils/menuBarQuota';

interface QuotaPoolCardProps {
    pool: ResolvedQuotaPool;
}

function getBarColorClass(percentage: number): string {
    switch (getQuotaColor(percentage)) {
        case 'success':
            return 'bg-emerald-500';
        case 'warning':
            return 'bg-amber-500';
        default:
            return 'bg-rose-500';
    }
}

function getPercentTextClass(percentage: number): string {
    switch (getQuotaColor(percentage)) {
        case 'success':
            return 'text-emerald-700 dark:text-emerald-400';
        case 'warning':
            return 'text-amber-700 dark:text-amber-400';
        default:
            return 'text-rose-700 dark:text-rose-400';
    }
}

function PoolIcon({ kind }: { kind: ResolvedQuotaPool['kind'] }) {
    if (kind === 'other') {
        return <BrainCircuit className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />;
    }
    if (kind === 'custom') {
        return <Bot className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
    }
    return <Sparkles className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
}

function WindowCell({ metric, lang }: { metric: QuotaWindowMetric; lang: string }) {
    const { t } = useTranslation();
    const windowTitle = metric.window === '5h'
        ? t('accounts.window_5h', 'Quota 5h')
        : t('accounts.window_weekly', 'Quota hebdo (7j)');
    const resetFormatted = metric.resetTime ? formatTimeRemaining(metric.resetTime, lang) : '';

    return (
        <div className="rounded-lg bg-white dark:bg-slate-900/80 border border-gray-200/70 dark:border-slate-700/70 px-3 py-2 flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-xs leading-tight">
                <span className="font-medium text-gray-600 dark:text-slate-300 truncate">{windowTitle}</span>
                {metric.percentage === null ? (
                    <span className="font-mono font-semibold text-gray-400 dark:text-slate-500">—</span>
                ) : (
                    <span className={cn('font-mono font-bold tabular-nums', getPercentTextClass(metric.percentage))}>
                        {Math.round(metric.percentage)}%
                    </span>
                )}
            </div>

            <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                {metric.percentage !== null && (
                    <div
                        className={cn('h-full rounded-full transition-all duration-300', getBarColorClass(metric.percentage))}
                        style={{ width: `${Math.max(0, Math.min(100, metric.percentage))}%` }}
                    />
                )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-slate-400 font-mono min-h-4">
                {resetFormatted ? (
                    <>
                        <Clock className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        <span className="truncate">{t('accounts.reset_in', { time: resetFormatted })}</span>
                    </>
                ) : (
                    <span className="text-gray-400 dark:text-slate-500">—</span>
                )}
            </div>
        </div>
    );
}

export function QuotaPoolCard({ pool }: QuotaPoolCardProps) {
    const { i18n } = useTranslation();
    const lang = normalizeLanguage(i18n.language);

    return (
        <div className="@container rounded-xl bg-gray-50/90 dark:bg-slate-800/50 border border-gray-200/70 dark:border-slate-700/60 p-3 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-slate-200">
                <PoolIcon kind={pool.kind} />
                <span className="truncate">{pool.label}</span>
            </div>

            <div className={cn('grid gap-2', pool.windows.length > 1 ? 'grid-cols-1 @[260px]:grid-cols-2' : 'grid-cols-1')}>
                {pool.windows.map((metric) => (
                    <WindowCell key={metric.window} metric={metric} lang={lang} />
                ))}
            </div>
        </div>
    );
}
