import os
import shutil
import socket
import subprocess
import sys
import threading
import time
from contextlib import closing
from pathlib import Path
from urllib import error, request


PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = PROJECT_ROOT / "react_frontend"


def resolve_rscript():
    from_path = shutil.which("Rscript") or shutil.which("Rscript.exe")
    if from_path:
        return from_path

    candidates = [
        r"C:\Program Files\R\R-4.5.2\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.5.2\bin\Rscript.exe",
        r"C:\Program Files\R\R-4.4.3\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.4.3\bin\Rscript.exe",
        r"C:\Program Files\R\R-4.4.2\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.4.2\bin\Rscript.exe",
        r"C:\Program Files\R\R-4.4.1\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.4.1\bin\Rscript.exe",
        r"C:\Program Files\R\R-4.4.0\bin\x64\Rscript.exe",
        r"C:\Program Files\R\R-4.4.0\bin\Rscript.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def resolve_npm():
    from_path = shutil.which("npm.cmd") or shutil.which("npm")
    if from_path:
        return from_path

    candidates = [
        r"C:\Program Files\nodejs\npm.cmd",
        r"C:\Program Files (x86)\nodejs\npm.cmd",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def is_port_free(port, host="127.0.0.1"):
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def find_free_port(preferred_port, host="127.0.0.1", max_tries=100):
    for candidate in range(preferred_port, preferred_port + max_tries):
        if is_port_free(candidate, host=host):
            return candidate
    raise RuntimeError(f"No free port found starting from {preferred_port}.")


def stream_output(process, prefix):
    if not process.stdout:
        return

    for line in process.stdout:
        print(f"{prefix} {line}", end="", flush=True)


def wait_for_http(url, timeout_seconds, process, service_name):
    deadline = time.time() + timeout_seconds
    last_error = None

    while time.time() < deadline:
        if process.poll() is not None:
            code = process.returncode
            return False, f"{service_name} exited early with code {code}."
        try:
            with request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return True, None
        except (error.HTTPError, error.URLError, TimeoutError) as exc:
            last_error = str(exc)
        time.sleep(0.5)

    if last_error:
        return False, f"{service_name} did not become ready in time. Last error: {last_error}"
    return False, f"{service_name} did not become ready in time."


def stop_process(process, name, grace_seconds=8):
    if process is None or process.poll() is not None:
        return

    print(f"[SYSTEM] Stopping {name} (pid {process.pid})...", flush=True)
    process.terminate()
    try:
        process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        print(f"[SYSTEM] {name} did not stop in {grace_seconds}s. Forcing kill...", flush=True)
        process.kill()
        process.wait(timeout=5)


def build_r_env():
    env = os.environ.copy()
    libs = [
        r"C:\Users\navee\AppData\Local\R\win-library\4.5",
        r"C:\Users\navee\Documents\R\win-library\4.5",
    ]
    current_libs = env.get("R_LIBS_USER", "")
    if current_libs:
        libs.append(current_libs)
    env["R_LIBS_USER"] = ";".join(libs)
    return env


def main():
    print("\n" + "=" * 60, flush=True)
    print(" Initializing Bayesian Lung Cancer Application", flush=True)
    print("=" * 60 + "\n", flush=True)

    rscript = resolve_rscript()
    if not rscript:
        print("[ERROR] Could not locate Rscript. Install R or add R/bin to PATH.", flush=True)
        return 1

    npm = resolve_npm()
    if not npm:
        print("[ERROR] Could not locate npm. Install Node.js and ensure npm is on PATH.", flush=True)
        return 1

    backend_port = find_free_port(8000)
    frontend_port = find_free_port(5173)

    if backend_port != 8000:
        print(f"[WARN] Port 8000 is busy. Using backend port {backend_port}.", flush=True)
    if frontend_port != 5173:
        print(f"[WARN] Port 5173 is busy. Using frontend port {frontend_port}.", flush=True)

    backend_env = build_r_env()
    backend_env["R_PLUMBER_PORT"] = str(backend_port)

    frontend_env = os.environ.copy()
    frontend_env["VITE_API_BASE_URL"] = f"http://127.0.0.1:{backend_port}"

    backend_process = None
    frontend_process = None

    try:
        print(f"Starting R Plumber API on port {backend_port}...", flush=True)
        backend_process = subprocess.Popen(
            [rscript, "run_api.R"],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=backend_env,
        )
        threading.Thread(
            target=stream_output,
            args=(backend_process, "[BACKEND R-API]"),
            daemon=True,
        ).start()

        backend_ready, backend_error = wait_for_http(
            url=f"http://127.0.0.1:{backend_port}/__docs__/",
            timeout_seconds=60,
            process=backend_process,
            service_name="Backend API",
        )
        if not backend_ready:
            print(f"[ERROR] {backend_error}", flush=True)
            return 1

        print(f"Starting React Frontend on port {frontend_port}...", flush=True)
        frontend_process = subprocess.Popen(
            [
                npm,
                "run",
                "dev",
                "--",
                "--host",
                "127.0.0.1",
                "--port",
                str(frontend_port),
                "--strictPort",
            ],
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=frontend_env,
        )
        threading.Thread(
            target=stream_output,
            args=(frontend_process, "[FRONTEND VITE]"),
            daemon=True,
        ).start()

        frontend_ready, frontend_error = wait_for_http(
            url=f"http://127.0.0.1:{frontend_port}/",
            timeout_seconds=60,
            process=frontend_process,
            service_name="Frontend server",
        )
        if not frontend_ready:
            print(f"[ERROR] {frontend_error}", flush=True)
            return 1

        print("\n" + "=" * 60, flush=True)
        print(" SUCCESS: Dual environments are running.", flush=True)
        print(f" Backend API  -> http://127.0.0.1:{backend_port}/predict", flush=True)
        print(f" Frontend App -> http://127.0.0.1:{frontend_port}/", flush=True)
        print(" Press Ctrl+C at any time to gracefully teardown both servers.", flush=True)
        print("=" * 60 + "\n", flush=True)

        while True:
            if backend_process.poll() is not None:
                print(
                    f"[ERROR] Backend API exited unexpectedly with code {backend_process.returncode}.",
                    flush=True,
                )
                return backend_process.returncode or 1
            if frontend_process.poll() is not None:
                print(
                    f"[ERROR] Frontend server exited unexpectedly with code {frontend_process.returncode}.",
                    flush=True,
                )
                return frontend_process.returncode or 1
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[SYSTEM] Received teardown signal (Ctrl+C).", flush=True)
        return 0
    finally:
        stop_process(frontend_process, "frontend server")
        stop_process(backend_process, "backend API")


if __name__ == "__main__":
    sys.exit(main())
