<h1 align="center">
  <br>
  OncoBayes.AI | Clinical Intelligence Platform
  <br>
</h1>

<h4 align="center">A high-performance decision-support engine utilizing Bayesian Survival MCMC inference to predict precise lung cancer clinical trajectories.</h4>

<p align="center">
  <a href="#architecture">Architecture</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#mathematical-core">Mathematical Core</a> •
  <a href="#license">License</a>
</p>

---

## Overview

This repository contains the full technology stack for a state-of-the-art predictive clinical dashboard. Unlike standard frequentist machine learning approaches that output rigid point-estimates, this system utilizes pure Bayesian posterior continuous inference (`rstanarm`, `stan_surv`) dynamically decoupled into a REST architectural pipeline to measure true mathematical uncertainty in survival times based on individualized patient pathology.

It represents a complete separation of concerns:
1. **The Core Engine**: An R Plumber REST API handling the active MCMC simulations. 
2. **The Client Interface**: A high-fidelity React Vite environment drawing precise data trajectories using Recharts.

---

## Features

* **Real-time Inference API**: Calculates full posterior predictive density matrices dynamically instead of requiring pre-computed lookup tables.
* **Continuous Uncertainty Bounds**: 95% credible intervals for median survival estimates natively computed from the MCMC draws.
* **React Dashboard**: Modern 'Glassmorphism' dark-mode user interface decoupled entirely from the R-engine.
* **Dataset Archival Workflow**: Secure asynchronous `multipart/form-data` uploads queue new clinical trials immediately into a staging environment (`/datasets_archive/`) for the next parameter tuning run.
* **Local Failsafe**: Intelligent fallback mechanisms programmed into the JavaScript layer to visualize trajectory mathematics seamlessly even if the Plumber backend is offline.

---

## Quick Start

You do not need to boot up heavy Docker clusters or configure internal networking. The system has been optimized with strict native concurrency scripts that will spin up both the R Engine and the React ecosystem simultaneously.

### Prerequisites

Ensure you have the following installed locally:
* **R (v4.0+)**: To execute the Bayesian math calculations.
* **Node.js (v18+) & NPM**: To render the React visualizations.
* **Python 3**: For executing the parallel application launcher gracefully.

### Running the Project

Clone this repository and simply execute the global application runner:

```bash
# Terminal 1 - Boot up the dual-threaded environment
python run_project.py

# Alternatively for Windows natively:
# Double-click 'run_project.bat' to launch the dual-terminals
```

Within 5 seconds, the system will output:
1. `http://localhost:8000/predict` (Active Mathematical Inference Engine)
2. `http://localhost:5173/` (Local Clinical Dashboard UI)

Navigate to the dashboard URL in your browser to begin testing parameters.

---

## Mathematical Core

The mathematical backbone fundamentally relies on generalized additive proportional-hazards and accelerated failure time distributions approximated via Hamiltonian Monte Carlo sampling.

Variables factored dynamically into the joint posterior distributions:
- **Baseline Clinicals**: Age, Sex, Pack-Years (Smoking History)
- **Pathology Classifications**: TNM Stage grading (I-IV), ECOG Performance tracking
- **Tumor Dimensions**: Primary cm scaling
- **Genomic Scaling**: Weighted biomarker coefficients

---

## License & Intellectual Property

**Proprietary Software - All Rights Reserved**

The source code within this repository is made publicly visible strictly for educational and portfolio demonstration purposes. 

This is **NOT** an open-source project. You are legally forbidden from copying, distributing, duplicating, monetizing, or utilizing this architecture (or derivative works) for any commercial operations without explicitly written licensing agreements from the author (Naveen). 

*See the `LICENSE` file for the exact legal restrictions.* All graphical interfaces, predictive wrappers, and specific application schemas are protected under intellectual property law.
