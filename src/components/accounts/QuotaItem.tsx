import { Clock, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../../i18n';
import { cn } from '../../utils/cn';
import { getQuotaColor, formatTimeRemaining } from '../../utils/format';

interface QuotaItemProps {
    label: React.ReactNode;
    title?: string;
    percentage: number | null;
    resetTime?: string;
    windowLabel?: string;
    isProtected?: boolean;
    className?: string;
    Icon?: React.ComponentType<{ size?: number; className?: string }>;
}

const LEFT_LABEL = { fr: 'Restant', en: 'Left', zh: '剩余' } as const;

export function QuotaItem({
    label,
    title,
    percentage,
    resetTime,
    windowLabel,
    isProtected,
    className,
    Icon,
}: QuotaItemProps) {
    const { t, i18n } = useTranslation();

    const getBgColorClass = (p: number) => {
        const color = getQuotaColor(p);
        switch (color) {
            case 'success': return 'bg-emerald-500';
            case 'warning': return 'bg-amber-500';
            case 'error': return 'bg-rose-500';
            default: return 'bg-gray-500';
        }
    };

    const getTextColorClass = (p: number) => {
        const color = getQuotaColor(p);
        switch (color) {
            case 'success': return 'text-emerald-600 dark:text-emerald-400';
            case 'warning': return 'text-amber-600 dark:text-amber-400';
            case 'error': return 'text-rose-600 dark:text-rose-400';
            default: return 'text-gray-500';
        }
    };

    if (percentage === null) {
        return (
            <div
                className={cn(
                    "h-[24px] px-2 rounded-md flex items-center justify-between text-gray-400 dark:text-gray-500 text-[10px] font-mono opacity-60 border border-gray-100/50 dark:border-white/5 bg-gray-50/20 dark:bg-white/5",
                    className
                )}
                title={title || (typeof label === 'string' ? label : undefined)}
            >
                <span className="flex items-center gap-1 truncate font-medium">
                    {Icon && <Icon size={12} className="shrink-0" />}
                    {label}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                    {windowLabel && <span className="text-[9px] px-1 py-0.2 rounded bg-gray-200/50 dark:bg-white/5">{windowLabel}</span>}
                    <span className="italic">—</span>
                </div>
            </div>
        );
    }

    const lang = normalizeLanguage(i18n.language);
    const roundedPercent = Math.round(percentage);

    return (
        <div
            className={cn(
                "relative w-full rounded-lg px-2.5 py-1.5 flex flex-col gap-1 transition-all",
                "bg-gray-50/80 dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/[0.08] shadow-sm group/quota",
                className
            )}
            title={title || (typeof label === 'string' ? label : undefined)}
        >
            <div className="w-full flex items-center justify-between text-[11px] leading-tight">
                <div className="flex items-center gap-1.5 min-w-0 truncate font-semibold text-gray-800 dark:text-gray-100">
                    {Icon && <Icon size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />}
                    <span className="truncate min-w-0">{label}</span>
                    {windowLabel && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-gray-200/70 dark:bg-white/10 text-gray-500 dark:text-gray-400 font-normal shrink-0">
                            {windowLabel}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0 pl-1.5 font-bold font-mono">
                    {isProtected && (
                        <span title={t('accounts.quota_protected')}><Lock className="w-2.5 h-2.5 text-amber-500" /></span>
                    )}
                    <span className={cn(getTextColorClass(percentage), "inline-flex items-center gap-1")}>
                        <span className="text-[10px] font-normal opacity-80">{LEFT_LABEL[lang]}</span>
                        <span>{roundedPercent}%</span>
                    </span>
                </div>
            </div>

            <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        getBgColorClass(percentage)
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
                />
            </div>

            <div className="w-full flex items-center justify-end text-[10px] font-mono leading-none pt-0.5">
                {resetTime ? (
                    <span className="flex items-center gap-0.5 font-medium text-amber-600 dark:text-amber-400">
                        <Clock className="w-2.5 h-2.5 shrink-0" />
                        <span>{formatTimeRemaining(resetTime)}</span>
                    </span>
                ) : (
                    <span className="text-gray-300 dark:text-gray-600 italic scale-90">N/A</span>
                )}
            </div>
        </div>
    );
}
