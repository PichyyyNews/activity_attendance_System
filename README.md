# Activity Attendance System

A web-based attendance checking system for activity classes, designed for simplicity, mobile usability, and efficient data management.

## Features

- **Admin Dashboard**: Create and manage activity sessions, generate dynamic QR codes for each week, and monitor attendance records.
- **User Interface (Mobile-First)**: Students scan a QR code and fill out a responsive, easy-to-use form (Name, Student ID, Major).
- **User Dashboard**: Students can track their attendance history and view missed classes.
- **Dual Storage**: Automatically saves attendance data locally to an SQLite database and syncs to Google Sheets in real-time.
- **Dockerized**: Fully containerized with Docker Compose for easy deployment.

## Tech Stack

- **Frontend**: React (TypeScript), Vite, Tailwind CSS (100% Responsive)
- **Backend**: Node.js, Express (TypeScript)
- **Database**: SQLite (Local), Google Sheets API (Cloud Sync)
- **Infrastructure**: Docker, Docker Compose

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Google Cloud Service Account credentials (`credentials.json`) for Google Sheets API

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/PichyyyNews/activity_attendance_System.git
   cd activity_attendance_System
   ```

2. **Environment Variables**
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   *Note: Place your Google Sheets API `credentials.json` in the appropriate directory (e.g., `./backend/config/credentials.json`) and update the `.env` file with your Spreadsheet ID.*

3. **Run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: `http://localhost:3000` (or as configured in docker-compose)
   - Backend API: `http://localhost:5000`
