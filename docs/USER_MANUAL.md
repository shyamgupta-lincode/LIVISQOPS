# LIVIS MES · User Manual

**Product:** LIVIS MES / QualityOps — vision-native manufacturing operations  
**Audience:** Demo users, plant leads, quality engineers, manufacturing engineers, and program owners  
**Seed plant:** Harley-Davidson York Vehicle Operations (motorcycle discrete manufacturing)  
**Routes:** App launcher at `/`; role apps under `/operate`, `/quality`, `/engineer`, `/govern`

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Getting started · login & workspaces](#2-getting-started--login--workspaces)
3. [Apps & workspaces map](#3-apps--workspaces-map)
4. [Shell & navigation](#4-shell--navigation)
5. [Engineer](#5-engineer)
6. [Operate](#6-operate)
7. [Quality & AI](#7-quality--ai)
8. [Govern](#8-govern)
9. [Context graph spine & object bindings](#9-context-graph-spine--object-bindings)
10. [Factory Twin overlays & time-travel](#10-factory-twin-overlays--time-travel)
11. [Production tabs](#11-production-tabs)
12. [Warranty and Claims](#12-warranty-and-claims)
13. [Quality Review · Defect DNA](#13-quality-review--defect-dna)
14. [AI Agents](#14-ai-agents)
15. [Guided tours · Interactive Lab](#15-guided-tours--interactive-lab)
16. [Glossary](#16-glossary)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Introduction

LIVIS MES is a **vision-native manufacturing operations system**. It connects four role-oriented apps so the plant never becomes a flat menu of unrelated screens:

| Job | App | What it owns |
|-----|-----|----------------|
| Model & deploy change | **Engineer** | Context graph, assets, work instructions, edge |
| Run the shift | **Operate** | Plan, twin, orders, warranty, station execution |
| Trust defects & models | **Quality & AI** | Review, vision fitness, bounded agents |
| Prove value & control | **Govern** | Value ledger, master data, policy & audit |

Every core workflow closes an **Evidence-to-Action Loop**: live context → visual proof → explainable recommendation → named-authority action → measured outcome.

### Who it’s for (OEM / Tier 1 / Tier 2)

The product is designed for discrete manufacturing supply chains:

- **OEM (e.g. Harley-Davidson)** — plant operations, VIN genealogy, warranty/claims, quality containment, and cross-line command.
- **Tier 1 supplier** — line-level production, component serials feeding OEM genealogy, station execution, and quality holds that propagate to OEM/WMS/ERP.
- **Tier 2 supplier** — upstream part/process quality, edge vision, and bounded agent recommendations that roll into Tier 1 / OEM context.
- **Semiconductor equipment OEM (e.g. Lam Research)** — chamber/module assembly, tool serial genealogy, fab ship quality, and containment.

Demo data is seeded **per tenant**. Sign in with a demo email (password `demo`) to load that workspace’s plant storyline — see [§2](#2-getting-started--login--workspaces). Genealogy is linked across tenants by shared serial prefixes (ABS modules, valve bodies, WSS).

---

## 2. Getting started · login & workspaces

### Sign in · `/login`

Open `http://localhost:5173/login` (unauthenticated visits to protected routes redirect here). Email **domain** selects the tenant workspace; password for all demo users is **`demo`**.

| Demo email | Tenant / plant | Seeds focus on |
|------------|----------------|----------------|
| `jordan.hale@harleydavidson.com` | **Harley-Davidson OEM** · York Vehicle Ops | Motorcycles, VIN genealogy, warranty, command center |
| `alex.reyes@meridiandynamics.com` | **Meridian Dynamics Tier 1** · Columbus Module Plant | ABS / brake control modules feeding Harley |
| `priya.shah@apexpercision.com` | **Apex Precision Tier 2** · Dayton Components | Valve bodies & wheel-speed sensors (WSS) feeding Meridian |
| `ops.lead@lamresearch.com` | **Lam Research** · Fremont Chamber Ops | Etch/deposition chamber modules, tool serials, fab ship |

**Accepted domains** (any local-part `@` these works with password `demo`):

| Tenant | Domains |
|--------|---------|
| Harley OEM | `harleydavidson.com`, `harley.livis.local`, `hd.livis.local` |
| Meridian Tier 1 | `meridiandynamics.com`, `meridian.livis.local`, `tier1.example`, `tier1.livis.local` |
| Apex Tier 2 | `apexpercision.com`, `apex.livis.local`, `tier2.example`, `tier2.livis.local` |
| Lam Research | `lamresearch.com`, `lam.livis.local`, `lam.example` |

### FactoryOps portal (Next.js · `http://localhost:18080`)

When running the FactoryOps stack (`make one-shot` / Compose on port **18080**), three **full demo tenants** are seeded. Password for all users is **`demo`**.

| Demo email | Plant | Demo storyline |
|------------|-------|----------------|
| `qe@factoryops.local` | **Midwest Hybrid Plant** (MHP1) | Discrete hybrid plant · live `bearing_wear` simulator |
| `qe.hero@heromotocorp.demo` | **Hero Dharuhera** (HMC-DHR) | 2W OEM · `crankshaft_bearing_wear` (seeded history) |
| `raj.patel@lamresearch.com` | **Lam Fremont Chamber Ops** (LR-FCO) | Semi cap-equip · live `gas_box_seal_void` stream · O-ring lot **L-LR-441** |

Additional Lam accounts: `ops.lead@lamresearch.com` (production supervisor), `qe.lam@lamresearch.com`, `k.nakamura@lamresearch.com` (process engineer), `mt.lam@lamresearch.com`, `compliance.lam@lamresearch.com`. Graph site chips: **Lam Fremont** or API `?site=lam`.

**Session:** A Bearer token is stored in `localStorage`. Use **Logout** (launcher or context ribbon) to clear the session and return to `/login`.

After login you land on the app launcher (`/`) and choose a **role app** (Operate, Quality & AI, Engineer, Govern). Inside an app, the sidebar lists only that app’s **workspaces**. Site/shift context on the top ribbon reflects the signed-in tenant’s plant. Live badges on launcher cards show where attention is needed (open P1s, defects, edge health, value saved).

Cross-tenant genealogy uses shared serial prefixes (e.g. `ABS-MD-…`, `VLV-AP-…`, `WSS-AP-…`) so parts built at Apex/Meridian can be traced into Harley VIN trees.

### First-time path

For a new site, prefer this order:

1. **Engineer** — Context Graph → Assets → Workflows (Twin Compiler) → Edge  
2. **Operate** — Command Center → Twin / Production / Station as needed  
3. **Quality & AI** — Review → Vision AI → Agents  
4. **Govern** — Proof Engine → Entities → Administration  

Or start the floating **✦ Tour** (Full storyline or Interactive Lab). See [§15](#15-guided-tours--interactive-lab).

### Run locally (reference)

- Backend: `uvicorn` on port **8000** (`/api`, `/ws/live`)  
- Frontend: Vite on port **5173** (proxies API/WebSocket)  
- Open `http://localhost:5173`

---

## 3. Apps & workspaces map

### Operate · `/operate` · blue

| Workspace | Route | Purpose |
|-----------|-------|---------|
| Command Center | `/operate` | Plan vs actual, constraint radar, actions, shift brief |
| Factory Twin | `/operate/twin` | Spatial plant + overlays + causal time-travel |
| Production | `/operate/production` | Orders, WIP · genealogy, by-context rollups |
| Warranty and Claims | `/operate/warranty` | VIN genealogy, claim reports, printable data sheet |
| Station Workspace | `/operate/station` · `/operate/station/:stationId` | Operator step execution with evidence |

### Quality & AI · `/quality` · magenta

| Workspace | Route | Purpose |
|-----------|-------|---------|
| Quality Review | `/quality` | Defect queue, Defect DNA, containment holds |
| Quality Events | `/quality/events` | First-class quality-event lifecycle board + digital thread |
| Vision AI | `/quality/vision` | Models, production fitness, deployment rings |
| AI Agents | `/quality/agents` | RCA / knowledge curation / workflow + Bounded Action Ledger |

### Engineer · `/engineer` · green

| Workspace | Route | Purpose |
|-----------|-------|---------|
| Context Graph | `/engineer/graph` | ISA-95 aligned spine + object bindings |
| Data Planes | `/engineer/data-planes` | Specialized stores behind one semantic contract |
| Event Backbone | `/engineer/backbone` | Topics, live stream, replay, lag |
| Assets | `/engineer/assets` | Hierarchy health scores |
| Predictive Maintenance | `/engineer/pdm` | Failure-mode PdM + technician ground truth |
| Workflows | `/engineer/workflows` | Work instructions + Executable Twin Compiler |
| Edge & Integrations | `/engineer/edge` | Fleet, connectors, OT write-deny for agents |

### Govern · `/govern` · amber

| Workspace | Route | Purpose |
|-----------|-------|---------|
| Proof Engine | `/govern` | Value ledger and Continuous Value Validation |
| Governed Learning | `/govern/learning` | Metrics, version registry, shadow gates |
| Entity Manager | `/govern/entities` | Governed CRUD for core records |
| Administration | `/govern/admin` | RBAC, Plant Policy as Code (incl. OT / learning), audit |

### Contextual platform golden path (Harley)

`Data Planes → Event Backbone → Quality Events → RCA agent → close event → Knowledge curation approval → Governed Learning → PdM`

---

## 4. Shell & navigation

### App launcher · `/`

- Greeting and four app cards with live badges and workspace tags.
- Keyboard: press **1–4** to enter Operate, Quality & AI, Engineer, Govern (catalog order).
- Brand logos: Lincode LIVIS + QualityOps.
- Footer shows Central connection and Shift A window (demo: `06:00–14:30`).

### Inside an app

- **Left rail:** brand (returns to launcher) · app badge · **Workspaces** · **Switch app** · **Help / Manual**.
- **Context ribbon:** breadcrumbs `Apps / {App} / {Workspace}` · **Site · Shift** (demo: `York Vehicle Ops · Shift A`) · **Plan vs Actual** · **Live Link** · **User**.
- Accent color follows the active app.

Use **Switch app** whenever your role for the next hour changes; plant context stays on the ribbon.

---

## 5. Engineer

### 5.1 Context Graph · `/engineer/graph`

**Purpose:** Compose the operational knowledge model that Factory Twin, Production, and Warranty read from.

**Library:** Cards for draft/published graphs · **Active** marker · **Open workflow →** · **+ New context graph**.

**Workflow modes** (after opening a graph):

| Mode | What you do |
|------|-------------|
| **Compose** | Edit hierarchy levels and object bindings; save draft or publish |
| **Explore** | Live cinema / radial overview of the graph; inspect values |
| **Reporting** | Rollups by context path; jump back to Explore |

**Compose wizard**

1. **Hierarchy** — levels (typically facility → area → line → station → device); required flags; entity mapping; **+ Add level**. Demo hierarchy is seeded from York Vehicle Operations.
2. **Object bindings** — select/define objects → configure bindings → property objects.
3. **Review & publish** — summary · **Save draft** · **Publish context model**.

**Common tasks**

- Publish a spine so Twin and Production share the same home levels for orders and genealogy.
- Bind objects (production order, genealogy, inspection, work instructions, …) with `report_at` (home level) and rollups.
- Use domain lenses in Explore: Production · Maintenance · Supply chain · Product quality.

Details: [§9](#9-context-graph-spine--object-bindings).

### 5.2 Assets · `/engineer/assets`

**Purpose:** Overlay health on the plant hierarchy so maintenance and OT see where money is leaking.

**Key UI**

- **Where money is leaking** — lowest composite health cards.
- **Station registry** — Avail · Quality · Perf · AI Conf · Safety.

**Common tasks**

- Filter by area; click a card/row to open that station in **Operate → Station Workspace**.

### 5.3 Workflows · `/engineer/workflows`

**Purpose:** Author work instructions and compile them into an executable twin — never silently push to the line.

**Key UI**

- **Deployed work instructions**
- **Change pipeline** — draft → review → approved → deployed (**Approve**, **Compile with Twin Compiler**)
- Station archetype templates · builder wizard (Basics → Compose → Evidence → Validate → Deploy)

**Safety note (product boundary):** Interlock writes use allowlisted contracts and two-way handshakes. Safety logic is not authored here; functional safety stays in PLCs/safety controllers.

### 5.4 Edge & Integrations · `/engineer/edge`

**Purpose:** Keep Central honest about node health, connectors, and offline queues.

**KPIs:** Nodes healthy · Queued events · Connectors · Cert expiry  

**Key UI:** Fleet overview (Mission Readiness Score, queue, lag, clock trust) · Connectors & data contracts · **Autopilot** · Node drawer (Node Passport, security posture, **Replay queued events**)

**Common tasks:** Investigate unhealthy nodes; confirm PTP/NTP trust; replay store-and-forward after reconnect.

---

## 6. Operate

### 6.1 Command Center · `/operate`

**Purpose:** Answer — *Are we on plan, where is the constraint, and who owns the next action?*

**Key UI**

- KPI strip: Actual vs Plan · OEE · FPY · Open Stops · Escapes MTD · Money Saved Today (cards with hover arrows jump to related workspaces).
- **Constraint Radar** — impact-ranked emerging losses; click a row → station workspace.
- Owned **action list** (complete with evidence).
- **AI Shift Brief** (grounded).
- **Priority queue** — unowned P1s cannot be hidden.
- Output by hour vs plan band.

**Common tasks:** Acknowledge P1 events; complete actions with evidence; start every shift here before deep-diving Twin or Station.

### 6.2 Factory Twin · `/operate/twin`

See [§10](#10-factory-twin-overlays--time-travel).

### 6.3 Production · `/operate/production`

See [§11](#11-production-tabs).

### 6.4 Warranty and Claims · `/operate/warranty`

See [§12](#12-warranty-and-claims).

### 6.5 Station Workspace · `/operate/station`

**Purpose:** Operator surface — one current step, evidence requirements, takt, abnormal recovery.

**Key UI**

- Station selector · state chip · VIN tag · takt bar  
- Step progress · **Capture evidence & commit** / **Confirm & continue**  
- Recent station inspections  
- Abnormal states (Faulted, Blocked, Quality Hold, Offline): plain-language recovery · **Acknowledge recovery steps** · **Raise Andon**

**Common tasks:** Execute the current instruction version with multimodal proof; raise Andon when blocked; supervisors coach from Twin while operators finish work here.

---

## 7. Quality & AI

### 7.1 Quality Review · `/quality`

See [§13](#13-quality-review--defect-dna).

### 7.2 Vision AI · `/quality/vision`

**Purpose:** Govern model fitness before assistive deploy.

**Key UI**

- Model registry  
- Deployment rings: **Bench → Replay → Shadow → Assisted → Canary → Production**  
- Drift triage  
- Drawer: **Production Fitness Passport** · segment scorecard · threshold economics · **Promote ring →** · **Rollback**

**Common tasks:** Block unfit production release via segment gates; promote only through rings; route drift to the right owner.

### 7.3 AI Agents · `/quality/agents`

See [§14](#14-ai-agents).

---

## 8. Govern

### 8.1 Proof Engine · `/govern`

**Purpose:** Value ledger — prove the platform is paying back with evidence, not slides.

**KPIs:** Money Saved Today · Hours Saved · Scrap Prevented · CO₂ Saved · Time to Payback · Projected Annual  

**Sections:** Value by category · by ROI workflow · daily value · **Continuous Value Validation** (Baseline → Shadow → Assisted → Autonomous)

### 8.2 Entity Manager · `/govern/entities`

**Purpose:** Governed CRUD for core records (stations, orders, users, holds, edge nodes, work instructions, models, defects, actions, …). Mutations are actor-stamped and audited.

**Common tasks:** Prefer Entity Manager over spreadsheet edits when master data drifts.

### 8.3 Administration · `/govern/admin`

**Purpose:** Identity, Plant Policy as Code, and immutable audit.

**Panels**

- **Users & roles · skill-aware authorization**
- **Plant Policy as Code** (versioned / testable)
- **Audit trail** — filter kinds (Model · Holds · Workflow · Agent · Edge · Operations)

**Common tasks:** Confirm who may approve holds or publish graphs; review `agent.action.approve` / `agent.create` after agent work.

---

## 9. Context graph spine & object bindings

The **context graph** is the platform spine. Operate Twin and Production render and roll up using the **active published** model.

### Hierarchy (typical)

`Facility → Area → Line → Station → Device`

Optional/collapsed levels flatten Twin and Production views. Demo seed: **York Vehicle Operations** with areas such as Frame & Fabrication, Paint & Finishing, Powertrain, Final Assembly, Vehicle Test.

### Object bindings

Each object type homes at a level (`report_at`) and may roll up:

| Binding (examples) | Typical home | Used by |
|--------------------|--------------|---------|
| Production order | **Line** | Production · Orders |
| VIN / component genealogy | **Station** | Production · WIP · Warranty |
| Work instructions | Station / line | Station Workspace · Workflows |
| Inspection / evidence | Station / device | Quality · Twin device modals |
| Defect / NCR | Station | Quality Review |
| Process time series | Device | Twin live tags |
| Vision / AI model | Device / station | Vision AI |
| Documents & procedures | Configurable | Explore / Reporting |

Binding pills appear on Production, Twin, and Warranty spines so you always see which objects are active for the published schema.

### Lenses & sources

- **Lenses:** Production · Maintenance · Supply chain · Product quality  
- **Source systems (concept):** Field · OT (Historian/PLC/MES/QMS) · IT (CMMS/ERP) · ET (simulation/3D/images/docs) · Robotics  

**Rule of thumb:** If Twin and Production disagree, open Context Graph → check **Published** status and binding homes before debugging the UI.

---

## 10. Factory Twin overlays & time-travel

**Route:** `/operate/twin`

### Spatial navigation

1. **CONTEXT SPINE** — level chips from the active graph + schema status (Published/Draft) + state-color legend.  
2. **All lines** grid → click a line → **station cards**.  
3. Click a station → inspector drawer · **Open station workspace →**.  
4. Device icons on cards (PLC ⊞, camera ◎, torque ⟳, scan ▥) open **Device live** (time series / vision frames, PLC tags, connectivity, recent inspections).

### Overlays (toggle)

| Overlay | Shows |
|---------|--------|
| **Live state** | Station run states (Running, Starved, Blocked, Faulted, …) |
| **Quality** | Quality-oriented metrics on cards |
| **Cycle vs takt** | Cycle performance vs line takt |
| **AI confidence** | Vision/AI confidence at station |

### Causal Time-Travel

Sidebar **⏱ Causal Time-Travel**:

- Modes: **LIVE** / **REPLAY**
- Transport: ⏮ ⏴ ▶/⏸ ⏵ ⏭ · seek slider · snapshot timeline (newest first)
- Replay surfaces OEE + units at snapshot time  
- **⏭ Return to live** when done

Use time-travel to compare plant state before/after a disruption without leaving the spatial view.

---

## 11. Production tabs

**Route:** `/operate/production`

Production follows context-graph bindings: **orders home at line**; **genealogy homes at station**. Hero KPIs: Released · Planned · Completed · WIP units. Spine bar shows levels, binding pills, and schema version/status.

### Tabs

| Tab | Label | What to do |
|-----|-------|------------|
| `orders` | **Orders** | Filter by source (All · SAP · ERP · APS · WMS · Manual); create/release WOs; open order drawer → VIN list |
| `genealogy` | **WIP · Genealogy** | Browse VIN cards with facility→…→station path; open VIN storyline, evidence, component path |
| `context` | **By context** | Facility → Area → Line rollup tree; click a line to focus Orders |

### Create work order

**+ Create work order** modal fields: Source system · External reference · Product · Variant · Color · Quantity · Line (order home) · Status · optional **Release to the line immediately**.

Demo defaults include product **Harley-Davidson Motorcycle** (variants such as Street Glide Special, Road Glide Limited, colors such as Whiskey Fire).

### VIN storyline drawer

Execution + multimodal proof timeline · component genealogy · quality history — the same evidence Station and Quality rely on.

---

## 12. Warranty and Claims

**Route:** `/operate/warranty`

**Purpose:** Look up a VIN and work genealogy, claim reports, and a printable data sheet from the same context-graph bindings as Production.

**Hero KPIs:** VINs indexed · Open defects · Active holds  

**Left rail:** VIN lookup / search  

### Tabs

| Tab | Content |
|-----|---------|
| **Genealogy** | Full VIN path chips · binding pills · station path · evidence timeline · component genealogy · devices at station |
| **Reports** | Claim reports with subtabs: **Claim events · Defect history · Inspections · Holds** |
| **Data sheet** | Printable VIN data sheet · **Print / export** — context path, order, key metrics (operations, components, evidence, defects, FPY proxy), components & serials table |

Footer on the data sheet notes genealogy home level from the active context graph.

> **Tour note:** Warranty currently has no dedicated workspace tour; use the Full storyline / Production / Quality tours, then open `/operate/warranty` with a known VIN.

---

## 13. Quality Review · Defect DNA

**Route:** `/quality` (page title: **Vision Review**; nav label: **Quality Review**)

**Purpose:** Turn vision findings into dispositions and named-authority containment.

### Modes

| Mode | Use |
|------|-----|
| **Defect queue** | Open defects; evidence + DNA; disposition or hold |
| **Borderline review** | Accept / reject / re-inspect borderline frames |
| **Containment** | Active holds that block ship; release with named authority |

### Defect drawer

1. **Evidence** — trust the frame (model overlay / capture).  
2. **Defect DNA · similar events** — similarity search (including cross-plant style matches in the seeded model).  
3. **Disposition · reason code required** — RC-01…RC-06 (e.g. Confirmed defect, False positive, Borderline within spec, Lighting artifact, Repairable, Escalate to process eng).  
4. Actions: **Accept · Accept w/ deviation · Repair · Reject · Re-inspect · Escalate**.  
5. **Smart containment radius** → **Apply containment hold…** → **Confirm hold** (propagates with WMS/ERP/QMS tags on hold cards).

**Containment:** **Release hold (named authority)** — never anonymous.

---

## 14. AI Agents

**Route:** `/quality/agents`  
**Title:** AI Agent Workspace  

**Principle:** Agents recommend; humans authorize. Agents never silently control production.

### Named authority

Enter the acting user (demo default **Jordan Hale**) before **Approve** / **Reject**. Required for ledger decisions.

### Bounded Action Ledger

Filters: All · Pending · Approved · Auto · Rejected  

Each card shows confidence, blast radius, reversibility, and evidence links.

### Agent catalog & autonomy

| Level | Meaning (catalog) | Example tools |
|-------|-------------------|---------------|
| **L0 · Retrieve** | Search / read | `search_events`, `read_genealogy` |
| **L1 · Recommend** | Rank / suggest | + `rank_losses` |
| **L2 · Draft** | Draft artifacts | + `draft_artifact` |
| **L3 · Execute with approval** | Propose executions needing approval | `draft_hold`, `apply_hold(approved)`, … |
| **L4 · Bounded automation** | Narrow auto actions inside policy | `trigger_recapture`, `open_review_task` |

### Add AI agent

**+ Add AI agent** modal:

- Name · Version · Autonomy level · Created by · Description  
- **Prompt** — instruction text for the agent  
- **Data source topics** — topics derived from context-graph object bindings (API: `/api/agent-data-source-topics`)  
- **Permitted tools** — defaults follow autonomy level  

### Trust controls

Grounding · Evidence · Confidence · Permission · Audit  

**Excluded by policy:** unbounded autonomous control, safety decisions, releasing quality holds without authority.

---

## 15. Guided tours · Interactive Lab

Floating control: **✦ Tour** (bottom of the UI).

### Modes

| Mode | What it is |
|------|------------|
| **Full storyline** | End-to-end narrative: Access → Configure → Run the day → Assure quality → Govern |
| **Interactive lab** | Hands-on: batch tag → create WO → By context / Twin → add agent → wrap at Command Center |
| **Workspace tour** | Focused tour for the current (or chosen) workspace |

First visit may show an intro chooser (Full storyline · Interactive lab · this workspace · Not now · Browse all tours). Progress persists in `localStorage` (`livis.tour.v1`).

### Controls

- Spotlight coach cards · **Skip** / **Back** / **Next** / **Finish**  
- Keys: **← → Enter** navigate · **Esc** end (Lab: complete the highlighted form to advance)

### Interactive Lab beats (summary)

1. Enter a **batch tag / external ref** (4–12 chars).  
2. Submit prefilled **Create work order** (Harley demo product on Touring Assembly).  
3. Trace via **By context** and **Factory Twin**.  
4. **Add AI agent** at L1 · Recommend.  
5. Wrap at Command Center.

### Workspace tours available

Context Graph · Assets · Workflows · Edge · Command Center · Factory Twin · Production · Station · Quality Review · Vision AI · Agents · Proof Engine · Entities · Administration  

*(Warranty is not yet in the workspace-tour catalog.)*

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **App** | Role-oriented entry (Operate, Quality & AI, Engineer, Govern) |
| **Workspace** | A page/route inside an app |
| **Context graph / spine** | Published hierarchy + object bindings that Twin/Production/Warranty read |
| **Object binding** | Where a data object homes (`report_at`) and how it rolls up |
| **VIN storyline** | Full execution + multimodal proof timeline for a unit |
| **Defect DNA** | Similarity search over historical defect evidence |
| **Production Fitness Passport** | Vision model fitness record gating production rings |
| **Bounded Action Ledger** | Agent proposals with evidence, blast radius, approval, outcome |
| **Autonomy L0–L4** | Retrieve → Recommend → Draft → Execute with approval → Bounded automation |
| **Named authority** | Explicit human actor required for holds/agent approvals |
| **Causal Time-Travel** | Replay past Twin snapshots vs live plant state |
| **Twin Compiler** | Compiles work instructions into guidance, state machine, evidence schema, handshake tests |
| **Mission Readiness Score** | Edge node readiness (health, queue, clock trust, …) |
| **CVV** | Continuous Value Validation lifecycle in Proof Engine |
| **Andon** | Operator escalation from Station Workspace |
| **Central** | Control-plane API + live WebSocket (`/ws/live`) |
| **OEM / Tier 1 / Tier 2 / Lam** | Supply-chain roles selected at login by email domain (Harley / Meridian / Apex / Lam Research) |

---

## 17. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Launcher badges empty / stale | Backend running on `:8000`; Vite proxy; browser network to `/api/...` |
| **Live Link · Reconnecting…** | WebSocket `/ws/live`; firewall; restart backend simulator |
| Twin empty or wrong hierarchy | Engineer → Context Graph: is a graph **Published** and **Active**? Binding homes match expectations? |
| Production orders not grouping by line | Binding: production order should `report_at` **line**; check spine pills on Production |
| Genealogy missing for a VIN | Binding home at **station**; open WIP · Genealogy or Warranty with that VIN |
| Cannot approve agent action | Fill **Named authority**; confirm ledger item is Pending; check Admin policy/audit |
| Cannot release quality hold | Use Containment tab with named authority; confirm you are not trying to bypass via agent L4 |
| Edge “queued events” growing | Node offline/degraded; open node drawer → **Replay**; check clock trust / MRS |
| Tour stuck on a step | Esc to end; clear `localStorage` key `livis.tour.v1` if intro/lab state is corrupted; Lab requires completing highlighted forms |
| Auth / wrong tenant data | Confirm email domain maps to the intended tenant (§2); password is `demo`; logout and re-login to switch; clear Bearer token in `localStorage` if session is stuck |
| Page not found | Unknown routes redirect to `/`; use Switch app or launcher |

### Product boundaries (by design)

- Functional safety and sub-second machine control stay in PLCs/safety controllers.  
- Operator-monitoring vision is process confirmation — no biometric identity or emotion inference.  
- Production events are append-only; edge continues last approved config offline and replays on reconnect.  
- Agents never silently control production.

---

## Quick route cheat sheet

| Go to… | Path |
|--------|------|
| Login | `/login` |
| Launcher | `/` |
| Command Center | `/operate` |
| Factory Twin | `/operate/twin` |
| Production | `/operate/production` |
| Warranty | `/operate/warranty` |
| Station | `/operate/station` |
| Quality Review | `/quality` |
| Vision AI | `/quality/vision` |
| AI Agents | `/quality/agents` |
| Context Graph | `/engineer/graph` |
| Assets | `/engineer/assets` |
| Workflows | `/engineer/workflows` |
| Edge | `/engineer/edge` |
| Proof Engine | `/govern` |
| Entities | `/govern/entities` |
| Administration | `/govern/admin` |

---

## 18. Test cases & workflows

For complex test cases, end-to-end UAT storylines, negative cases, and a demo acceptance matrix, see **[TEST_CASES_AND_WORKFLOWS.md](./TEST_CASES_AND_WORKFLOWS.md)**.

---

*Manual reflects the product as implemented in this repository (apps, routes, auth/multi-tenant login, and UI labels).*
