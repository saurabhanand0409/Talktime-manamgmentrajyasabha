# Rajya Sabha Talk Time Management System

Full-stack system for managing and broadcasting speaking time for Zero Hour, Member Speaking, and Bill Discussion sessions. Includes live timers, activity logging, PDF/Excel exports, and broadcast display control.

## Components
- `react-app/`: React (Vite) frontend control panel + broadcast views
- `web_app/`: Flask backend APIs + MySQL persistence
- `docs/`: Customer-facing documents and assets

## Prerequisites
- Node.js (for React app)
- Python 3.x
- MySQL server

## Setup
### Backend
```
cd web_app
pip install -r requirements.txt
python app.py
```
Runs on `http://localhost:5000`.

### Frontend
```
cd react-app
npm install
npm run dev
```
Vite runs on `http://localhost:3000` (or next available port).

## Build
```
cd react-app
npm run build
```
Outputs to `react-app/dist`.

## Notes
- Configure MySQL connection settings in `web_app/app.py` as needed.
- For LAN deployments, run backend + frontend on the server machine and access the UI from client machines on the same network.
