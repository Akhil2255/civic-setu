# Civil Setu — AI-Powered Civic Infrastructure Management Platform

**Tagline:** *Connecting Citizens. Empowering Departments. Building a Better India.*

Civil Setu is a full-stack civic infrastructure complaint management, automated departmental routing, and **Road Passport** asset accountability platform designed for scalable deployment across India, starting with an illustrative **Kerala** pilot dataset.

## Key Capabilities

- **Five Separated Login Portals**:
  1. **Company Administrator**: Master platform governance (provision official accounts, create municipalities, assign department jurisdictions & SLAs, manage issue categories, inspect audit logs).
  2. **Civilian Portal**: Submit geo-tagged complaints with photo/video upload, voice input, interactive map pin picker, 10-step status tracking, notifications, and repair verification (confirm close or reopen).
  3. **Government Administrator (State & District)**: Statewide and district-level dashboards, hotspot maps, department comparisons, overdue monitoring, AI executive briefings, and CSV report exports.
  4. **Municipality Administrator**: Jurisdiction-scoped monitoring of all participating departments, SLA delay tracking, and complaint escalation (strictly prevented from altering or closing department repair records).
  5. **Department & Field Officer Portal**: Accept/reject auto-routed complaints, assign field officers, log site inspections, upload before/after repair photographs, and update linked Road Passports.
- **Automatic AI-Powered Complaint Routing**:
  - Uses `@google/genai` (`gemini-4-hydrogen`) on the server to analyze complaint descriptions and uploaded images, estimate severity, and suggest issue categories.
  - Pairs AI classification with configurable jurisdictional asset ownership rules and Haversine duplicate proximity detection.
  - Routes low-confidence or unmapped complaints into a **Manual Review Queue** for human verification.
- **ROAD PASSPORT Innovation**:
  - Links road excavation and repair complaints to GPS-indexed digital asset passports.
  - Detects repeat road digging corridors, flags overdue restorations, and runs Gemini before-and-after photo comparisons.

## Illustrative Hackathon Demo Accounts

> **Disclaimer:** All accounts and records below are **mock demonstration data** for Kerala (Ernakulam, Thiruvananthapuram, Kozhikode) and are **not** official government accounts.

Password for all demo accounts: `DemoPass#2026`

| Portal | Role | Email | Scope |
| :--- | :--- | :--- | :--- |
| Civilian Portal | Citizen | `ananya.citizen@pwdconnect.demo` | Mulanthuruthy (has `PWD-2026-00125`) |
| Civilian Portal | Citizen | `vikram.citizen@pwdconnect.demo` | Kochi Corporation |
| Department & Field | PWD Dept Admin | `dept.pwd.mlt@pwdconnect.demo` | PWD — Mulanthuruthy |
| Department & Field | Field Officer | `officer.rajesh@pwdconnect.demo` | PWD Field Engineer (Mulanthuruthy) |
| Department & Field | Electricity Dept Admin | `dept.elec.mlt@pwdconnect.demo` | Electricity — Mulanthuruthy |
| Department & Field | Water Authority Admin | `dept.water.kochi@pwdconnect.demo` | Water Authority — Kochi |
| Municipality Admin | Municipality Admin | `muni.mulanthuruthy@pwdconnect.demo` | Mulanthuruthy Jurisdiction |
| Municipality Admin | Corporation Admin | `muni.kochi@pwdconnect.demo` | Kochi Corporation Jurisdiction |
| Government Admin | State Admin | `state.kerala@pwdconnect.demo` | Kerala Statewide Oversight |
| Government Admin | District Admin | `district.ernakulam@pwdconnect.demo` | Ernakulam District Oversight |
| Company Admin | Platform Admin | `admin@pwdconnect.demo` | Full Platform Configuration |

## Environment Variables

Configure these variables in your runtime environment (`.env` or AI Studio Secrets panel):

- `GEMINI_API_KEY`: Server-side Google Gemini API key for multimodal image/text triage, repair photo comparison, and executive summaries. (Never exposed to the browser.)
- `APP_URL`: Hosted application URL.

## Database Architecture & Setup

- **Local Runtime Database**: Automatically initializes `data/pwd_connect.db` (SQLite via Node 22 `node:sqlite`) with all 16 relational tables and Kerala demo seed data on startup.
- **PostgreSQL / PostGIS Reference Schema**: See `database/schema.sql` for the complete 16-table PostgreSQL + PostGIS + Row Level Security (RLS) schema (`users`, `states`, `districts`, `municipalities`, `departments`, `department_jurisdictions`, `assets`, `issues`, `issue_evidence`, `assignments`, `field_officers`, `status_history`, `notifications`, `repair_verifications`, `road_passports`, `audit_logs`).
- **Firebase Integration**: `firebase-blueprint.json` and ESLint-verified `firestore.rules` support Google Sign-In citizen authentication and Firestore record synchronization.

## Local Development & Verification

```bash
npm install
npm run dev        # Runs Express + Vite on port 3000
npm run lint       # TypeScript type-checking
npm run build      # Production frontend bundle
npx tsx --test src/lib/routingEngine.test.ts src/lib/workflow.test.ts
```
