# PassPort - Visitor Management System

A full-stack, reception-grade **Visitor Management System** built with a Python Flask REST API backend, SQLite/SQLAlchemy database, clean Vanilla HTML/CSS/JS frontend, and Vercel serverless deployment configuration.

![Visitor Management System](https://img.shields.io/badge/Stack-Flask%20%7C%20SQLite%20%7C%20Vanilla%20JS-blue)
![Vercel Ready](https://img.shields.io/badge/Deployment-Vercel%20Serverless-black)

---

## 🌟 Key Features

1. **Front-Desk Visitor Registration Kiosk**:
   - Touch-friendly registration form with large, clear inputs.
   - Fields: Full Name, Phone Number, Email (optional), Department, Host Person to Meet, Purpose of Visit, Check-in Time (auto), and Expected Check-out Time.
   - Live **Webcam Snapshot Capture** or file upload for visitor photos (stored as Base64 data URLs).
   - Instant generation of unique **Visitor Pass Number** (e.g. `VMS-20260816-4821`).
   - Digital **Printable Visitor Badge Pass** complete with Pass QR code.

2. **Reception & Admin Dashboard**:
   - Login-protected admin dashboard (`admin` / `adminpass`).
   - Real-time summary metric cards: **Total Visitors Today**, **Currently Checked-In**, **Checked-Out Today**, and **Overdue Checkouts**.
   - Instant search by visitor name, phone number, email, or pass code.
   - Filters by **Status** (Checked-in / Checked-out), **Department**, and **Visit Date**.
   - One-click **"Check Out"** action updating checkout time via REST API.
   - Delete records or re-print visitor passes.
   - **Sample Demo Data Seeder** button for instant testing.

3. **Backend REST API**:
   - Built with Python Flask & Flask-SQLAlchemy.
   - CORS enabled for seamless cross-origin requests.
   - Clean JSON endpoints with ISO timestamp support.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphic Theme), Vanilla JavaScript (ES6+). No heavy frameworks required.
- **Backend**: Python 3 (Flask, Flask-SQLAlchemy, Flask-CORS, PyJWT).
- **Database**: SQLite (file-based ORM via SQLAlchemy).
- **Deployment**: Vercel Serverless (`@vercel/python` engine).

---

## 📁 Project Structure

```
Visitor Management System/
├── api/
│   └── app.py              # Flask app, REST API endpoints, SQLAlchemy models, auth
├── public/
│   ├── index.html          # Kiosk registration & Admin Dashboard interface
│   ├── css/
│   │   └── styles.css      # Modern reception theme, badges, visitor pass, responsive layout
│   └── js/
│       └── app.js          # API client, webcam capture, QR generator, filters & modal logic
├── .env.example            # Environment variable template
├── .gitignore              # Python, virtual environment, DB & Vercel ignore rules
├── requirements.txt        # Python package dependencies
├── vercel.json             # Vercel serverless function & static asset routing
└── README.md               # Setup guide & deployment documentation
```

---

## 🚀 Local Development Setup

### Prerequisites
- Python 3.9+ installed on your system.

### Steps
1. **Clone or navigate to the repository**:
   ```bash
   cd "Visitor Management System"
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate        # On macOS/Linux
   # or venv\Scripts\activate      # On Windows
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

5. **Run the Flask application**:
   ```bash
   python3 api/app.py
   ```

6. **Open in browser**:
   Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000).

---

## 🔑 Default Admin Credentials

- **Username**: `admin`
- **Password**: `adminpass`

*(You can customize these in `.env` or Vercel Environment Variables).*

---

## 📡 REST API Endpoint Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/login` | Authenticate receptionist/admin & receive JWT token |
| `POST` | `/api/visitors` | Register new visitor (check-in) & issue pass |
| `GET` | `/api/visitors` | List all visitors (supports `search`, `status`, `department`, `date` query params) |
| `GET` | `/api/visitors/<id>` | Fetch single visitor record by ID |
| `PUT` | `/api/visitors/<id>/checkout` | Mark active visitor as checked out with current timestamp |
| `DELETE` | `/api/visitors/<id>` | Permanently delete visitor record |
| `GET` | `/api/stats` | Summary counts (Total Today, Currently Checked-In, Checked-Out, Overdue) |
| `POST` | `/api/seed` | Seed demo visitor records into database |
| `GET` | `/api/health` | API health status check |

---

## ☁️ Deploying to Vercel

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Visitor Management System"
   git remote add origin https://github.com/YOUR_USERNAME/visitor-management-system.git
   git push -u origin main
   ```

2. **Import to Vercel**:
   - Go to your [Vercel Dashboard](https://vercel.com).
   - Click **Add New** > **Project** and import your GitHub repository.
   - Vercel automatically detects `vercel.json` and configures `@vercel/python`.

3. **Configure Environment Variables in Vercel**:
   Add the following variables under Project Settings > Environment Variables:
   - `SECRET_KEY` = `your_strong_random_secret_key`
   - `ADMIN_USERNAME` = `admin`
   - `ADMIN_PASSWORD` = `your_custom_password`

4. **Deploy**: Click **Deploy**. Vercel will build and serve your static assets and serverless Python API routes instantly.

---

## ⚠️ Important Note: Vercel Serverless File System & Database Architecture

> [!IMPORTANT]
> Vercel serverless functions run in ephemeral containers with a **read-only file system** (except for temporary access to `/tmp`).
> 
> In this repository, `api/app.py` is configured to store SQLite database files in `/tmp/vms.db` when deployed on Vercel. Because `/tmp` is reset periodically when serverless containers recycle, **data written to SQLite on Vercel is temporary**.

### Recommended Production Cloud Databases:
For persistent production data on Vercel, simply update the `DATABASE_URL` environment variable in Vercel settings to point to a managed cloud database without modifying any code:

1. **Turso (LibSQL/SQLite Cloud)**:
   ```env
   DATABASE_URL=sqlite+libsql://your-db-name.turso.io?authToken=...
   ```
2. **Supabase or Neon (PostgreSQL Cloud)**:
   ```env
   DATABASE_URL=postgresql://postgres:password@ep-cool-db.us-east-1.aws.neon.tech/main
   ```
3. **Vercel Postgres**: Connect directly via Vercel Storage integration.
