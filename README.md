# WorkWatch 👁️

> Real-time employee productivity monitoring with emotion and behavior intelligence — built for modern remote and hybrid teams.

---

## What is WorkWatch?

WorkWatch is a web-based productivity monitoring tool that helps managers and HR teams understand how their employees are working throughout the day — without being intrusive or invasive.

Instead of just tracking whether someone is at their desk, WorkWatch understands *how* they are working. It detects focus levels, emotional state, head direction, and activity patterns — all in real time — and presents everything in a clean admin dashboard that any manager can use without technical knowledge.

All analysis happens privately inside the employee's own browser. No video is ever recorded or sent to any server. Only anonymized signals (like "face detected: yes" or "stress level: 12%") are transmitted.

---

## Why WorkWatch?

Remote and hybrid work has made it genuinely difficult for managers to understand team wellbeing and productivity. Traditional monitoring tools either invade privacy (screen recording, keystroke logging) or give too little signal (just online/offline status).

WorkWatch sits in the middle — giving managers meaningful, actionable data while respecting employee dignity and privacy.

---

## Key Features

### For Employees
- Simple one-click session start with a clear consent notice
- Employees always know exactly what is being monitored
- No video is stored. No keystrokes are recorded. Ever.
- Optional personal dashboard showing their own productivity and emotion trends

### For Managers & HR
- **Live admin dashboard** — see every employee's productivity score, emotional state, and focus status in real time
- **Emotion detection** — understand if employees are engaged, stressed, or disengaged throughout the day
- **Head pose tracking** — know if someone has been looking away from their screen for extended periods
- **Behavior signals** — mouse and keyboard activity patterns indicate focus and stress levels
- **Smart alerts** — get notified when an employee shows sustained stress, low engagement, or prolonged inactivity
- **Daily and weekly reports** — view trends over time, compare departments, and export data as CSV
- **Department grouping** — compare productivity and wellbeing across teams

---

## How It Works (Plain English)

```
Employee opens WorkWatch in their browser
         │
         ▼
Employee reads the consent notice and clicks "Start Monitoring"
         │
         ▼
The app uses the webcam to detect:
  • Is the employee's face visible?
  • What emotion are they showing? (happy, stressed, neutral, etc.)
  • Are they looking at the screen or away?
         │
         ▼
The app also tracks (without recording content):
  • Is the work tab in focus?
  • Is the mouse moving normally or erratically?
  • What is the typing speed and rhythm? (not what is typed)
         │
         ▼
All signals are combined into a Productivity Score (0–100)
and sent securely to the server every 5 seconds
         │
         ▼
Admin dashboard updates in real time
Manager sees score, emotion badge, and any alerts
         │
         ▼
At end of day: daily report is generated automatically
```

---

## Productivity Score Explained

Every employee gets a score from 0 to 100 calculated from:

| Signal | Weight | What it measures |
|---|---|---|
| Face presence | 35% | Is the employee at their desk? |
| Active window | 20% | Is the work tab in focus? |
| Non-idle time | 15% | Any recent mouse or keyboard activity? |
| Engagement    | 15% | Positive emotion signals (happy, neutral) |
| Stress penalty| -10% | Negative emotion signals (angry, fearful) |
| Typing rhythm | 10% | Steady, focused typing patterns |
| Behavior penalty | -10% | Erratic mouse movement or extended look-away |

**Score ranges:**

| Score | Status | Meaning |
|---|---|---|
| 75 – 100 | Highly engaged | Employee is focused and working well |
| 50 – 74 | Moderately active | Some distractions but generally productive |
| 25 – 49 | Low engagement | Worth a check-in |
| 0 – 24 | Disengaged | Alert triggered — manager notified |

---

## Alert System

WorkWatch automatically alerts managers when:

| Alert | Trigger | What to do |
|---|---|---|
| High stress | Stress score > 70% for 10+ minutes | Consider checking in with the employee |
| Head away | Looking away from screen for 5+ minutes | Gentle check-in recommended |
| Erratic behavior | Frantic mouse/keyboard patterns for 5+ minutes | May indicate frustration |
| Low engagement | Engagement < 25% for 20+ minutes | Employee may need support |
| Low score | Overall score < 25 for 15+ minutes | Manager review recommended |

All alerts are designed to prompt a *supportive* response, not a punitive one.

---

## Privacy & Ethics — What We Track and What We Don't

### What WorkWatch DOES track
- Whether your face is visible in the webcam frame
- Facial expression probabilities (happy, sad, neutral, etc.)
- Head direction (are you looking at the screen?)
- Whether the work tab is in focus
- Mouse movement speed and patterns
- Keyboard typing speed and rhythm (timing only)

### What WorkWatch NEVER does
- Record or store any video footage
- Capture screenshots of the employee's screen
- Log what keys are pressed or what is typed
- Take photos of the employee
- Track websites visited or applications used
- Share data with any third party

