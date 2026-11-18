import type { ModelQuota, QuotaData } from "../types/account";
import { quotaPoolKind, type QuotaPoolKind } from "./accountDashboard";

/** Legacy zeros are ambiguous: previous parsers substituted zero for missing API data. */
export function observedPercentage(
  value: unknown,
  known?: boolean,
  fraction = false,
): number | null {
  if (known === false || (known === undefined && value === 0)) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scaled = fraction ? value * 100 : value;
  return scaled >= 0 && scaled <= 100 ? scaled : null;
}

export function observedModelPercentage(model?: ModelQuota): number | null {
  if (!model) return null;
  return model.observed_remaining_fraction !== undefined
    ? observedPercentage(
        model.observed_remaining_fraction,
        model.percentage_known,
        true,
      )
    : observedPercentage(model.percentage, model.percentage_known);
}

export function modelQuotaPoolKind(
  name: string,
  displayName?: string,
): QuotaPoolKind | null {
  const lower = (name || "").trim().toLowerCase();
  if (lower.startsWith("gemini")) {
    const words = [name, displayName || ""].flatMap((value) =>
      value.split(/[^a-z0-9]+/i).map((word) => word.toLowerCase()),
    );
    if (lower.startsWith("gemini-pro-orchestrator")) {
      return words.includes("argon") || lower.includes("g1-pro")
        ? "argon"
        : "carbon";
    }
    if (words.includes("carbon") || lower.startsWith("gemini-4-carbon"))
      return "carbon";
    if (words.includes("argon") || lower.startsWith("gemini-4-argon"))
      return "argon";
    return "gemini";
  }
  if (lower.startsWith("claude") || lower.startsWith("gpt")) return "other";
  return null;
}

export interface QuotaWindowMetric {
  window: "5h" | "weekly";
  percentage: number | null;
  resetTime?: string;
}

export interface ResolvedQuotaPool {
  id: string;
  kind: "gemini" | "other" | "argon" | "carbon" | "custom";
  label: string;
  windows: QuotaWindowMetric[];
}

const POOL_SORT_ORDER: Record<ResolvedQuotaPool["kind"], number> = {
  gemini: 0,
  other: 1,
  carbon: 2,
  argon: 3,
  custom: 4,
};

function poolLabelForKind(
  kind: ResolvedQuotaPool["kind"],
  fallback: string,
): string {
  switch (kind) {
    case "gemini":
      return "Gemini";
    case "other":
      return "Claude & GPT";
    case "argon":
      return "Gemini 4 Argon";
    case "carbon":
      return "Gemini 4 Carbon";
    default:
      return fallback;
  }
}

/** Resolve dual-window (`5h` + `weekly`) quota pools per account for simultaneous display. */
export function resolveAccountQuotaPools(
  quota?: QuotaData,
): ResolvedQuotaPool[] {
  if (!quota || quota.is_forbidden) return [];

  const pools = new Map<
    string,
    {
      kind: ResolvedQuotaPool["kind"];
      label: string;
      windows: Partial<Record<"5h" | "weekly", QuotaWindowMetric>>;
    }
  >();

  if (quota.quota_groups?.length) {
    for (const group of quota.quota_groups) {
      for (const bucket of group.buckets || []) {
        const winLower = bucket.window.trim().toLowerCase();
        const idLower = bucket.bucket_id.trim().toLowerCase();
        const win: "5h" | "weekly" | null =
          winLower === "5h" || idLower.endsWith("-5h")
            ? "5h"
            : winLower === "weekly" || idLower.endsWith("-weekly")
              ? "weekly"
              : null;
        if (!win) continue;

        const mappedKind = quotaPoolKind(bucket.bucket_id, group.display_name);
        if (mappedKind === "other") continue;

        const kind: ResolvedQuotaPool["kind"] = mappedKind ?? "custom";
        const fallbackLabel =
          group.display_name || bucket.display_name || bucket.bucket_id || "Quota";
        const key = mappedKind ?? `custom:${fallbackLabel.trim().toLowerCase()}`;
        const label = poolLabelForKind(kind, fallbackLabel);

        const percentage = observedPercentage(
          bucket.remaining_fraction,
          bucket.remaining_fraction_known,
          true,
        );
        const resetTime = bucket.reset_time?.trim() || undefined;

        const entry = pools.get(key) ?? { kind, label, windows: {} };
        const existing = entry.windows[win];
        if (!existing) {
          entry.windows[win] = { window: win, percentage, resetTime };
        } else if (
          existing.percentage === null ||
          (percentage !== null && percentage < existing.percentage)
        ) {
          entry.windows[win] = {
            window: win,
            percentage: percentage ?? existing.percentage,
            resetTime: resetTime ?? existing.resetTime,
          };
        }
        pools.set(key, entry);
      }
    }
  } else if (quota.models?.length) {
    for (const model of quota.models) {
      if (model.name?.trim().toLowerCase().endsWith("-disabled")) continue;
      const mappedKind = modelQuotaPoolKind(model.name, model.display_name);
      if (!mappedKind || mappedKind === "other") continue;

      const win: "5h" | "weekly" = mappedKind === "argon" ? "weekly" : "5h";
      const percentage = observedModelPercentage(model);
      const resetTime = model.reset_time?.trim() || undefined;
      const entry = pools.get(mappedKind) ?? {
        kind: mappedKind,
        label: poolLabelForKind(mappedKind, mappedKind),
        windows: {},
      };
      const existing = entry.windows[win];
      if (!existing) {
        entry.windows[win] = { window: win, percentage, resetTime };
      } else if (
        percentage !== null &&
        (existing.percentage === null || percentage < existing.percentage)
      ) {
        entry.windows[win] = {
          window: win,
          percentage,
          resetTime: resetTime ?? existing.resetTime,
        };
      }
      pools.set(mappedKind, entry);
    }
  }

  return Array.from(pools.entries())
    .map(([id, pool]) => ({
      id,
      kind: pool.kind,
      label: pool.label,
      windows: (["5h", "weekly"] as const)
        .map((win) => pool.windows[win])
        .filter((metric): metric is QuotaWindowMetric => Boolean(metric)),
    }))
    .filter((pool) => pool.windows.length > 0)
    .sort(
      (a, b) =>
        POOL_SORT_ORDER[a.kind] - POOL_SORT_ORDER[b.kind] ||
        a.label.localeCompare(b.label),
    );
}
