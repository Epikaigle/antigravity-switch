import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { format } from 'date-fns';
import AccountGrid from '../components/accounts/AccountGrid';
import AddAccountDialog from '../components/accounts/AddAccountDialog';
import ModalDialog from '../components/common/ModalDialog';
import { showToast } from '../components/common/ToastContainer';
import { saveAccountExport } from '../services/accountService';
import { useAccountStore } from '../stores/useAccountStore';
import type { Account } from '../types/account';
import { cn } from '../utils/cn';

function Accounts() {
    const { t } = useTranslation();
    const {
        accounts,
        currentAccount,
        fetchAccounts,
        fetchCurrentAccount,
        addAccount,
        deleteAccounts,
        switchAccount,
        loading,
        refreshQuota,
        reorderAccounts,
        updateAccountLabel,
    } = useAccountStore();

    const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
    const [accountToEditLabel, setAccountToEditLabel] = useState<Account | null>(null);
    const [labelDraft, setLabelDraft] = useState('');
    const [isSavingLabel, setIsSavingLabel] = useState(false);
    const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
    const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
    const [isRefreshingAll, setIsRefreshingAll] = useState(false);

    useEffect(() => {
        fetchAccounts();
        fetchCurrentAccount();
    }, [fetchAccounts, fetchCurrentAccount]);

    const handleAddAccount = async (email: string, refreshToken: string) => {
        await addAccount(email, refreshToken);
    };

    const handleSwitch = async (accountId: string) => {
        if (loading || switchingAccountId) return;
        setSwitchingAccountId(accountId);
        try {
            await switchAccount(accountId, 'app');
            showToast(t('common.success'), 'success');
        } catch (error) {
            console.error('[Accounts] Switch failed:', error);
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setTimeout(() => {
                setSwitchingAccountId(null);
            }, 500);
        }
    };

    const handleExport = async (accountId: string) => {
        try {
            const path = await save({
                defaultPath: `antigravity-account-${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }],
                title: t('accounts.export_account'),
            });
            if (!path) return;
            const count = await saveAccountExport([accountId], path);
            showToast(t('accounts.export_success', { count }), 'success');
        } catch (error) {
            showToast(t('accounts.export_failed', { error: String(error) }), 'error');
        }
    };

    const handleRefresh = async (accountId: string) => {
        setRefreshingIds((prev) => {
            const next = new Set(prev);
            next.add(accountId);
            return next;
        });
        try {
            await refreshQuota(accountId);
            showToast(t('common.success'), 'success');
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setRefreshingIds((prev) => {
                const next = new Set(prev);
                next.delete(accountId);
                return next;
            });
        }
    };

    const handleRefreshAll = async () => {
        if (isRefreshingAll || accounts.length === 0) return;
        setIsRefreshingAll(true);
        setRefreshingIds(new Set(accounts.map((a) => a.id)));
        try {
            const stats = await useAccountStore.getState().refreshAllQuotas();
            const successCount = stats?.success ?? 0;
            const failedCount = stats?.failed ?? 0;
            if (failedCount === 0) {
                showToast(t('accounts.refresh_selected', { count: successCount }), 'success');
            } else {
                showToast(`${t('common.success')}: ${successCount}, ${t('common.error')}: ${failedCount}`, 'warning');
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setIsRefreshingAll(false);
            setRefreshingIds(new Set());
        }
    };

    const handleDelete = (accountId: string) => {
        const account = accounts.find((item) => item.id === accountId);
        if (account) setAccountToDelete(account);
    };

    const executeDelete = async () => {
        if (!accountToDelete) return;
        const accountId = accountToDelete.id;
        setAccountToDelete(null);
        try {
            await deleteAccounts([accountId]);
            showToast(t('common.success'), 'success');
        } catch (error) {
            console.error('[Accounts] Delete failed:', error);
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleEditLabel = (accountId: string) => {
        const account = accounts.find((item) => item.id === accountId);
        if (!account) return;
        setAccountToEditLabel(account);
        setLabelDraft(account.custom_label || '');
    };

    const cancelEditLabel = () => {
        if (isSavingLabel) return;
        setAccountToEditLabel(null);
        setLabelDraft('');
    };

    const executeUpdateLabel = async () => {
        if (!accountToEditLabel || isSavingLabel) return;
        setIsSavingLabel(true);
        try {
            await updateAccountLabel(accountToEditLabel.id, labelDraft.trim());
            showToast(t('accounts.remark_updated'), 'success');
            setAccountToEditLabel(null);
            setLabelDraft('');
        } catch (error) {
            console.error('[Accounts] Update remark failed:', error);
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setIsSavingLabel(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h1
                        className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-100"
                        style={{ textWrap: 'balance' }}
                    >
                        {t('accounts.title')} ({accounts.length})
                    </h1>
                    <p
                        className="mt-1 text-sm text-gray-600 dark:text-slate-400"
                        style={{ textWrap: 'pretty' }}
                    >
                        {t('accounts.subtitle')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {accounts.length > 0 && (
                        <button
                            type="button"
                            onClick={() => void handleRefreshAll()}
                            disabled={isRefreshingAll}
                            className="min-h-9 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm font-medium text-gray-700 dark:text-slate-200 shadow-2xs inline-flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <RefreshCw className={cn('w-4 h-4 shrink-0', isRefreshingAll && 'animate-spin')} aria-hidden="true" />
                            <span>{isRefreshingAll ? t('common.refreshing') : t('accounts.refresh_all')}</span>
                        </button>
                    )}

                    <AddAccountDialog onAdd={handleAddAccount} showText={true} />
                </div>
            </header>

            <AccountGrid
                accounts={accounts}
                refreshingIds={refreshingIds}
                currentAccountId={currentAccount?.id || null}
                switchingAccountId={switchingAccountId}
                onSwitch={handleSwitch}
                onRefresh={handleRefresh}
                onEditLabel={handleEditLabel}
                onDelete={handleDelete}
                onExport={handleExport}
                onReorder={reorderAccounts}
            />

            <ModalDialog
                isOpen={accountToDelete !== null}
                title={t('accounts.dialog.delete_title')}
                message={accountToDelete ? `${t('accounts.dialog.delete_msg')}\n\n${accountToDelete.email}` : undefined}
                type="confirm"
                confirmText={t('common.delete')}
                isDestructive={true}
                onConfirm={executeDelete}
                onCancel={() => setAccountToDelete(null)}
            />

            <ModalDialog
                isOpen={accountToEditLabel !== null}
                title={t('accounts.edit_remark')}
                type="confirm"
                confirmText={isSavingLabel ? t('common.loading') : t('common.save')}
                onConfirm={executeUpdateLabel}
                onCancel={cancelEditLabel}
            >
                <div className="space-y-2">
                    <label htmlFor="account-note-input" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                        {t('accounts.remark')}
                    </label>
                    <input
                        id="account-note-input"
                        autoFocus
                        type="text"
                        maxLength={15}
                        value={labelDraft}
                        onChange={(event) => setLabelDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void executeUpdateLabel();
                            }
                        }}
                        placeholder={t('accounts.remark_placeholder')}
                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-right text-xs text-gray-400 dark:text-slate-500">
                        {Array.from(labelDraft).length}/15
                    </div>
                </div>
            </ModalDialog>
        </div>
    );
}

export default Accounts;
