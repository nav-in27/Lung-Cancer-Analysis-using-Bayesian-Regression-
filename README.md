# Bayesian Lung Cancer Analysis

A full-stack clinical analytics project that combines Bayesian-style survival risk estimation with an interactive dashboard.

This repository includes:
- an R backend (Plumber API + optional Shiny app)
- a React frontend (Vite)
- a Python launcher that starts services together and handles busy-port fallback

## Why This Project

Traditional risk tools often produce only a single value. This project focuses on uncertainty-aware outputs (median estimates and credible-interval style ranges) so results are easier to interpret in real-world decision support scenarios.

## Key Features

- Bayesian-inspired survival prediction pipeline for lung cancer trajectories.
- REST API endpoints for prediction and dataset upload.
- React dashboard for inputs, charts, and quick interpretation.
- One-command launcher via `run_project.py` for local development.
- Optional Shiny mode for an R-native dashboard workflow.
- Automatic local archive creation for uploaded datasets (`datasets_archive/`).

## Project Structure

```text
.
|-- app.R                  # Shiny entrypoint
|-- global.R               # Shared data loading and prediction helpers
|-- server.R               # Shiny server logic
|-- ui.R                   # Shiny UI
|-- plumber_api.R          # Plumber endpoints
|-- run_api.R              # API runtime wrapper
|-- run_project.py         # Unified launcher (full or shiny mode)
|-- run_project.bat        # Windows convenience launcher
|-- react_frontend/        # Vite + React dashboard
`-- www/styles.css         # Shiny stylesheet
```

## Quick Start

### 1) Prerequisites

- R 4.3+
- Python 3.10+
- Node.js 18+

### 2) Install frontend dependencies

```bash
cd react_frontend
npm install
cd ..
```

### 3) Run full stack (API + React)

```bash
python run_project.py --mode full
```

Default local URLs:
- Frontend: `http://127.0.0.1:5173/`
- API docs: `http://127.0.0.1:8000/__docs__/`
- Predict endpoint: `http://127.0.0.1:8000/predict`

If ports are busy, the launcher automatically selects the next available ports.

### 4) Run Shiny-only mode (optional)

```bash
python run_project.py --mode shiny
```

Default URL:
- Shiny: `http://127.0.0.1:3838/`

## API Overview

Main endpoints in `plumber_api.R`:
- `POST /predict`
- `POST /upload_dataset`
- `GET /health` (if enabled in your current API script version)

Use `http://127.0.0.1:8000/__docs__/` for interactive endpoint docs while running locally.

## Dataset Workflow

- Uploaded CSV/Excel files are saved in `datasets_archive/`.
- The folder is created automatically if it does not exist.
- Archive data is ignored by git to keep repository history clean.

## Tech Stack

- Backend: R, Plumber, Shiny, dplyr, ggplot2, plotly
- Frontend: React, Vite, Recharts
- Orchestration: Python subprocess runner

## License

This project is now open and reusable under the MIT License.

See `LICENSE` for full terms.