### Employee consent
Every employee must actively check a consent box and click "Start Monitoring" before any data is collected. A visible banner remains on screen for the entire session. Employees can stop the session at any time.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | Employee and admin web interface |
| Face detection | face-api.js | Runs entirely in the browser — no video sent to server |
| Styling | Tailwind CSS | Clean, responsive UI |
| Backend | Node.js + Express | API server and real-time communication |
| Real-time | Socket.io | Live score updates pushed to admin dashboard |
| Database | MySQL 8.0 | Stores sessions, events, scores, and reports |
| Cache | Redis 7 | Fast live score lookups and session tokens |
| ORM | Prisma | Database schema and queries |
| Job queue | Bull | Scheduled daily report generation |
| Auth | JWT | Secure employee and admin login |
| Deploy | Docker + Nginx | Containerised deployment |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Employee Browser                         │
│                                                             │
│  Webcam → face-api.js → emotion + head pose signals        │
│  Page Visibility API  → tab focus signals                   │
│  Mouse / Keyboard     → behavior signals (timing only)      │
│                                                             │
│  All signals batched and sent securely every 5 seconds      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (no video, no screenshots)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Server (Node.js)                     │
│                                                             │
│  Receives signal batch → computes score → stores in MySQL   │
│  Checks alert rules → emits live update via Socket.io       │
│  Runs daily report job at midnight                          │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          ▼
    ┌─────────────┐           ┌──────────────┐
    │   MySQL 8   │           │   Redis 7    │
    │  Sessions   │           │  Live scores │
    │  Events     │           │  Auth tokens │
    │  Reports    │           └──────────────┘
    └─────────────┘
                         │ WebSocket push
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Admin Dashboard                          │
│                                                             │
│  Live employee cards with score, emotion, and alerts        │
│  Department filters, daily reports, CSV export              │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation & Setup Guide

### What you need before starting

- [Node.js 20+](https://nodejs.org) installed on your computer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A terminal / command prompt
- Git

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/premkumar002277/productivity_monitor.git
cd workwatch
```

---

### Step 2 — Set up environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` in any text editor and update these values:

```env
# Database
DATABASE_URL="mysql://root:yourpassword@localhost:3306/workwatch"

# Redis
REDIS_URL="redis://localhost:6379"

# Security — change these to long random strings
JWT_ACCESS_SECRET="change-this-to-a-random-string-at-least-32-chars"
JWT_REFRESH_SECRET="change-this-to-a-different-random-string-32-chars"

# App
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

---

### Step 3 — Start the database and Redis

```bash
docker-compose up -d mysql redis
```

Wait about 20 seconds for MySQL to finish starting, then verify:

```bash
docker-compose ps
# Both mysql and redis should show "running"
```

---

### Step 4 — Install dependencies

```bash
# Install server dependencies
cd apps/server
npm install

# Install client dependencies
cd ../client
npm install
```

---

### Step 5 — Set up the database

```bash
cd apps/server
npx prisma migrate dev
npx prisma generate
```

This creates all the required tables in MySQL automatically.

---

### Step 6 — Download face detection model files

These files power the emotion and head pose detection. They run in the browser — nothing is sent to any server.

```bash
cd apps/client/public/models

curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_expression_model-weights_manifest.json
curl -O https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_expression_model-shard1
```

---

### Step 7 — Start the app

Open two terminal windows:

**Terminal 1 — Start the server:**
```bash
cd apps/server
npm run dev
# Server running at http://localhost:4000
```

**Terminal 2 — Start the client:**
```bash
cd apps/client
npm run dev
# App running at http://localhost:5173
```

---

### Step 8 — Open the app

- Employee view: [http://localhost:5173/employee](http://localhost:5173/employee)
- Admin dashboard: [http://localhost:5173/admin](http://localhost:5173/admin)

Register an admin account first, then register employee accounts.
When an employee starts a session, their card will appear live on the admin dashboard.

---

## Deployment (Production)

The easiest way to deploy WorkWatch is using [Railway](https://railway.app):

1. Push your code to GitHub
2. Create a new Railway project
3. Add a MySQL plugin and a Redis plugin
4. Connect your GitHub repo
5. Set the environment variables from your `.env` file
6. Deploy

Railway will handle the rest automatically.

---

## Folder Structure

```
workwatch/
├── apps/
│   ├── client/          React frontend (employee + admin views)
│   └── server/          Node.js API server
│       └── prisma/      Database schema and migrations
├── docker-compose.yml   Local development setup
├── .env.example         Environment variable template
└── README.md
```

---

## Legal Notice

WorkWatch collects biometric-adjacent data (facial expressions, head direction). Before deploying in a workplace, ensure compliance with applicable laws in your region:

- **India:** Digital Personal Data Protection Act (DPDP) 2023
- **European Union:** GDPR — explicit employee consent required, DPIA recommended
- **United States (California):** CCPA — employees have rights to access and delete their data
- **All regions:** Employees must be clearly informed of what is monitored before monitoring begins

WorkWatch is designed with consent and transparency as core principles. Use it responsibly.

---

## License

MIT License — free to use, modify, and distribute with attribution.

---

*Built with care for teams that value both productivity and people.*
