# Anooco - Intelligent Road Companion App

Anooco is a comprehensive road intelligence and navigation application designed to enhance the driving experience. It combines real-time navigation, crowd-sourced reporting (potholes, accidents, police), vehicle services integration, social connectivity, and multimedia control into a single, cohesive interface.

## 🚀 Key Features

### 🗺️ Navigation & Mapping
*   **Real-time Dashboard:** Interactive map powered by Leaflet and OpenStreetMap.
*   **Day/Night Modes:** Automatic or manual switching for optimal visibility.
*   **Navigation:** Turn-by-turn guidance with route planning.
*   **Plan a Drive:** Route optimization and trip planning tools.

### 📢 Crowd-Sourced Reporting
*   **One-Tap Reporting:** Quickly report road hazards, police presence, accidents, and traffic jams.
*   **Voice Reporting:** Hands-free reporting using voice commands for safety.
*   **Live Alerts:** Receive real-time notifications about upcoming road events reported by other users.
*   **Extended Reports:** Submit detailed reports with images and descriptions.

### 🚗 Vehicle Services
*   **Nearby Services:** Find gas stations, parking lots, and EV charging stations.
*   **Service Details:** View opening hours, pricing (where available), and directions.

### 👥 Social Driving
*   **Friends & Groups:** Connect with friends, create driving groups, and share locations.
*   **Leaderboards:** Track contributions and driving stats.
*   **Profile:** Manage your user profile, vehicle details, and trust score.

### 🎵 Multimedia & Tools
*   **Music Integration:** Control Spotify and YouTube Music directly from the dashboard.
*   **Dashcam:** Built-in dashcam functionality to record drives.
*   **AI Pothole Detection:** Experimental feature using accelerometer and camera data to automatically detect road anomalies.
*   **OCR:** Optical Character Recognition features for scanning documents/plates.

## 🛠️ Technology Stack

### Frontend
*   **Framework:** [Ionic](https://ionicframework.com/) with [Angular](https://angular.io/)
*   **Runtime:** [Capacitor](https://capacitorjs.com/) (for cross-platform native deployment)
*   **Maps:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles
*   **Styling:** SCSS with a custom "Business Blue" theme

### Backend
*   **Framework:** .NET Core API (`Anooco.API`)
*   **Real-time:** SignalR for live alerts and updates
*   **Database:** SQL Server (inferred from `.sql` files)

## 📂 Project Structure

```
c:\Jason\Anoocoo\
├── backend/                # .NET Core Web API
│   ├── Anooco.API/         # API Source Code
│   │   ├── Controllers/    # API Endpoints
│   │   ├── Hubs/           # SignalR Hubs
│   │   └── Services/       # Business Logic
│   └── database/           # SQL Scripts & Schema
│
├── frontend/               # Ionic Angular App
│   └── anooco/
│       ├── src/
│       │   ├── app/
│       │   │   ├── pages/      # Application Pages (Dashboard, Settings, etc.)
│       │   │   ├── services/   # Core Services (API, Location, etc.)
│       │   │   └── theme/      # Global Styling & Variables
│       └── assets/             # Images, Icons, & Static Resources
│
└── docs/                   # Additional Documentation
```

## 🚦 Getting Started

### Prerequisites
*   Node.js (LTS version recommended)
*   Ionic CLI (`npm install -g @ionic/cli`)
*   .NET SDK (for backend)
*   SQL Server (or LocalDB)

### Frontend Setup
1.  Navigate to the frontend directory:
    ```bash
    cd frontend/anooco
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run the development server:
    ```bash
    ionic serve
    ```

### Backend Setup
1.  Navigate to the backend directory:
    ```bash
    cd backend/Anooco.API
    ```
2.  Update `appsettings.json` with your database connection string.
3.  Run the application:
    ```bash
    dotnet run
    ```

## 🎨 UI/UX Theme
The application follows a "Business Blue" design system:
*   **Primary Color:** `#0056D2`
*   **Font:** Poppins
*   **Style:** Modern, clean interface with rounded square components (`14px-20px` radius) and soft diffuse shadows.

## 🤝 Contributing
1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.
