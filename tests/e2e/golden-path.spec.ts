import { test, expect } from "@playwright/test";

test("8-step golden path (UI + API orchestration)", async ({ page, request }) => {
  const api = process.env.API_DIRECT || "http://localhost:18000";

  // 1 Operator / QE login
  await page.goto("/login");
  await page.fill('input[type="password"]', "demo");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible({ timeout: 30000 });

  // Ensure an open quality event exists via API
  const login = await request.post(`${api}/api/v1/auth/login`, {
    data: { email: "qe@factoryops.local", password: "demo" },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();
  const hdr = { Authorization: `Bearer ${token}` };

  let events = await (await request.get(`${api}/api/v1/quality/events`, { headers: hdr })).json();
  let eventId = (events.items || []).find((e: any) => e.status !== "CLOSED")?.id;
  if (!eventId) {
    const anoms = await (await request.get(`${api}/api/v1/anomalies`, { headers: hdr })).json();
    const a = (anoms.items || [])[0];
    expect(a, "need anomaly or open QE for golden path").toBeTruthy();
    const created = await request.post(`${api}/api/v1/anomalies/${a.id}/create-quality-event`, { headers: hdr });
    expect(created.ok()).toBeTruthy();
    eventId = (await created.json()).id;
  }

  // 2 Quality queue
  await page.goto("/quality");
  await expect(page.getByRole("heading", { name: /quality/i })).toBeVisible();

  // 3 Open event detail
  await page.goto(`/quality/${eventId}`);
  await expect(page.getByText(eventId)).toBeVisible({ timeout: 30000 });

  // Helper: advance via API with role-appropriate users
  async function loginAs(email: string) {
    const r = await request.post(`${api}/api/v1/auth/login`, {
      data: { email, password: "demo" },
    });
    return (await r.json()).token;
  }
  async function getEvent(t: string) {
    return (await request.get(`${api}/api/v1/quality/events/${eventId}`, {
      headers: { Authorization: `Bearer ${t}` },
    })).json();
  }
  async function transition(email: string, to: string, extra: Record<string, unknown> = {}) {
    const t = await loginAs(email);
    const qe = await getEvent(t);
    if (qe.status === to || qe.status === "CLOSED") return qe;
    const body = { to_status: to, expected_version: qe.version, ...extra };
    const r = await request.post(`${api}/api/v1/quality/events/${eventId}/transition`, {
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      data: body,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }

  // 4 QE validation → containment → investigation
  await transition("qe@factoryops.local", "VALIDATION");
  await transition("qe@factoryops.local", "CONTAINMENT", { containment: "Hold lot LOT-BW-220" });
  await transition("qe@factoryops.local", "INVESTIGATION");

  // 5 RCA
  const qeTok = await loginAs("qe@factoryops.local");
  const rca = await request.post(`${api}/api/v1/rca/investigate`, {
    headers: { Authorization: `Bearer ${qeTok}`, "Content-Type": "application/json" },
    data: { quality_event_id: eventId },
  });
  expect(rca.ok(), await rca.text()).toBeTruthy();
  await page.goto(`/rca/${eventId}`);
  await expect(page.getByRole("heading", { name: /rca/i })).toBeVisible({ timeout: 30000 });

  // 6 Maintenance finding
  const mt = await loginAs("mt@factoryops.local");
  const work = await (await request.get(`${api}/api/v1/work/tasks`, {
    headers: { Authorization: `Bearer ${mt}` },
  })).json();
  const task = (work.items || []).find((t: any) => t.source_event_id === eventId) || (work.items || [])[0];
  if (task) {
    const upd = await request.post(`${api}/api/v1/work/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${mt}`, "Content-Type": "application/json" },
      data: { finding: "Outer race spalling confirmed; lubricant starved", status: "Done" },
    });
    expect(upd.ok(), await upd.text()).toBeTruthy();
  }

  // 7 Disposition → CAPA → QM effectiveness → closed
  await transition("qe@factoryops.local", "DISPOSITION", { disposition: "Rework / replace bearing" });
  await transition("qe@factoryops.local", "CORRECTIVE_ACTION", {
    corrective_action: "Replace bearing; restore lubrication; verify alignment",
  });
  await transition("qm@factoryops.local", "EFFECTIVENESS_CHECK", { effectiveness: "No recurrence 14d" });
  await transition("qm@factoryops.local", "CLOSED", { effectiveness: "No recurrence 14d" });

  // 8 Knowledge steward approve + search
  const ks = await loginAs("ks@factoryops.local");
  await request.post(`${api}/api/v1/knowledge/curate`, {
    headers: { Authorization: `Bearer ${ks}`, "Content-Type": "application/json" },
    data: { quality_event_id: eventId },
  });
  const props = await request.get(`${api}/api/v1/knowledge/proposals`, {
    headers: { Authorization: `Bearer ${ks}` },
  });
  expect(props.ok()).toBeTruthy();
  const list = await props.json();
  const pending = (list.items || []).find((p: any) => p.status === "Pending Approval");
  if (pending?.id) {
    const appr = await request.post(`${api}/api/v1/knowledge/proposals/${pending.id}/approve`, {
      headers: { Authorization: `Bearer ${ks}` },
    });
    expect(appr.ok(), await appr.text()).toBeTruthy();
  }
  const search = await request.get(`${api}/api/v1/knowledge/search?q=bearing`, {
    headers: { Authorization: `Bearer ${ks}` },
  });
  expect(search.ok()).toBeTruthy();
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: /knowledge/i })).toBeVisible({ timeout: 30000 });
});
