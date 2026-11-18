import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Account } from '../../types/account';
import AccountCard from './AccountCard';

interface AccountGridProps {
    accounts: Account[];
    refreshingIds: Set<string>;
    currentAccountId: string | null;
    switchingAccountId: string | null;
    onSwitch: (accountId: string) => void;
    onRefresh: (accountId: string) => void;
    onEditLabel: (accountId: string) => void;
    onDelete: (accountId: string) => void;
    onExport?: (accountId: string) => void;
    onReorder?: (accountIds: string[]) => void;
}

interface SortableAccountCardProps {
    account: Account;
    isRefreshing: boolean;
    isCurrent: boolean;
    isSwitching: boolean;
    onSwitch: () => void;
    onRefresh: () => void;
    onEditLabel: () => void;
    onDelete: () => void;
    onExport?: () => void;
}

function SortableAccountCard({
    account,
    isRefreshing,
    isCurrent,
    isSwitching,
    onSwitch,
    onRefresh,
    onEditLabel,
    onDelete,
    onExport,
}: SortableAccountCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: account.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style}>
            <AccountCard
                account={account}
                isRefreshing={isRefreshing}
                isCurrent={isCurrent}
                isSwitching={isSwitching}
                onSwitch={onSwitch}
                onRefresh={onRefresh}
                onEditLabel={onEditLabel}
                onDelete={onDelete}
                onExport={onExport}
                dragHandleProps={{ attributes, listeners }}
                isDragging={isDragging}
            />
        </div>
    );
}

function AccountGrid({
    accounts,
    refreshingIds,
    currentAccountId,
    switchingAccountId,
    onSwitch,
    onRefresh,
    onEditLabel,
    onDelete,
    onExport,
    onReorder,
}: AccountGridProps) {
    const { t } = useTranslation();
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
    const activeAccount = useMemo(
        () => accounts.find((a) => a.id === activeId),
        [accounts, activeId],
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = accountIds.indexOf(active.id as string);
            const newIndex = accountIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
                onReorder(arrayMove(accountIds, oldIndex, newIndex));
            }
        }
    };

    if (accounts.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 shadow-xs border border-gray-200/80 dark:border-slate-800 text-center">
                <p className="text-base font-medium text-gray-700 dark:text-slate-200 mb-1.5">
                    {t('accounts.empty.title')}
                </p>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                    {t('accounts.empty.desc')}
                </p>
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={accountIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-4">
                    {accounts.map((account) => (
                        <SortableAccountCard
                            key={account.id}
                            account={account}
                            isRefreshing={refreshingIds.has(account.id)}
                            isCurrent={account.id === currentAccountId}
                            isSwitching={account.id === switchingAccountId}
                            onSwitch={() => onSwitch(account.id)}
                            onRefresh={() => onRefresh(account.id)}
                            onEditLabel={() => onEditLabel(account.id)}
                            onDelete={() => onDelete(account.id)}
                            onExport={onExport ? () => onExport(account.id) : undefined}
                        />
                    ))}
                </div>
            </SortableContext>

            <DragOverlay>
                {activeAccount ? (
                    <div className="w-full max-w-2xl shadow-2xl rounded-2xl opacity-90 pointer-events-none">
                        <AccountCard
                            account={activeAccount}
                            isRefreshing={refreshingIds.has(activeAccount.id)}
                            isCurrent={activeAccount.id === currentAccountId}
                            isSwitching={activeAccount.id === switchingAccountId}
                            onSwitch={() => {}}
                            onRefresh={() => {}}
                            onEditLabel={() => {}}
                            onDelete={() => {}}
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

export default AccountGrid;
