"use client";

import Link from "next/link";
import { Bell, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { iconProps, AppLogoIcon } from "@/components/ui/AppIcon";
import {
  NewIncidentsNotification,
  SyncStatusBar,
} from "@/components/ui/SyncStatusBar";
import { ProcessingQueuePanel } from "@/components/analysis/ProcessingQueuePanel";
import { useSyncMonitoringOptional } from "@/contexts/SyncMonitoringContext";
import { useAppHeaderHeight } from "@/hooks/useAppHeaderHeight";

export interface AppShellHeaderProps {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  showAddReport?: boolean;
  alertCount?: number;
}

function formatDateRange(): string {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 7);

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function HeaderStatusPlaceholder() {
  return (
    <>
      <div className="enterprise-status-widget" aria-hidden>
        <p className="enterprise-status-widget__label">Auto Sync</p>
        <p className="enterprise-status-widget__value">
          <span className="enterprise-status-widget__dot bg-slate-500" />
          <span className="truncate">—</span>
        </p>
      </div>
      <div className="hidden min-w-[200px] max-w-[260px] 2xl:block" aria-hidden>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Processing Queue
          </p>
          <p className="mt-1 text-xs text-slate-400">—</p>
        </div>
      </div>
      <EnterpriseStatusWidget label="UTC Time" value="—" tone="blue" />
      <EnterpriseStatusWidget label="System" value="Operational" tone="green" />
      <EnterpriseStatusWidget label="AI Engine" value="Ready" tone="cyan" />
    </>
  );
}

function HeaderStatusCenter({ utcTime }: { utcTime: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <HeaderStatusPlaceholder />;
  }

  return (
    <>
      <SyncStatusBar compact />
      <NewIncidentsNotification />
      <div className="hidden min-w-[200px] max-w-[260px] 2xl:block">
        <ProcessingQueuePanel compact />
      </div>
      <EnterpriseStatusWidget label="UTC Time" value={utcTime || "—"} tone="blue" />
      <EnterpriseStatusWidget label="System" value="Operational" tone="green" />
      <EnterpriseStatusWidget label="AI Engine" value="Ready" tone="cyan" />
    </>
  );
}

function EnterpriseStatusWidget({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "green" | "cyan" | "blue" | "neutral";
}) {
  const dotClass =
    tone === "green"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]"
      : tone === "cyan"
        ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.55)]"
        : tone === "blue"
          ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.55)]"
          : "bg-slate-500";

  return (
    <div className="enterprise-status-widget">
      <p className="enterprise-status-widget__label">{label}</p>
      <p className="enterprise-status-widget__value">
        {tone !== "neutral" && (
          <span className={`enterprise-status-widget__dot ${dotClass}`} />
        )}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

export function AppShellHeader({
  title,
  subtitle = "AI-Assisted Humanitarian Crisis Mapping, Priority Assessment & Risk Projection",
  showLogo = false,
  showAddReport = true,
  alertCount = 0,
}: AppShellHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  useAppHeaderHeight(headerRef);

  const sync = useSyncMonitoringOptional();
  const badgeCount = alertCount > 0 ? Math.min(alertCount, 99) : 0;
  const [utcTime, setUtcTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setUtcTime(
        new Date().toLocaleString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour12: false,
        }) + " UTC"
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const isSyncing = sync?.isRefreshing || sync?.status.isRunning;

  return (
    <header
      ref={headerRef}
      className="app-shell-header"
      data-app-top-bar
    >
      <div className="app-shell-header__inner">
        <section
          className="app-shell-header__title"
          aria-label="Page title"
        >
          {showLogo && (
            <div className="app-shell-header__logo" aria-hidden>
              <AppLogoIcon className="text-white" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="app-shell-header__heading" title={title}>
              {title}
            </h1>
            {subtitle ? (
              <p className="app-shell-header__subtitle" title={subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </section>

        <section
          className="app-shell-header__center"
          aria-label="System status"
        >
          <HeaderStatusCenter utcTime={utcTime} />
        </section>

        <section
          className="app-shell-header__actions"
          aria-label="Page actions"
        >
          <EnterpriseStatusWidget
            label="Date Range"
            value={formatDateRange()}
          />

          {sync && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => void sync.syncNow()}
              className="enterprise-action-btn enterprise-action-btn--primary"
            >
              <RefreshCw
                {...iconProps}
                size={15}
                className={isSyncing ? "animate-spin" : ""}
              />
              {isSyncing ? "Syncing…" : "Sync Now"}
            </button>
          )}

          {showAddReport && (
            <Link
              href="/reports"
              className="enterprise-action-btn enterprise-action-btn--primary"
            >
              <Plus {...iconProps} size={15} />
              Add / Import Report
            </Link>
          )}

          <Link
            href="/alerts"
            className="enterprise-icon-btn"
            aria-label="Notifications"
          >
            <Bell {...iconProps} size={16} />
            {badgeCount > 0 && (
              <span className="enterprise-icon-btn__badge">
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </Link>
        </section>
      </div>
    </header>
  );
}
