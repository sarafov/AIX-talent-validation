"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Workflow, Layers, Settings, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useWorkflow } from "@/lib/workflow";

const links = [
  { href: "/", label: "Beranda", Icon: Home },
  { href: "/validasi", label: "Workspace validasi", Icon: Workflow },
  { href: "/katalog", label: "Katalog capability", Icon: Layers },
  { href: "/pengaturan", label: "Pengaturan model", Icon: Settings },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    { apiKey, provider } = useStore(),
    { state } = useWorkflow();
  const nav = links.map(({ href, label, Icon }) => (
    <Link
      key={href}
      href={href}
      aria-current={path === href ? "page" : undefined}
      className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${path === href ? "bg-accent-50 font-medium text-accent-700" : "text-muted hover:bg-canvas"}`}
    >
      <Icon size={17} aria-hidden />
      {label}
    </Link>
  ));
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <Link href="/" className="border-b border-line px-5 py-6">
            <p className="text-lg font-semibold">
              AIX <span className="text-accent-700">Talent Validation</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Capability · Capacity · Decisions
            </p>
          </Link>
          <nav aria-label="Navigasi utama" className="space-y-1 p-3">
            {nav}
          </nav>
          <div className="mx-4 mt-auto mb-6 rounded-xl bg-canvas p-4 text-xs text-muted">
            <CheckCircle2 size={18} className="mb-2 text-accent-600" />
            {state.run?.approved
              ? "Baseline breakdown disetujui"
              : "Review manusia pada setiap keputusan"}
            <p className="mt-2">
              Assignment count adalah konteks. Ketersediaan perlu dikonfirmasi.
            </p>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-6 py-3 backdrop-blur">
          <span className="text-sm font-medium">Project & Talent Review</span>
          <Link
            href="/pengaturan"
            className="flex items-center gap-2 truncate text-xs text-muted"
          >
            <span
              className={`h-2 w-2 rounded-full ${apiKey ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            {apiKey ? provider.model : "Mode aturan · model belum diatur"}
          </Link>
        </header>
        <nav
          aria-label="Navigasi mobile"
          className="flex gap-1 overflow-auto border-b border-line bg-white p-2 lg:hidden"
        >
          {nav}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
          {children}
        </main>
        <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line px-6 py-5 text-xs text-muted">
          <p>
            Dibuat oleh <strong>Abdurrahman & Adryan Rizky Alviano</strong>
          </p>
          <a
            href="https://github.com/sarafov/AIX-talent-validation"
            className="underline"
          >
            GitHub · MIT
          </a>
        </footer>
      </div>
    </div>
  );
}
