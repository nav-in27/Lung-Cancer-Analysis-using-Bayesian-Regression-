import subprocess
import os
import time
import sys
import threading
import shutil


def resolve_rscript():
    # 1) Prefer PATH if available
    from_path = shutil.which("Rscript") or shutil.which("Rscript.exe")
    if from_path:
        return from_path

    # 2) Fallback to common Windows install locations
    candidates = [
        r"C:\Program Files\R\R-4.5.2\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def run_backend():
    print("Starting R Plumber API on port 8000...", flush=True)
    try:
        rscript = resolve_rscript()
        if not rscript:
            print("[ERROR] Could not locate Rscript. Install R or add R/bin to PATH.", flush=True)
            return

        # Ensure both known user library locations are visible to the R subprocess.
        env = os.environ.copy()
        libs = [
            r"C:\Users\navee\AppData\Local\R\win-library\4.5",
            r"C:\Users\navee\Documents\R\win-library\4.5",
        ]
        current_libs = env.get("R_LIBS_USER", "")
        if current_libs:
            libs.append(current_libs)
        env["R_LIBS_USER"] = ";".join(libs)

        process = subprocess.Popen([rscript, "run_api.R"],
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.STDOUT,
                                   text=True,
                                   bufsize=1,
                                   env=env)
        for line in process.stdout:
            print(f"[BACKEND R-API] {line}", end="", flush=True)
    except FileNotFoundError:
        print("[ERROR] Rscript not found. Ensure R is installed and added to your system PATH.", flush=True)
    except Exception as e:
        print(f"[ERROR] Backend failed: {e}", flush=True)

def run_frontend():
    print("Starting React Frontend...", flush=True)
    frontend_dir = os.path.join(os.getcwd(), "react_frontend")
    
    try:
        # shell=True required on Windows to resolve 'npm'
        process = subprocess.Popen(["npm", "run", "dev"], 
                                   cwd=frontend_dir,
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.STDOUT,
                                   text=True,
                                   bufsize=1,
                                   shell=True)
        for line in process.stdout:
            print(f"[FRONTEND VITE] {line}", end="", flush=True)
    except Exception as e:
        print(f"[ERROR] Frontend failed: {e}", flush=True)

if __name__ == "__main__":
    print("\n" + "=" * 60, flush=True)
    print(" Initializing Bayesian Lung Cancer Application", flush=True)
    print("=" * 60 + "\n", flush=True)
    
    # 1. Start backend thread
    backend_thread = threading.Thread(target=run_backend, daemon=True)
    backend_thread.start()
    
    # Give the backend a few seconds to boot up its mathematical packages
    print("Waiting 3 seconds for statistical libraries to load...\n", flush=True)
    time.sleep(3)
    
    # 2. Start frontend thread
    frontend_thread = threading.Thread(target=run_frontend, daemon=True)
    frontend_thread.start()
    
    print("\n" + "=" * 60, flush=True)
    print(" SUCCESS: Dual Environments are spinning up!", flush=True)
    print(" Backend API  -> http://127.0.0.1:8000/predict", flush=True)
    print(" Frontend App -> Usually http://localhost:5173 (Check logs below)", flush=True)
    print(" Press Ctrl+C at any time to gracefully teardown both servers.", flush=True)
    print("=" * 60 + "\n", flush=True)
    
    # Keep the main thread alive to listen for Ctrl+C
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[SYSTEM] Received teardown signal (Ctrl+C).", flush=True)
        print("[SYSTEM] Shutting down backend and frontend...", flush=True)
        sys.exit(0)
