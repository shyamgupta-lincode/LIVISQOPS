# LIVIS MES · User Manual Addendum — Test Cases & Workflows

**Product:** LIVIS MES / QualityOps v1.1  
**Companion to:** [USER_MANUAL.md](./USER_MANUAL.md)  
**Audience:** Demo facilitators, QA, plant leads, quality engineers, manufacturing engineers, IT/admins  
**Environment:** Local demo (`frontend` :5173 · `backend` :8000) with seeded multi-tenant data  

---

## How to use this document

| Section | Use when |
|---------|----------|
| [A · Condensed user guide](#a--condensed-user-guide) | Onboarding someone new to the four apps |
| [B · Test conventions](#b--test-conventions) | Writing or executing any case |
| [C · Role test suites](#c--role-test-suites) | Persona-scoped regression |
| [D · End-to-end workflows](#d--end-to-end-workflows) | Demo / UAT storylines that cross apps |
| [E · Negative & edge cases](#e--negative--edge-cases) | Boundary and failure behavior |
| [F · Acceptance matrix](#f--acceptance-matrix) | Go / no-go for a release or demo |

**Pass rule:** A case passes only when *all* expected results in that case are observed. Mark **Blocked** if Central (`:8000`) or Live Link is down.

**Demo credentials (password always `demo`):**

| Email | Tenant | Typical persona |
|-------|--------|-----------------|
| `jordan.hale@harleydavidson.com` | Harley OEM · York | Plant Manager |
| `t.brennan@harleydavidson.com` | Harley OEM | Area Manager |
| `alex.reyes@meridiandynamics.com` | Meridian Tier 1 | Plant Manager |
| `sam.okonkwo@meridiandynamics.com` | Meridian Tier 1 | Quality Lead |
| `priya.shah@apexpercision.com` | Apex Tier 2 | Plant Manager |
| `marcus.lee@apexpercision.com` | Apex Tier 2 | Process Engineer |
| `ops.lead@lamresearch.com` | Lam Research | Ops Lead |
| `raj.patel@lamresearch.com` | Lam Research | Quality Lead |

---

## A · Condensed user guide

### Product model

LIVIS closes an **Evidence-to-Action Loop** on every critical path:

`live context → visual proof → explainable recommendation → named-authority action → measured outcome`

Four role apps share one plant context (site · shift · live link):

| App | Job | Primary routes |
|-----|-----|----------------|
| **Operate** | Run the shift | `/operate`, `/operate/twin`, `/operate/production`, `/operate/warranty`, `/operate/station` |
| **Quality & AI** | Trust defects & models | `/quality`, `/quality/vision`, `/quality/agents` |
| **Engineer** | Model & deploy change | `/engineer/graph`, `/engineer/assets`, `/engineer/workflows`, `/engineer/edge` |
| **Govern** | Prove value & control | `/govern`, `/govern/entities`, `/govern/admin` |

### First-time path (new site)

1. **Engineer** — Context Graph (publish) → Assets → Workflows (Twin Compiler) → Edge  
2. **Operate** — Command Center → Twin / Production / Station  
3. **Quality & AI** — Review → Vision AI → Agents  
4. **Govern** — Proof Engine → Entities → Administration  

Or run **✦ Tour → Full storyline** / **Interactive Lab**.

### Shell cues

- Launcher keys **1–4** enter apps in catalog order.  
- Context ribbon: `Apps / {App} / {Workspace}` · Tenant · Site · Shift · Plan vs Actual · Live Link · User · Log out.  
- Sidebar: workspaces for the current app only + **Switch app**.

### Critical governance rules

- Quality holds and agent ledger decisions require **named authority** (never anonymous).  
- Vision models promote through rings: Bench → Replay → Shadow → Assisted → Canary → Production.  
- Agents never silently control production; blast radius and audit must be visible.  
- Functional safety stays in PLCs — MES only exchanges allowlisted handshakes.

For full UI field lists, see the main [USER_MANUAL.md](./USER_MANUAL.md).

---

## B · Test conventions

### Severity

| Sev | Meaning |
|-----|---------|
| **S0** | Demo/showstopper — plant storyline cannot complete |
| **S1** | Core workflow broken — data integrity or governance bypass |
| **S2** | Important feature degraded — workaround exists |
| **S3** | Cosmetic / copy / tour polish |

### Priority for execution

| P | When to run |
|---|-------------|
| **P0** | Every demo dry-run and every build smoke |
| **P1** | Full UAT / weekly regression |
| **P2** | Deep dive / release candidate |

### Evidence to capture

For each executed case, record: tenant email · UTC time · route · screenshot or note of Live Link state · actor name used for named authority · pass/fail.

### Preconditions (global)

- Backend healthy: `GET /api/health` (or OpenAPI at `:8000/docs`).  
- Frontend open at `http://localhost:5173`.  
- Fresh login preferred when switching tenants (domain selects seed data).

---

## C · Role test suites

### C1 · Authentication & tenancy (P0)

#### TC-AUTH-01 · Domain → tenant resolution  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/login` unauthenticated | Login form; protected routes redirect here |
| 2 | Sign in as `jordan.hale@harleydavidson.com` / `demo` | Lands on launcher `/`; Harley / York context on ribbon after entering an app |
| 3 | Log out; sign in as `alex.reyes@meridiandynamics.com` / `demo` | Meridian / Columbus seed data (ABS modules), not Harley VINs as primary storyline |
| 4 | Sign in as `priya.shah@apexpercision.com` / `demo` | Apex / Dayton seed (valves / WSS) |
| 5 | Sign in as `ops.lead@lamresearch.com` / `demo` | Lam / Fremont chamber ops seed |

#### TC-AUTH-02 · Invalid / edge login  
**Severity:** S1 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Submit empty email/password | Validation blocks; no token |
| 2 | Use unknown domain (e.g. `user@notatenant.example`) with `demo` | Login rejected / domain unresolved |
| 3 | Use accepted domain with wrong password | Auth fails; no session |
| 4 | Use `operator@harleydavidson.com` / `demo` | Session as Demo Operator for Harley domain |
| 5 | Hard-refresh mid-session | Session persists via `livis_token` until logout |

#### TC-AUTH-03 · Launcher live badges  
**Severity:** S2 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Login Harley · observe launcher cards | Operate shows P1/OEE-style badges; Quality defect/FPY; Engineer edge; Govern value |
| 2 | Press keys `1`–`4` | Enter Operate → Quality → Engineer → Govern in order |
| 3 | From inside Operate, use **Switch app** → Quality | Quality workspaces in sidebar; ribbon app label updates |

---

### C2 · Operate suite

#### TC-OPS-01 · Command Center shift start (P0)  
**Severity:** S0 · **Priority:** P0 · **Persona:** Plant / Area Manager  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/operate` | KPI strip: Actual vs Plan, OEE, FPY, Open Stops, Escapes, Money Saved |
| 2 | Inspect Constraint Radar | Impact-ranked rows; click opens related station path |
| 3 | Open Priority queue | Unowned P1s remain visible (cannot be hidden) |
| 4 | Open AI Shift Brief | Grounded brief with evidence references |
| 5 | Complete an owned action with evidence | Action leaves open list; audit/ops trail consistent |
| 6 | Confirm Live Link | Shows connected (not stuck on Reconnecting) |

#### TC-OPS-02 · Factory Twin overlays + Causal Time-Travel (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/operate/twin` | Context spine levels + Published/Draft status; line grid |
| 2 | Toggle overlays: Live state, Quality, Cycle vs takt, AI confidence | Cards update without navigation loss |
| 3 | Drill line → station → open inspector | Drawer with station detail; **Open station workspace** works |
| 4 | Open a device icon (PLC / camera / torque / scan) | Device live panel (tags / frames / connectivity) |
| 5 | Enter Causal Time-Travel **REPLAY** | Transport controls work; snapshot OEE/units shown |
| 6 | Seek across timeline; return **LIVE** | Live state resumes; Live Link healthy |

#### TC-OPS-03 · Production create → release → genealogy (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/operate/production` · Orders tab | Filters for SAP/ERP/APS/WMS/Manual |
| 2 | **+ Create work order**: Source Manual, unique External ref, product/variant/color, qty ≥1, line, **Release** checked | Order appears; status reflects release |
| 3 | Open order drawer | VIN / unit list for the batch |
| 4 | Switch **WIP · Genealogy** | New units visible with facility→…→station path |
| 5 | Open a VIN storyline | Execution + multimodal proof + component tree |
| 6 | **By context** → click the order’s line | Orders focus to that line; binding pills match published graph |

#### TC-OPS-04 · Station execution + Andon (P0)  
**Severity:** S0 · **Priority:** P0 · **Persona:** Operator / Supervisor  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/operate/station` (or deep link from Twin) | Station selector, state chip, VIN, takt bar |
| 2 | Complete current step via **Capture evidence & commit** / **Confirm & continue** | Step advances; evidence appears in recent inspections |
| 3 | If station Faulted/Blocked/Hold/Offline | Plain-language recovery shown |
| 4 | **Raise Andon** | Toast / escalation acknowledgment to team leader |
| 5 | **Acknowledge recovery steps** when available | Recovery state progresses |

#### TC-OPS-05 · Warranty VIN data sheet (P1)  
**Severity:** S1 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/operate/warranty` · search known VIN from Production | Genealogy tab: path chips, evidence, components |
| 2 | Reports tab | Claim events · Defect history · Inspections · Holds subtabs populate |
| 3 | Data sheet · **Print / export** | Printable sheet with metrics and serials table |

---

### C3 · Quality & AI suite

#### TC-QAI-01 · Defect DNA disposition with reason code (P0)  
**Severity:** S0 · **Priority:** P0 · **Persona:** Quality Lead  

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/quality` · Defect queue | Open defects listed |
| 2 | Open a defect drawer | Evidence frame + Defect DNA similar events |
| 3 | Attempt disposition without reason code | Blocked / incomplete until RC selected |
| 4 | Select RC-01…RC-06 and disposition (Accept / Repair / Reject / …) | Defect status updates; reason retained |
| 5 | Cross-check VIN in Production or Warranty | Quality history reflects disposition |

#### TC-QAI-02 · Containment hold apply & release (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | From defect · **Apply containment hold** with reason/scope | Hold created; WMS/ERP/QMS propagation tags visible |
| 2 | Containment mode shows active holds | Hold blocks ship narrative in UI |
| 3 | Attempt release without named authority | Rejected / incomplete |
| 4 | Release with named authority (e.g. Jordan Hale) | Hold released; actor stamped |
| 5 | Admin → Audit | Hold apply/release events filterable |

#### TC-QAI-03 · Vision model ring promotion & rollback (P1)  
**Severity:** S1 · **Priority:** P1 · **Persona:** ML / Vision engineer  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/quality/vision` · open a model | Production Fitness Passport + segment scorecard |
| 2 | Note current ring | One of Bench→…→Production |
| 3 | **Promote ring →** when fitness allows | Ring advances one step; unfit segments block Production release |
| 4 | **Rollback** | Returns to prior ring; drift triage ownership visible |
| 5 | Confirm Station / inspections still reference approved config | No silent jump to Production without passport gate |

#### TC-QAI-04 · Bounded Action Ledger approve/reject (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/quality/agents` · filter Pending | Cards show confidence, blast radius, reversibility, evidence |
| 2 | Approve without named authority | Blocked |
| 3 | Enter named authority · Approve | Status Approved; outcome tracking available |
| 4 | Reject another pending item with reason | Status Rejected; reason retained |
| 5 | Admin audit | `agent.action.approve` / reject events present |

#### TC-QAI-05 · Add AI agent at L1 (P1)  
**Severity:** S2 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | **+ Add AI agent**: name, version, autonomy L1, prompt, topics, tools | Agent appears under L1 · Recommend |
| 2 | Confirm tools match autonomy defaults | No L4-only tools silently granted |
| 3 | Filter catalog by autonomy | New agent listed correctly |

---

### C4 · Engineer suite

#### TC-ENG-01 · Context Graph publish drives Twin/Production (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/engineer/graph` · open active graph | Compose / Explore / Reporting modes |
| 2 | Compose: verify Facility→Area→Line→Station→Device | Required flags sensible |
| 3 | Object bindings: production order @ line; genealogy @ station | Binding pills match |
| 4 | Publish context model | Status Published · Active |
| 5 | Open Twin and Production | Spine levels + schema version match published model |
| 6 | Save draft of a change without publish | Twin continues on last published until publish |

#### TC-ENG-02 · Assets leak → Station deep link (P1)  
**Severity:** S2 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/engineer/assets` | “Where money is leaking” cards + station registry scores |
| 2 | Open lowest-health station | Navigates to Station Workspace for that station |

#### TC-ENG-03 · Work instruction Twin Compiler pipeline (P0)  
**Severity:** S0 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/engineer/workflows` · open change pipeline | Draft → review → approved → deployed visible |
| 2 | Start wizard: Basics (name ≥3 chars, station) | Validation enforces name length |
| 3 | Compose ≥1 step → Evidence handshake → Validate all checks | Validate fails if checks incomplete |
| 4 | Approve with named authority · Compile with Twin Compiler | Artifacts: guidance, state machine, evidence schema, PLC tests |
| 5 | Deploy | Station Workspace can execute new WI version |
| 6 | Confirm safety boundary messaging | No claim of authoring functional safety in MES |

#### TC-ENG-04 · Edge MRS, offline queue, replay (P1)  
**Severity:** S1 · **Priority:** P1 · **Persona:** OT / Edge  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/engineer/edge` | KPIs: healthy nodes, queued events, connectors, cert expiry |
| 2 | Open degraded / queued node | Node Passport, MRS, clock trust, security posture |
| 3 | **Replay queued events** | Queue drains; causal recovery report available |
| 4 | Autopilot / connectors | Semantic mapping view without breaking live plant |

---

### C5 · Govern suite

#### TC-GOV-01 · Proof Engine value ledger (P1)  
**Severity:** S2 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/govern` | Money saved, hours, scrap, CO₂, payback, projected annual |
| 2 | Value by category / ROI workflow | Charts/sections populate |
| 3 | CVV stages Baseline→…→Autonomous | Lifecycle stages visible and ordered |

#### TC-GOV-02 · Entity Manager CRUD + audit (P0)  
**Severity:** S1 · **Priority:** P0  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/govern/entities` · pick Stations (or Orders) | Schema-driven list |
| 2 | Create entity with required fields | Record appears; actor stamped |
| 3 | Edit · save | Changes reflected in Operate/Quality consumers as applicable |
| 4 | Delete (if allowed) | Removed; audit records mutation |
| 5 | Repeat for Users, Holds, Edge Nodes, WIs, Models, Defects, Actions (smoke) | No unhandled UI crash |

#### TC-GOV-03 · Plant Policy as Code & RBAC view (P1)  
**Severity:** S1 · **Priority:** P1  

| Step | Action | Expected |
|------|--------|----------|
| 1 | `/govern/admin` · Users & roles | Roles/skills listed (plant-manager, quality, ot-engineer, …) |
| 2 | Plant Policy as Code | Evidence retention, privacy, control-write, model gates, offline behavior |
| 3 | Audit filters: Model · Holds · Workflow · Agent · Edge · Operations | Filters narrow trail correctly |

---

## D · End-to-end workflows

These are **complex user workflows** for UAT and live demos. Execute in order unless noted.

### E2E-01 · Evidence-to-Action Loop (Harley OEM) — P0 / S0

**Goal:** Prove the product thesis in one shift narrative.  
**Actor:** `jordan.hale@harleydavidson.com`  

| Phase | Where | User actions | Exit criteria |
|-------|-------|--------------|---------------|
| 1 Access | `/login` → `/` | Login; open Operate via key `1` | Ribbon shows York · Shift; Live Link up |
| 2 Orient | Command Center | Read Constraint Radar + Shift Brief; note top P1 | P1 owned or acknowledged |
| 3 See | Factory Twin | Overlay Quality; drill to constraint station; optional REPLAY | Station inspector matches radar |
| 4 Prove | Station Workspace | Capture evidence on current step | Evidence in recent inspections |
| 5 Decide | Quality Review | Defect DNA → disposition + RC; optional hold | Disposition recorded |
| 6 Act | AI Agents | Approve/reject pending ledger item with named authority | Ledger status changed |
| 7 Measure | Proof Engine | Confirm value / CVV movement narrative | Value KPIs non-empty |
| 8 Audit | Administration | Filter Agent + Holds + Operations | Actor-stamped events exist |

**Fail if:** Any phase skips named authority where required, or Live Link dies mid-loop without recovery.

---

### E2E-02 · Engineer change → Operate execute → Quality verify — P0 / S0

**Goal:** Safe change pipeline from graph/WI to line execution.  
**Actors:** Process/MFG engineer then supervisor  

| # | App | Steps | Expected chain |
|---|-----|-------|----------------|
| 1 | Engineer · Graph | Confirm published spine; note schema version | Version known |
| 2 | Engineer · Workflows | Approve + compile + deploy WI for a station | Deployed WI version increments |
| 3 | Engineer · Edge | Confirm target station node MRS healthy | Node ready |
| 4 | Operate · Station | Execute new steps with evidence | Operator sees new guidance |
| 5 | Quality · Vision | Confirm model ring still Production-fit for station cameras | No unfit Production gate breach |
| 6 | Quality · Review | Disposition any new findings from the change | RC + disposition present |
| 7 | Govern · Audit | Workflow + Operations + Model filters | Compile/deploy + execution events |

---

### E2E-03 · Cross-tenant genealogy (Apex → Meridian → Harley) — P1 / S1

**Goal:** Supply-chain serial prefixes resolve across tenants.  
**Serial cues:** `VLV-AP-…` / `WSS-AP-…` (Apex) · `ABS-MD-…` (Meridian) · Harley VIN trees  

| # | Tenant login | Action | Expected |
|---|--------------|--------|----------|
| 1 | Apex `priya.shah@…` | Production / genealogy: locate valve or WSS serial | Serial exists in Apex WIP |
| 2 | Meridian `alex.reyes@…` | Genealogy / orders: ABS module referencing upstream serials | ABS tree includes Apex-style prefixes where seeded |
| 3 | Harley `jordan.hale@…` | Warranty or Production VIN storyline | Component genealogy shows ABS/VLV/WSS prefixes |
| 4 | Harley Quality | Defect DNA on related station | Similar events may surface cross-plant style matches |

**Fail if:** Switching tenant shows previous tenant’s primary plant as if it were current (session bleed).

---

### E2E-04 · Containment blast radius & ERP/WMS/QMS tags — P0 / S0

**Goal:** Hold is governable and visibly propagates.  

| # | Step | Expected |
|---|------|----------|
| 1 | Quality · open critical defect · Apply hold with broad smart radius | Hold card shows downstream WMS/ERP/QMS tags |
| 2 | Operate · Production / Twin for affected line/station | Quality Hold state or hold visibility on unit/station |
| 3 | Warranty · Reports · Holds for affected VIN | Hold appears in claim/hold history |
| 4 | Attempt agent L4-style auto-release without authority (if proposed) | Cannot silently release; requires named authority |
| 5 | Release hold with named authority | Cleared across Containment tab + audit |

---

### E2E-05 · Vision fitness gate prevents bad promote — P1 / S1

| # | Step | Expected |
|---|------|----------|
| 1 | Vision AI · select model with weak segment scores | Passport shows failing segment(s) |
| 2 | Attempt promote toward Production | Gate blocks unfit Production release |
| 3 | Improve / use a fit model path (or promote only allowed rings) | Only legal ring transitions succeed |
| 4 | Rollback from a higher ring | Prior ring restored; Station does not keep illegal assistive behavior |

---

### E2E-06 · Edge disconnect → store-and-forward → causal recovery — P1 / S1

| # | Step | Expected |
|---|------|----------|
| 1 | Edge fleet · identify node with queue / lag | MRS reflects degradation |
| 2 | Confirm offline policy narrative (Admin Plant Policy · Offline behavior) | Policy text consistent with Edge behavior |
| 3 | Replay queued events | Queue reduces; recovery report explains ordering |
| 4 | Operate Twin LIVE | Plant view reconciles without duplicate-looking catastrophic desync in demo |

---

### E2E-07 · Interactive Lab full completion — P0 / S2

| # | Step | Expected |
|---|------|----------|
| 1 | ✦ Tour → Interactive Lab | Batch tag prompt (4–12 chars) |
| 2 | Create WO with prefilled Touring Assembly + Release | Order created; Next unlocks |
| 3 | Trace By context + Twin | Lab advances on correct screens |
| 4 | Add AI agent L1 | Agent created |
| 5 | Wrap at Command Center | Lab finishes; progress in `livis.tour.v1` |

---

### E2E-08 · Lam semiconductor storyline smoke — P2 / S2

| # | Step | Expected |
|---|------|----------|
| 1 | Login `ops.lead@lamresearch.com` | Fremont Chamber Ops context |
| 2 | Command Center + Twin | Chamber/module stations, not Harley motorcycle labels as primary |
| 3 | Production / genealogy | Tool serial style units |
| 4 | Quality + Govern Proof | Tenant-scoped defects/value (no Harley VIN as default) |

---

### E2E-09 · Multi-persona shift handoff — P1 / S1

Simulate three people on one plant without sharing a browser profile ideally (or logout between):

| Order | Persona | Focus checklist |
|-------|---------|-----------------|
| 1 | Plant Manager (`jordan.hale`) | Command Center P1 ownership; Proof Engine glance |
| 2 | Quality (`use quality-domain user or same tenant quality lead`) | Dispositions + holds |
| 3 | Area Manager (`t.brennan`) | Twin constraint + Station coaching |
| 4 | Back to Plant Manager | Audit + value: actions attributed correctly |

**Expected:** No anonymous sensitive actions; ribbon user label matches actor.

---

### E2E-10 · Copilot + Manual discoverability — P2 / S3

| # | Step | Expected |
|---|------|----------|
| 1 | Open Universal Copilot | Can surface docs / structured answers |
| 2 | Reach USER_MANUAL / Copilot guide via catalog or static `/docs/` | Manual readable |
| 3 | Run a workspace tour from current page | Spotlight coach completes without trapping Esc |

---

## E · Negative & edge cases

| ID | Scenario | Expected |
|----|----------|----------|
| NEG-01 | Navigate to `/operate/does-not-exist` | Redirect to `/` |
| NEG-02 | Call API without Bearer after logout | 401; UI forces login |
| NEG-03 | Approve agent with blank authority | UI blocks |
| NEG-04 | Disposition without RC | UI blocks |
| NEG-05 | WI name &lt; 3 characters | Basics step validation fails |
| NEG-06 | WI Validate with zero steps | Cannot deploy |
| NEG-07 | Twin REPLAY then hard navigate away and back | App stable; prefer LIVE on return or explicit mode |
| NEG-08 | Rapid tenant switch (logout/login ×3) | Correct seed each time; no mixed KPIs |
| NEG-09 | Create WO qty 0 or empty required fields | Validation prevents create |
| NEG-10 | Kill backend mid-session | Live Link → Reconnecting; no silent false “healthy plant” forever |
| NEG-11 | Clear `localStorage` tour key mid-tour | Tour recoverable via Esc / restart |
| NEG-12 | Entity delete referenced in open WO (if allowed) | Graceful error or constrained delete — no white screen |

---

## F · Acceptance matrix

Use before a customer demo or release candidate.

| Capability | Must-pass cases | Owner sign-off |
|------------|-----------------|----------------|
| Auth & multi-tenant isolation | TC-AUTH-01, TC-AUTH-02, E2E-03, E2E-08 | |
| Operate shift loop | TC-OPS-01…04, E2E-01 | |
| Quality governance | TC-QAI-01, TC-QAI-02, TC-QAI-04, E2E-04 | |
| Vision fitness | TC-QAI-03, E2E-05 | |
| Engineer publish & WI | TC-ENG-01, TC-ENG-03, E2E-02 | |
| Edge resilience | TC-ENG-04, E2E-06 | |
| Govern / audit | TC-GOV-02, TC-GOV-03, E2E-01 phase 8 | |
| Guided learning | E2E-07 | |
| Boundaries | NEG-03, NEG-04, safety messaging in TC-ENG-03 | |

**Demo go criteria:** All P0 cases Pass; no open S0; Live Link stable for ≥10 minutes during dry-run.

---

## G · Suggested test data cheat sheet (Harley)

| Need | Where to get it |
|------|-----------------|
| Demo password | `demo` |
| Plant manager | `jordan.hale@harleydavidson.com` |
| Named authority string | `Jordan Hale` (or on-screen user display name) |
| WO product defaults | Harley-Davidson Motorcycle · Street Glide / Road Glide variants |
| Reason codes | RC-01 Confirmed defect · RC-02 False positive · RC-03 Borderline · RC-04 Lighting · RC-05 Repairable · RC-06 Escalate |
| Disposition set | Accept · Accept w/ deviation · Repair · Reject · Re-inspect · Escalate |
| Autonomy ladder | L0 Retrieve → L1 Recommend → L2 Draft → L3 Execute w/ approval → L4 Bounded automation |
| Tour storage key | `livis.tour.v1` |
| Auth token key | `livis_token` |

---

## H · Traceability to product planes

| Plane | Primary test coverage |
|-------|----------------------|
| Experience | AUTH, OPS shell, tours, NEG routing |
| Execution / Context | ENG-01, OPS-02/03, E2E-02 |
| Vision | QAI-03, E2E-05 |
| Agents | QAI-04/05, E2E-01 phase 6 |
| Edge | ENG-04, E2E-06 |
| Governance | GOV-*, QAI-02, named authority NEGs |

---

*Cases reflect the in-repo demo (in-memory store + simulator). External SAP/PLC/QMS connectors are simulated — assert UI contracts and auditability, not live plant I/O.*
