"use client";

import { AppShellHeader, type AppShellHeaderProps } from "@/components/ui/AppShellHeader";

export type AppTopBarProps = AppShellHeaderProps;

/** @deprecated Sync Now is always shown when sync context is available. */
type LegacyAppTopBarProps = AppTopBarProps & {
  showSyncNow?: boolean;
};

export function AppTopBar({
  showSyncNow: _showSyncNow,
  ...props
}: LegacyAppTopBarProps) {
  return <AppShellHeader {...props} />;
}
