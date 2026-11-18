export function getQuotaColor(percentage: number): string {
    if (percentage >= 50) return 'success';
    if (percentage >= 20) return 'warning';
    return 'error';
}

export function parseFlexibleDate(dateStr: string | undefined | null): Date | null {
    if (!dateStr || dateStr.trim() === '') return null;
    const trimmed = dateStr.trim();
    // Support numeric Unix timestamps (seconds or milliseconds).
    if (/^\d+$/.test(trimmed)) {
        const num = parseInt(trimmed, 10);
        return new Date(trimmed.length <= 10 ? num * 1000 : num);
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTimeRemaining(dateStr: string, lang = 'fr'): string {
    const targetDate = parseFlexibleDate(dateStr);
    if (!targetDate) return '';

    const normalizedLang = lang.toLowerCase().startsWith('zh')
        ? 'zh'
        : lang.toLowerCase().startsWith('en')
            ? 'en'
            : 'fr';

    const diffMs = targetDate.getTime() - Date.now();
    if (diffMs <= 0) {
        return normalizedLang === 'fr' ? 'Imminent' : normalizedLang === 'zh' ? '即将重置' : 'Due';
    }

    const totalMins = Math.floor(diffMs / 60_000);
    const diffHrs = Math.floor(totalMins / 60);
    const diffMins = totalMins % 60;

    if (diffHrs >= 24) {
        const diffDays = Math.floor(diffHrs / 24);
        const remainingHrs = diffHrs % 24;
        const dayUnit = normalizedLang === 'fr' ? 'j' : normalizedLang === 'zh' ? '天' : 'd';
        return `${diffDays}${dayUnit} ${remainingHrs}h`;
    }

    if (diffHrs > 0) {
        return `${diffHrs}h ${diffMins}m`;
    }

    return `${Math.max(1, diffMins)}m`;
}
