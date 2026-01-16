# Two-PC Master/Slave Deployment Plan

This document explains how to deploy the current stack (Flask backend + React frontend + MySQL) across **two Windows PCs**:

- **Master PC**: Runs backend + frontend, connects to TV output, is the **primary writer**.
- **Slave PC**: Runs backend + frontend, mirrors data **read-only** in near‑real‑time.

> Recommendation: Use a **single MySQL instance on the Master** and have the Slave connect to it over the LAN. This avoids fragile file-based syncing. If you need local redundancy, add MySQL replication (primary/replica) as described below.

---

## High-Level Topology

```
                +---------------------------+
                |        Master PC          |
                |  Flask (web_app)          |
                |  React (react-app)        |
                |  MySQL (primary)          |
                +-------------+-------------+
                              |
                   LAN (TCP 3306, 5000, 3000)
                              |
                +-------------v-------------+
                |         Slave PC          |
                |  Flask (web_app)          |
                |  React (react-app)        |
                |  MySQL (replica optional) |
                +---------------------------+

User access:
  - Master: http://localhost:3000 (TV output)
  - Slave:  http://localhost:3000 (local monitoring)
  - Network access (optional): http://<master_ip>:3000
```

---

## Network/Ports
- **Frontend (React)**: 3000 (or 3001 if 3000 is busy; set `--port`).
- **Backend (Flask/Socket.IO)**: 5000.
- **MySQL**: 3306 (exposed on Master; allow inbound from Slave).
- Ensure Windows Firewall allows these inbound ports on Master.

---

## Data Flow & Roles
- **Master mode**: Full read/write to MySQL primary. Emits Socket.IO events. Drives the TV output.
- **Slave mode**: Read-only connection to Master DB. Listens to the same APIs/Socket.IO to stay in sync.
- **Optional replication**: If you must have a local DB copy on Slave for resilience, configure MySQL primary/replica (binlog) from Master->Slave. Otherwise, simply point Slave to Master’s MySQL.

---

## Installation (both PCs)
1. Install **Python 3.11+** and **Node.js 18+**.
2. Clone/copy repo (with only `react-app/`, `web_app/`, and needed tools).
3. `web_app`: `python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt`
4. `react-app`: `npm install`
5. Place a `.env` in `web_app/` (see Config below).

---

## Configuration

### Master `.env` (web_app/.env)
```
DB_HOST=127.0.0.1
DB_USER=youruser
DB_PASSWORD=yourpass
DB_NAME=dashboard_db
ROLE=master
```

### Slave `.env`
```
DB_HOST=<MASTER_LAN_IP>
DB_USER=readonly_user   # grant SELECT (and minimal needed) on MySQL
DB_PASSWORD=readonly_pass
DB_NAME=dashboard_db
ROLE=slave
```

Create a read-only MySQL user on Master for the Slave:
```sql
CREATE USER 'readonly_user'@'%' IDENTIFIED BY 'readonly_pass';
GRANT SELECT ON dashboard_db.* TO 'readonly_user'@'%';
FLUSH PRIVILEGES;
```

If you need Slave writes (e.g., chair selection locally), point both to the same user with write grants—just remember that **Master should remain the authority for writes** to avoid conflicts.

---

## Optional: MySQL Primary/Replica (for local DB copy on Slave)
Only do this if you must keep a DB copy on Slave:
1. Enable binlog on Master (`my.ini`):
   ```
   [mysqld]
   server-id=1
   log_bin=mysql-bin
   ```
2. On Slave (`my.ini`):
   ```
   [mysqld]
   server-id=2
   replicate-do-db=dashboard_db
   ```
3. Create a replication user on Master:
   ```sql
   CREATE USER 'repl'@'%' IDENTIFIED BY 'repl_pass';
   GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
   FLUSH PRIVILEGES;
   ```
4. Take a dump of `dashboard_db` from Master, import into Slave.
5. Configure Slave:
   ```sql
   CHANGE MASTER TO
     MASTER_HOST='<MASTER_LAN_IP>',
     MASTER_USER='repl',
     MASTER_PASSWORD='repl_pass',
     MASTER_LOG_FILE='mysql-bin.000001',
     MASTER_LOG_POS=<offset>;
   START SLAVE;
   ```
6. Verify with `SHOW SLAVE STATUS\G`.

If you’re OK with a single shared DB (recommended), skip replication and just point Slave to Master’s DB.

---

## Running

### Master
- Backend: `cd web_app && venv\Scripts\activate && python app.py`
- Frontend: `cd react-app && npm run dev -- --host 0.0.0.0 --port 3000`

### Slave
- Backend: `cd web_app && venv\Scripts\activate && python app.py`
- Frontend: `cd react-app && npm run dev -- --host 0.0.0.0 --port 3000` (or 3001)

### Windows helper script (example)
Create `StartParliament.ps1` in project root:
```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\web_app'; python app.py"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\react-app'; npm run dev -- --host 0.0.0.0 --port 3000"
```
Make a desktop shortcut to run: `powershell.exe -ExecutionPolicy Bypass -File "<path>\StartParliament.ps1"`.

---

## UI: Master/Slave Selector (to implement)
- Add a toggle on the React home/dashboard to pick **Master** or **Slave**.
- Store the choice in `localStorage` and show it in the Header (e.g., a badge: “Role: Master/Slave”).
- Expose a small API in Flask (e.g., `GET/POST /api/node-role`) so the Slave can read the Master’s role and the Master can broadcast via Socket.IO for visibility.
- When **Slave**, run the app in read-only mode (disable write actions) unless you deliberately allow writes to the shared DB.
- When **Master**, allow full write actions.

> Note: The actual data sync is handled by the database topology (shared DB or MySQL replication). The UI toggle is for user clarity and to prevent unintended writes from the Slave.

---

## Operational Notes
- Keep clocks in sync (Windows Time + NTP) to keep logs aligned.
- If using one shared DB on Master, ensure reliable LAN and firewall rules.
- For display-only Slave, you can make its DB user read-only to avoid accidental writes.
- Backups: take regular dumps from the Master DB.

---

## Minimal Steps to Deliver to a Client
1. Install MySQL on Master; create DB + users (read/write and optionally read-only).
2. Put `.env` files on both PCs with correct `DB_HOST`, creds, and `ROLE`.
3. Open firewall ports 3306 (MySQL), 5000 (Flask), 3000 (React).
4. Start services with the PowerShell script on both PCs.
5. Connect the Master’s browser (or fullscreen) to `http://localhost:3000` for TV output; the Slave can monitor on its own `localhost:3000` or `http://<master_ip>:3000` if desired.


