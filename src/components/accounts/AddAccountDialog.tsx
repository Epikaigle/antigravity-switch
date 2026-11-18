import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Globe, Loader2, CheckCircle2, XCircle, Copy, Check, Info, Link2 } from 'lucide-react';
import { useAccountStore } from '../../stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { request as invoke } from '../../utils/request';
import { isTauri } from '../../utils/env';
import { copyToClipboard } from '../../utils/clipboard';

interface AddAccountDialogProps {
    showText?: boolean;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

function AddAccountDialog({ showText = true }: AddAccountDialogProps) {
    const { t } = useTranslation();
    const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
    const { startOAuthLogin, completeOAuthLogin, cancelOAuthLogin } = useAccountStore();

    const [isOpen, setIsOpen] = useState(false);
    const [oauthUrl, setOauthUrl] = useState('');
    const [oauthUrlCopied, setOauthUrlCopied] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');

    const oauthUrlRef = useRef(oauthUrl);
    const statusRef = useRef(status);
    const isOpenRef = useRef(isOpen);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    }, []);

    useEffect(() => {
        oauthUrlRef.current = oauthUrl;
        statusRef.current = status;
        isOpenRef.current = isOpen;
    }, [oauthUrl, status, isOpen]);

    const resetState = () => {
        if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
        setStatus('idle');
        setMessage('');
        setOauthUrl('');
        setOauthUrlCopied(false);
        setManualCode('');
    };

    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isTauri()) return;
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-url-generated', (event) => {
                setOauthUrl(event.payload as string);
            });
        };

        void setupListener();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (!isTauri()) return;
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-callback-received', async () => {
                if (!isOpenRef.current) return;
                if (statusRef.current === 'loading' || statusRef.current === 'success') return;
                if (!oauthUrlRef.current) return;

                setStatus('loading');
                setMessage(`${t('accounts.add.tabs.oauth')}...`);

                try {
                    await completeOAuthLogin();
                    setStatus('success');
                    setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.success')}!`);
                    closeTimerRef.current = setTimeout(() => {
                        setIsOpen(false);
                        resetState();
                    }, 1500);
                } catch (error) {
                    setStatus('error');
                    const errorMsg = String(error);
                    if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                        setMessage(errorMsg);
                    } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                        setMessage(t('common.environment_error', { error: errorMsg }));
                    } else {
                        setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.error')}: ${errorMsg}`);
                    }
                }
            });
        };

        void setupListener();
        return () => {
            if (unlisten) unlisten();
        };
    }, [completeOAuthLogin, t]);

    useEffect(() => {
        if (!isOpen || oauthUrl) return;

        let disposed = false;
        invoke<any>('prepare_oauth_url')
            .then((res) => {
                const url = typeof res === 'string' ? res : res?.url;
                if (!url || url.length === 0) return;
                if (disposed) {
                    cancelOAuthLogin().catch(() => {});
                    return;
                }
                setOauthUrl(url);
            })
            .catch((e) => {
                console.error('Failed to prepare OAuth URL:', e);
            });

        return () => {
            disposed = true;
        };
    }, [isOpen, oauthUrl, cancelOAuthLogin]);

    const closeDialog = async () => {
        await cancelOAuthLogin().catch(() => {});
        setIsOpen(false);
        resetState();
    };

    const handleAction = async (
        actionName: string,
        actionFn: () => Promise<any>,
        options?: { clearOauthUrl?: boolean },
    ) => {
        setStatus('loading');
        setMessage(`${actionName}...`);
        if (options?.clearOauthUrl !== false) {
            setOauthUrl('');
        }
        try {
            await actionFn();
            setStatus('success');
            setMessage(`${actionName} ${t('common.success')}!`);
            closeTimerRef.current = setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } catch (error) {
            setStatus('error');
            const errorMsg = String(error);
            if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                setMessage(errorMsg);
            } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                setMessage(t('common.environment_error', { error: errorMsg }));
            } else {
                setMessage(`${actionName} ${t('common.error')}: ${errorMsg}`);
            }
        }
    };

    const handleOAuthWeb = async () => {
        try {
            setStatus('loading');
            setMessage(t('accounts.add.oauth.btn_start') + '...');

            const res = await invoke<any>('prepare_oauth_url');
            const url = typeof res === 'string' ? res : res.url;
            if (!url) {
                throw new Error(t('accounts.add.oauth.error_no_url', 'Unable to retrieve OAuth URL'));
            }

            setOauthUrl(url);
            const popup = window.open(url, '_blank');
            if (!popup) {
                setStatus('error');
                setMessage(t('accounts.add.oauth.popup_blocked', 'Popup blocked'));
                return;
            }

            const handleMessage = async (event: MessageEvent) => {
                if (event.data?.type === 'oauth-success') {
                    popup.close();
                    window.removeEventListener('message', handleMessage);
                    await fetchAccounts();
                    setStatus('success');
                    setMessage(t('accounts.add.oauth_success') || t('common.success'));
                    closeTimerRef.current = setTimeout(() => {
                        setIsOpen(false);
                        resetState();
                    }, 1500);
                }
            };

            window.addEventListener('message', handleMessage);

            const timer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(timer);
                    window.removeEventListener('message', handleMessage);
                    if (statusRef.current === 'loading') {
                        setStatus('idle');
                        setMessage('');
                    }
                }
            }, 1000);
        } catch (error) {
            console.error('OAuth Web Error:', error);
            setStatus('error');
            setMessage(`${t('common.error')}: ${error}`);
        }
    };

    const handleOAuth = () => {
        if (!isTauri()) {
            void handleOAuthWeb();
            return;
        }
        void handleAction(t('accounts.add.tabs.oauth'), startOAuthLogin, { clearOauthUrl: false });
    };

    const handleCompleteOAuth = () => {
        void handleAction(t('accounts.add.tabs.oauth'), completeOAuthLogin, { clearOauthUrl: false });
    };

    const handleCopyUrl = async () => {
        if (!oauthUrl) return;
        const success = await copyToClipboard(oauthUrl);
        if (success) {
            setOauthUrlCopied(true);
            window.setTimeout(() => setOauthUrlCopied(false), 1500);
        }
    };

    const handleManualSubmit = async () => {
        if (!manualCode.trim()) return;

        setStatus('loading');
        setMessage(t('accounts.add.oauth.manual_submitting', 'Submitting authorization code...'));

        try {
            await invoke('submit_oauth_code', { code: manualCode.trim(), state: null });
            setStatus('success');
            setMessage(t('accounts.add.oauth.manual_submitted', 'Authorization code submitted.'));
            setManualCode('');

            if (!isTauri()) {
                closeTimerRef.current = setTimeout(async () => {
                    await fetchAccounts();
                    setIsOpen(false);
                    resetState();
                }, 2000);
            }
        } catch (error) {
            const errStr = String(error);
            if (errStr.includes('No active OAuth flow')) {
                setMessage(t('accounts.add.oauth.error_no_flow'));
            } else {
                setMessage(`${t('common.error')}: ${errStr}`);
            }
            setStatus('error');
        }
    };

    const StatusAlert = () => {
        if (status === 'idle' || !message) return null;

        const styles = {
            loading: 'alert-info',
            success: 'alert-success',
            error: 'alert-error',
        };

        const icons = {
            loading: <Loader2 className="w-5 h-5 animate-spin" />,
            success: <CheckCircle2 className="w-5 h-5" />,
            error: <XCircle className="w-5 h-5" />,
        };

        return (
            <div className={`alert ${styles[status]} mb-4 text-sm py-2 shadow-sm`}>
                {icons[status]}
                <div><span>{message}</span></div>
            </div>
        );
    };

    return (
        <>
            <button
                type="button"
                className="min-h-9 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                onClick={() => setIsOpen(true)}
            >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                {showText && <span>{t('accounts.add_account')}</span>}
            </button>

            {isOpen && createPortal(
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
                >
                    <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-8 z-[1]" />
                    <div className="absolute inset-0 z-[0]" onClick={() => void closeDialog()} />

                    <div className="bg-white dark:bg-base-100 text-gray-900 dark:text-base-content rounded-2xl shadow-2xl w-full max-w-lg p-6 relative z-[10] m-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-lg mb-4">{t('accounts.add.title')}</h3>

                        {!isTauri() && (
                            <div className="alert alert-info mb-4 text-xs py-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800">
                                <Info className="w-4 h-4" />
                                <span>{t('accounts.add.oauth.web_hint')}</span>
                            </div>
                        )}

                        <StatusAlert />

                        <div className="space-y-6 py-2">
                            <div className="text-center space-y-3">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                                    <Globe className="w-10 h-10 text-blue-500" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{t('accounts.add.oauth.recommend')}</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                                        {t('accounts.add.oauth.desc')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button
                                    type="button"
                                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                    onClick={handleOAuth}
                                    disabled={status === 'loading' || status === 'success'}
                                >
                                    {status === 'loading' ? t('accounts.add.oauth.btn_waiting') : t('accounts.add.oauth.btn_start')}
                                </button>

                                {oauthUrl && (
                                    <div className="space-y-2">
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 text-left">
                                            {t('accounts.add.oauth.link_label')}
                                        </div>
                                        <button
                                            type="button"
                                            className="w-full px-4 py-2 bg-white dark:bg-base-100 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-xl border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-base-200 transition-all flex items-center gap-2"
                                            onClick={() => void handleCopyUrl()}
                                            title={t('accounts.add.oauth.link_click_to_copy')}
                                        >
                                            {oauthUrlCopied ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                            <code className="text-[11px] font-mono truncate flex-1 text-left">
                                                {oauthUrl}
                                            </code>
                                            <span className="text-[11px] whitespace-nowrap">
                                                {oauthUrlCopied ? t('accounts.add.oauth.copied') : t('accounts.add.oauth.copy_link')}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            className="w-full px-4 py-2 bg-white dark:bg-base-100 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-gray-50 dark:hover:bg-base-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                            onClick={handleCompleteOAuth}
                                            disabled={status === 'loading' || status === 'success'}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('accounts.add.oauth.btn_finish')}
                                        </button>
                                    </div>
                                )}

                                <div className="pt-4 mt-2 border-t border-gray-100 dark:border-base-200">
                                    <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                                        {t('accounts.add.oauth.manual_hint')}
                                    </div>
                                    <div className="relative flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                className="w-full text-xs py-2 px-3 bg-white dark:bg-base-100 border border-gray-200 dark:border-base-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600"
                                                placeholder={t('accounts.add.oauth.manual_placeholder')}
                                                value={manualCode}
                                                onChange={(e) => setManualCode(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="px-4 py-2 bg-neutral text-white dark:bg-white dark:text-neutral text-xs font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-1.5"
                                            onClick={() => void handleManualSubmit()}
                                            disabled={!manualCode.trim()}
                                        >
                                            <Link2 className="w-3.5 h-3.5" />
                                            {t('common.submit')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 w-full mt-6">
                            <button
                                type="button"
                                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-base-300 transition-colors focus:outline-none focus:ring-2 focus:ring-200 dark:focus:ring-base-300"
                                onClick={() => void closeDialog()}
                            >
                                {t('accounts.add.btn_cancel')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}

export default AddAccountDialog;
