"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { brand } from "@/lib/brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("qe@factoryops.local");
  const [password, setPassword] = useState("demo");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <main className="login-stage">
      <Card className="login-card w-full max-w-md shadow-md">
        <CardHeader>
          <div
            className="brand-mark mb-1"
            aria-hidden
            style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)" }}
          />
          <CardTitle className="font-display text-2xl tracking-tight">{brand.name}</CardTitle>
          <CardDescription>
            Sign in to the app launcher — Operate, Quality & AI, Engineer, Govern, or Compliance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErr("");
              try {
                await login(email, password);
                router.push("/");
              } catch (ex: any) {
                setErr(ex.message || "Login failed");
                setBusy(false);
              }
            }}
          >
            <p className="text-muted-foreground text-xs">
              Demo password: <code className="font-mono">demo</code>
            </p>
            <label className="text-muted-foreground text-xs font-semibold" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
            <label className="text-muted-foreground text-xs font-semibold" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="mt-1 w-full" disabled={busy}>
              {busy ? "Signing in…" : "Enter plant"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
