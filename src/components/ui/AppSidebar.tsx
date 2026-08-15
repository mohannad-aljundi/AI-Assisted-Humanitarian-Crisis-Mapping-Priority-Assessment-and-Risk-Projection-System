"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppIcon, AppLogoIcon, MenuIcon } from "@/components/ui/AppIcon";
import { getActiveNavHref, MSC_NAV_ITEMS } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeHref = getActiveNavHref(pathname);

  const sidebar = (
    <>
      <div className="border-b border-white/10 px-4 py-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 transition-opacity hover:opacity-90"
          onClick={() => setMobileOpen(false)}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-[0_0_16px_rgba(37,99,235,0.35)]">
            <AppLogoIcon className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">CrisisMapper AI</p>
            <p className="text-[11px] text-slate-500">MSc Dissertation System</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {MSC_NAV_ITEMS.map((item) => {
          const active = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)]"
                  : "text-slate-400 hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-slate-100"
              }`}
            >
              <AppIcon
                name={item.icon}
                className={active ? "text-white" : "text-slate-500 group-hover:text-slate-300"}
              />
              <span className="flex-1">{item.label}</span>
              {active && (
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-[11px] text-slate-500">
          AI-Assisted Humanitarian Crisis Mapping
        </p>
        <p className="text-[10px] text-slate-600">Priority Assessment & Risk Projection</p>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-white/10 bg-[#0a1020] p-2 text-slate-300 transition hover:bg-white/10 lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/10 bg-[#0a1020] transition-transform duration-300 ease-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>
    </>
  );
}
