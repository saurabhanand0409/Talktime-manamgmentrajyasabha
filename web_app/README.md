# Parliament Talk Time Management System - Web Version

A browser-based version of the Rajya Sabha Talk Time Management System built with Flask and WebSockets.

## Features

- **Dashboard** - Central hub with navigation to all features
- **Zero Hour** - 3-minute countdown timer for interventions
- **Member Speaking** - Count-up timer to track speaking duration
- **Bill Discussions** - Track discussions with bill information
- **Real-time Updates** - WebSocket-based live synchronization
- **UDP Signal Receiver** - Receives seat selection signals from hardware

## Project Structure

```
web_app/
├── app.py                  # Flask application (backend)
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── static/
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   ├── js/
│   │   └── app.js         # Frontend JavaScript
│   └── images/
│       └── parliament_logo.png
└── templates/
    ├── index.html          # Dashboard page
    ├── zero_hour.html      # Zero Hour page
    ├── member_speaking.html # Member Speaking page
    └── bill_discussions.html # Bill Discussions page
```

## Prerequisites

- Python 3.8+
- MySQL Server (with existing database from desktop version)
- Node.js (optional, for frontend development)

## Installation

1. **Navigate to the web_app directory:**
   ```bash
   cd web_app
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   # OR
   source venv/bin/activate  # Linux/Mac
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Ensure .env file exists in parent directory:**
   The app looks for `.env` in the parent `Parliament` folder with:
   ```
   DB_HOST=127.0.0.1
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=dashboard_db
   ```

## Running the Application

1. **Start the server:**
   ```bash
   python app.py
   ```

2. **Open in browser:**
   ```
   http://localhost:5000
   ```

3. **For multiple displays:**
   Open the same URL on different computers/screens on the same network:
   ```
   http://YOUR_IP_ADDRESS:5000
   ```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/member/<seat_no>` | GET | Get member details by seat number |
| `/api/chairpersons` | GET | Get list of chairpersons |
| `/api/bills/running` | GET | Get running bills |
| `/api/members` | GET | Get all members |
| `/api/bills` | POST | Add a new bill |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `seat_selected` | Server → Client | When a seat is selected via UDP |
| `member_data` | Server → Client | Member data response |
| `timer_update` | Client → Server | Timer state sync |
| `timer_sync` | Server → Client | Broadcast timer to all clients |
| `select_chairperson` | Bidirectional | Chairperson selection sync |

## UDP Signal Receiver

The backend listens for UDP signals on port 65432 (configurable).
When a seat number is received, it broadcasts to all connected browser clients.

**Compatible with the existing `input_feeder.py` program.**

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Troubleshooting

### Database Connection Issues
- Verify MySQL is running
- Check `.env` file credentials
- Ensure database `dashboard_db` exists

### WebSocket Not Connecting
- Check if Flask server is running
- Verify firewall allows port 5000
- Check browser console for errors

### UDP Not Receiving
- Ensure port 65432 is not in use
- Check firewall settings
- Verify sender is using correct IP/port

## Development

To run in development mode with auto-reload:
```bash
python app.py
```

For production, use a proper WSGI server:
```bash
pip install gunicorn
gunicorn -k eventlet -w 1 app:app
```

## License

© Bihar Communications Pvt. Ltd 2025. All rights reserved.
