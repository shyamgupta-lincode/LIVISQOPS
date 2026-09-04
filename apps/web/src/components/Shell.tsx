"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun, LogOut, LayoutGrid, ChevronsUpDown } from "lucide-react";
import { brand } from "@/lib/brand";
import { APPS, appForPath, workspaceForPath } from "@/lib/apps";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dock } from "@/components/ui/dock";
import { appIconFor } from "@/lib/app-icons";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const app = useMemo(() => appForPath(path) || APPS[0], [path]);
  const workspace = useMemo(() => (app ? workspaceForPath(app, path) : undefined), [app, path]);

  const dockItems = useMemo(
    () =>
      APPS.map((a) => ({
        id: a.id,
        label: a.name,
        Icon: appIconFor(a.id),
        color: a.color,
        "aria-label": a.name,
      })),
    [],
  );

  useEffect(() => {
    const raw = localStorage.getItem("fo_user");
    if (!raw && path !== "/login") router.replace("/login");
    if (raw) setUser(JSON.parse(raw));
    const saved = (localStorage.getItem("fo_theme") as "light" | "dark" | null) || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved === "dark" ? "dark" : "");
    if (app) {
      document.documentElement.style.setProperty("--app-color", app.color);
      localStorage.setItem("fo_app", app.id);
    }
  }, [path, router, app]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = Number(e.key) - 1;
      if (idx < 0 || idx >= APPS.length || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      router.push(APPS[idx].home);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("fo_theme", next);
    document.documentElement.setAttribute("data-theme", next === "dark" ? "dark" : "");
  }

  function isActive(href: string, end?: boolean) {
    if (end) return path === href;
    return path === href || path.startsWith(`${href}/`);
  }

  const initials = (user?.name || "G")
    .split(" ")
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="shell" style={{ ["--app-color" as string]: app.color }}>
      <nav className="nav" aria-label="Primary">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <span className="brand-mark" aria-hidden style={{ background: app.color }} />
          <span>
            <span style={{ display: "block" }}>{brand.name}</span>
            <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{app.name}</span>
          </span>
        </Link>

        <Link href="/" className="switch-app">
          ← Switch app
        </Link>

        <div className="nav-section">Workspaces</div>
        {app.workspaces.map((w) => (
          <Link
            key={w.href}
            href={w.href}
            className={isActive(w.href, w.end) ? "active" : ""}
            style={isActive(w.href, w.end) ? { boxShadow: `inset 3px 0 0 ${app.color}` } : undefined}
          >
            <span className="nav-ico" aria-hidden>{w.icon}</span>
            <span>
              <span style={{ display: "block" }}>{w.label}</span>
              <span className="muted" style={{ fontSize: 10, fontWeight: 500 }}>{w.desc}</span>
            </span>
          </Link>
        ))}

        <div className="nav-foot">
          {workspace ? `${workspace.label} · ${app.name}` : app.name}
        </div>
      </nav>
      <div className="main">
        <header className="top">
          <span className="plant-chip">
            <strong style={{ color: app.color }}>{app.icon} {app.name}</strong>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="muted">{user?.site_name || "Midwest Hybrid Plant"}</span>
          </span>
          <Badge variant="outline" className="gap-1.5 border-ok/40 bg-ok/10 text-ok">
            <StatusIndicator state="active" size="sm" />
            Live · &lt;5s
          </Badge>
          <Input
            className="max-w-sm flex-1"
            placeholder="Search assets, orders, lots, events…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/quality?q=${encodeURIComponent(q)}`);
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              >
                {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {theme === "light" ? "Dark" : "Light"}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 gap-2 px-1.5 sm:px-2"
                aria-label="Open profile menu"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
                  <span className="max-w-[10rem] truncate text-xs font-medium leading-tight">
                    {user?.name || "Guest"}
                  </span>
                  <span className="text-muted-foreground max-w-[10rem] truncate text-[10px] leading-tight">
                    {user?.role || "viewer"}
                  </span>
                </span>
                <ChevronsUpDown className="text-muted-foreground hidden size-3.5 sm:block" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user?.name || "Guest"}</span>
                  <span className="text-muted-foreground text-xs">
                    {user?.email || user?.role || "Signed in"}
                  </span>
                  {user?.email && user?.role ? (
                    <span className="text-muted-foreground text-[10px]">{user.role}</span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/")}>
                <LayoutGrid className="size-4" />
                Switch app
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  localStorage.clear();
                  router.push("/login");
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="content" key={path}>{children}</div>
      </div>

      <div className="app-dock-host" aria-hidden={false}>
        <Dock
          items={dockItems}
          selectedId={app.id}
          onSelect={(id) => {
            const next = APPS.find((a) => a.id === id);
            if (next) router.push(next.home);
          }}
          aria-label="FactoryOps apps"
        />
      </div>
    </div>
  );
}
