import { useMemo } from 'react';
import {
    ArrowRightLeft,
    Ban,
    CheckCircle2,
    Circle,
    Clock,
    Diamond,
    Gem,
    GripVertical,
    Lock,
    RefreshCw,
    Tag,
    Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types/account';
import { cn } from '../../utils/cn';
import { getAccountTier } from '../../utils/accountTier';
import { resolveAccountQuotaPools } from '../../utils/menuBarQuota';
import { getValidationBlockedStatusLabel } from './accountValidationStatus';
import { QuotaPoolCard } from './QuotaItem';

interface AccountCardProps {
    account: Account;
    isCurrent: boolean;
    isRefreshing: boolean;
    isSwitching?: boolean;
    onSwitch: () => void;
    onRefresh: () => void;
    onEditLabel: () => void;
    onDelete: () => void;
    dragHandleProps?: {
        attributes?: any;
        listeners?: any;
    };
    isDragging?: boolean;
}

function AccountCard({
    account,
    isCurrent,
    isRefreshing,
    isSwitching = false,
    onSwitch,
    onRefresh,
    onEditLabel,
    onDelete,
    dragHandleProps,
    isDragging = false,
}: AccountCardProps) {
    const { t } = useTranslation();
    const isDisabled = Boolean(account.disabled);
    const validationBlockedLabel = getValidationBlockedStatusLabel(account.validation_blocked_reason, t);
    const tier = getAccountTier(account);
    const pools = useMemo(() => resolveAccountQuotaPools(account.quota), [account.quota]);

    const switchLabel = isSwitching ? t('accounts.switching') : t('accounts.switch_cta');
    const refreshLabel = t('accounts.action_refresh');
    const noteLabel = t('accounts.action_note');
    const deleteLabel = t('accounts.action_delete');

    const lastUpdatedLabel = account.quota?.last_updated
        ? new Date(account.quota.last_updated * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
          })
        : null;

    return (
        <article
            className={cn(
                '@container w-full rounded-2xl border-2 p-4 sm:p-5 transition-shadow relative',
                isCurrent
                    ? 'border-blue-500 bg-blue-50/40 dark:border-blue-400 dark:bg-blue-950/25 shadow-sm'
                    : 'border-transparent ring-1 ring-gray-200/90 dark:ring-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:ring-gray-300 dark:hover:ring-slate-700',
                (isRefreshing || isDisabled) && 'opacity-80',
                isDragging && 'shadow-xl ring-2 ring-blue-500/40',
            )}
        >
            <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0 flex-1 flex items-start gap-2.5">
                    {dragHandleProps && (
                        <button
                            type="button"
                            {...dragHandleProps.attributes}
                            {...dragHandleProps.listeners}
                            aria-label={t('accounts.drag_to_reorder')}
                            title={t('accounts.drag_to_reorder')}
                            className="min-h-8 min-w-8 mt-0.5 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <GripVertical className="w-4 h-4" aria-hidden="true" />
                        </button>
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            {isCurrent && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600 text-white text-xs font-semibold shadow-2xs">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    <span>{t('accounts.active_badge')}</span>
                                </span>
                            )}

                            {tier === 'ultra' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[11px] font-bold">
                                    <Gem className="w-3 h-3 fill-current" aria-hidden="true" />
                                    <span>ULTRA</span>
                                </span>
                            ) : tier === 'pro' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-bold">
                                    <Diamond className="w-3 h-3 fill-current" aria-hidden="true" />
                                    <span>PRO</span>
                                </span>
                            ) : (
                                <span
                                    title={tier === 'unknown' ? t('accounts.unknown_hint') : undefined}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 text-[11px] font-semibold border border-gray-200 dark:border-slate-700"
                                >
                                    <Circle className="w-2.5 h-2.5" aria-hidden="true" />
                                    <span>{t(`accounts.${tier}`)}</span>
                                </span>
                            )}

                            {account.custom_label && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[11px] font-semibold border border-amber-200/70 dark:border-amber-800/50">
                                    <Tag className="w-3 h-3" aria-hidden="true" />
                                    <span>{account.custom_label}</span>
                                </span>
                            )}

                            {isDisabled && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                                    <Ban className="w-3 h-3" aria-hidden="true" />
                                    <span>{t('accounts.disabled')}</span>
                                </span>
                            )}

                            {account.quota?.is_forbidden && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[11px] font-bold">
                                    <Lock className="w-3 h-3" aria-hidden="true" />
                                    <span>{t('accounts.forbidden')}</span>
                                </span>
                            )}

                            {account.validation_blocked && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                                    <Clock className="w-3 h-3" aria-hidden="true" />
                                    <span>{validationBlockedLabel}</span>
                                </span>
                            )}
                        </div>

                        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 break-words">
                            {account.email}
                        </h3>
                        {account.name && account.name.trim() !== account.email && (
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{account.name}</p>
                        )}
                    </div>
                </div>

                <div className="shrink-0 flex items-center">
                    {isCurrent ? (
                        <span className="min-h-9 px-3.5 py-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>{t('accounts.currently_used')}</span>
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={onSwitch}
                            disabled={isSwitching || isDisabled}
                            aria-label={`${switchLabel} (${account.email})`}
                            title={isDisabled ? t('accounts.disabled_tooltip') : switchLabel}
                            className="min-h-9 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs inline-flex items-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                        >
                            <ArrowRightLeft className={cn('w-4 h-4 shrink-0', isSwitching && 'animate-spin')} aria-hidden="true" />
                            <span>{switchLabel}</span>
                        </button>
                    )}
                </div>
            </header>

            <div>
                {isDisabled || account.quota?.is_forbidden || account.validation_blocked ? (
                    <div className="rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-3.5 flex items-center gap-2.5 text-sm text-rose-700 dark:text-rose-300">
                        {account.validation_blocked ? (
                            <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        ) : isDisabled ? (
                            <Ban className="w-4 h-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                        )}
                        <span className="font-medium">
                            {account.validation_blocked
                                ? validationBlockedLabel
                                : isDisabled
                                  ? t('accounts.status.disabled')
                                  : t('accounts.forbidden_msg')}
                        </span>
                    </div>
                ) : pools.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-slate-400">
                        <span>{t('accounts.no_quota_yet')}</span>
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="min-h-8 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-medium inline-flex items-center gap-1.5 transition-colors"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} aria-hidden="true" />
                            <span>{refreshLabel}</span>
                        </button>
                    </div>
                ) : (
                    <div className={cn('grid gap-3', pools.length > 1 ? 'grid-cols-1 @[600px]:grid-cols-2' : 'grid-cols-1')}>
                        {pools.map((pool) => (
                            <QuotaPoolCard key={pool.id} pool={pool} />
                        ))}
                    </div>
                )}
            </div>

            <footer className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-gray-500 dark:text-slate-400">
                    {lastUpdatedLabel ? t('accounts.updated_at', { time: lastUpdatedLabel }) : ''}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isRefreshing || isDisabled}
                        aria-label={`${refreshLabel} (${account.email})`}
                        className="min-h-8 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5 shrink-0', isRefreshing && 'animate-spin')} aria-hidden="true" />
                        <span>{refreshLabel}</span>
                    </button>

                    <button
                        type="button"
                        onClick={onEditLabel}
                        disabled={isRefreshing || isSwitching}
                        aria-label={`${noteLabel} (${account.email})`}
                        className="min-h-8 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <Tag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{noteLabel}</span>
                    </button>

                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={isRefreshing || isSwitching}
                        aria-label={`${deleteLabel} (${account.email})`}
                        className="min-h-8 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{deleteLabel}</span>
                    </button>
                </div>
            </footer>
        </article>
    );
}

export default AccountCard;
