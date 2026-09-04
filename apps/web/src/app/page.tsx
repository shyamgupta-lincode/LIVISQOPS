"use client";
import { APPS } from "@/lib/apps";
import { brand } from "@/lib/brand";
import { api } from "@/lib/api";
import { appIconFor, workspaceIconFor } from "@/lib/app-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dock } from "@/components/ui/dock";
import { Separator } from "@/components/ui/separator";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function LauncherPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [agents, setAgents] = useState<any>(null);
  const [compliance, setCompliance] = useState<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem("fo_user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(raw));
    api("/plant/overview").then(setOverview).catch(() => {});
    api("/quality/events").then((d) => setEvents(d.items || [])).catch(() => {});
    api("/admin/agents").then(setAgents).catch(() => {});
    api("/compliance/cockpit").then(setCompliance).catch(() => {});
  }, [router]);

  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < APPS.length && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        router.push(APPS[idx].home);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router]);

  const openCrit = events.filter((e) => e.status !== "CLOSED" && (e.severity === "Critical" || e.severity === "High")).length;
  const openEvents = events.filter((e) => e.status !== "CLOSED").length;
  const atRisk = overview?.kpis?.assets_at_risk ?? 0;
  const actions = overview?.actions?.length ?? 0;
  const complianceRisk = compliance?.kpis?.compliance_risk ?? 0;
  const complianceOverdue = compliance?.kpis?.reports_overdue ?? 0;
  const complianceDrafts = compliance?.kpis?.ai_drafts_pending ?? 0;

  function statsFor(appId: string) {
    switch (appId) {
      case "operate":
        return (
          <>
            <Badge variant={actions > 0 ? "destructive" : "secondary"}><b>{actions}</b> open actions</Badge>
            <Badge variant="outline">OEE-ish <b>{Math.round((overview?.kpis?.throughput_vs_target || 0) * 100)}%</b></Badge>
            <Badge variant="outline"><b>{atRisk}</b> assets at risk</Badge>
          </>
        );
      case "quality":
        return (
          <>
            <Badge variant={openEvents > 0 ? "destructive" : "secondary"}><b>{openEvents}</b> open events</Badge>
            {openCrit > 0 && <Badge variant="destructive"><b>{openCrit}</b> critical/high</Badge>}
            <Badge variant="outline">FPY <b>{((overview?.kpis?.first_pass_yield || 0) * 100).toFixed(1)}%</b></Badge>
          </>
        );
      case "engineer":
        return (
          <>
            <Badge variant={atRisk > 0 ? "destructive" : "secondary"}><b>{atRisk}</b> PdM attention</Badge>
            <Badge variant="outline">graph + planes ready</Badge>
          </>
        );
      case "govern":
        return (
          <>
            <Badge variant="outline">provider <b>{agents?.provider || "mock"}</b></Badge>
            <Badge className="bg-ok/15 text-ok border-ok/30" variant="outline"><b>{agents?.autonomy_level || "L1"}</b></Badge>
          </>
        );
      case "compliance":
        return (
          <>
            <Badge variant={complianceRisk >= 60 ? "destructive" : "secondary"}>
              risk <b>{complianceRisk}</b>
            </Badge>
            <Badge variant="outline"><b>{complianceOverdue}</b> overdue</Badge>
            <Badge variant="outline"><b>{complianceDrafts}</b> AI drafts</Badge>
          </>
        );
      default:
        return null;
    }
  }

  const first = (user?.name || "there").split(" ")[0];

  function enterApp(home: string) {
    router.push(home);
  }

  function onCardKeyDown(e: KeyboardEvent<HTMLElement>, home: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enterApp(home);
    }
  }

  if (!user) {
    return (
      <div
        className="launcher launcher--shell flex h-dvh min-h-screen w-full flex-col overflow-hidden"
        aria-busy="true"
      />
    );
  }

  return (
    <div className="launcher launcher--shell flex h-dvh min-h-screen w-full max-w-none flex-col overflow-hidden">
      <header className="launcher-shell-header sticky top-0 z-20 w-full shrink-0 border-b">
        <div className="launcher-shell-header-inner flex w-full flex-wrap items-center justify-between gap-4 px-6 py-3 md:px-8 xl:px-10">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent)" }} />
            <div>
              <strong className="font-display text-lg">{brand.name}</strong>
              <div className="text-muted-foreground text-xs">{user?.site_name || "Midwest Hybrid Plant"} · app launcher</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Signed in</div>
              <div className="text-sm font-semibold">{user?.name} · {user?.role}</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { localStorage.clear(); router.push("/login"); }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="launcher-shell-main flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto px-6 py-6 md:px-8 xl:px-10">
        <div className="launcher-shell-hero shrink-0">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            {greeting()}, <em className="not-italic text-primary">{first}</em>. Where do you want to work?
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Choose an app to enter its workflows. Press <kbd className="rounded border px-1.5 py-0.5 text-xs">1</kbd>–
            <kbd className="rounded border px-1.5 py-0.5 text-xs">5</kbd> as shortcuts.
            Use each tile&apos;s workspace dock to jump straight in, or switch apps anytime from the bottom dock.
          </p>
        </div>

        <div className="launcher-shell-grid grid w-full flex-1 grid-cols-1 content-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {APPS.map((app, i) => {
            const AppIcon = appIconFor(app.id);
            const workspaceDockItems = app.workspaces.map((w) => ({
              id: w.href,
              label: w.label,
              Icon: workspaceIconFor(w.href),
              color: app.color,
              "aria-label": `${w.label} — ${w.desc}`,
            }));

            return (
              <Card
                key={app.id}
                role="link"
                tabIndex={0}
                data-app={`app-${app.id}`}
                aria-label={`Enter ${app.name}`}
                className="group h-full cursor-pointer gap-3 border-l-4 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] outline-none"
                style={{
                  ["--app-color" as string]: app.color,
                  borderLeftColor: app.color,
                }}
                onClick={() => enterApp(app.home)}
                onKeyDown={(e) => onCardKeyDown(e, app.home)}
              >
                <CardHeader className="px-5 pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="flex size-9 items-center justify-center rounded-xl"
                      style={{
                        background: `color-mix(in srgb, ${app.color} 14%, var(--surface-2))`,
                        color: app.color,
                      }}
                      aria-hidden
                    >
                      <AppIcon className="size-5" strokeWidth={2} />
                    </span>
                    <Badge variant="secondary" className="font-mono">{i + 1}</Badge>
                  </div>
                  <CardTitle className="font-display text-xl" style={{ color: app.color }}>{app.name}</CardTitle>
                  <CardDescription>{app.tagline}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  <div className="text-muted-foreground text-xs">{app.personas}</div>
                  <div className="flex flex-wrap gap-1.5">{statsFor(app.id)}</div>
                  <Separator />
                  <div className="flex flex-col gap-1.5">
                    <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                      Workspaces
                    </div>
                    <Dock
                      size="sm"
                      showIndicator={false}
                      aria-label={`${app.name} workspaces`}
                      items={workspaceDockItems}
                      onSelect={(href) => router.push(href)}
                    />
                  </div>
                </CardContent>
                <CardFooter className="px-5 pt-0">
                  <Link
                    href={app.home}
                    className="text-sm font-semibold"
                    style={{ color: app.color }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Enter →
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
