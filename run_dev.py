import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
VENV_DIR = ROOT / "venv"
DEV_STATE_FILE = ROOT / ".dev-servers.json"
NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"
BACKEND_PORT_DEFAULT = 8000
FRONTEND_PORT_DEFAULT = 5173


def resolve_project_python() -> Path:
    """Use project venv Python when available."""
    if os.name == "nt":
        venv_python = VENV_DIR / "Scripts" / "python.exe"
    else:
        venv_python = VENV_DIR / "bin" / "python"
    if venv_python.is_file():
        return venv_python
    return Path(sys.executable)


def ensure_venv() -> Path:
    """Create venv and install backend deps on first run."""
    python = resolve_project_python()
    if python.resolve() != Path(sys.executable).resolve():
        return python

    venv_marker = VENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if venv_marker.is_file():
        return python

    print("[setup] Creating Python virtual environment in venv/...", flush=True)
    subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], cwd=ROOT, check=True)

    python = resolve_project_python()
    print("[setup] Installing backend dependencies...", flush=True)
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", "requirements.txt"],
        cwd=BACKEND_DIR,
        check=True,
    )
    return python


def ensure_backend_deps(python: Path) -> None:
    check = subprocess.run(
        [str(python), "-c", "import uvicorn"],
        cwd=BACKEND_DIR,
        capture_output=True,
    )
    if check.returncode != 0:
        print("[setup] Installing backend dependencies...", flush=True)
        subprocess.run(
            [str(python), "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=BACKEND_DIR,
            check=True,
        )


def ensure_backend_env() -> bool:
    for env_name in ("dev.env", ".env"):
        if (BACKEND_DIR / env_name).is_file():
            return True

    example = BACKEND_DIR / ".env.example"
    if example.is_file():
        print(
            "[error] Backend env not found. Copy backend/.env.example to backend/dev.env "
            "and add your credentials.",
            flush=True,
        )
    else:
        print(
            "[error] Backend env not found. Create backend/dev.env with API_KEY.",
            flush=True,
        )
    return False


def ensure_frontend_env() -> None:
    env_file = FRONTEND_DIR / ".env"
    example = FRONTEND_DIR / ".env.example"
    if not env_file.is_file() and example.is_file():
        shutil.copy(example, env_file)
        print("[setup] Created frontend/.env from .env.example", flush=True)


def ensure_frontend_deps() -> None:
    node_modules = FRONTEND_DIR / "node_modules"
    if node_modules.exists():
        return
    print("[setup] Installing frontend dependencies...", flush=True)
    subprocess.run([NPM_CMD, "install"], cwd=FRONTEND_DIR, check=True)


def check_node_installed() -> bool:
    try:
        subprocess.run(
            [NPM_CMD, "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(
            "[error] Node.js/npm not found. Install from https://nodejs.org/ "
            "or use --api-only for backend only.",
            flush=True,
        )
        return False


def stream_output(prefix: str, process: subprocess.Popen) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{prefix}] {line.rstrip()}", flush=True)


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def pids_listening_on_port(port: int) -> list[int]:
    pids: list[int] = []
    if os.name == "nt":
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    f"Get-NetTCPConnection -LocalPort {port} -State Listen "
                    "-ErrorAction SilentlyContinue | "
                    "Select-Object -ExpandProperty OwningProcess -Unique"
                ),
            ],
            capture_output=True,
            text=True,
            errors="replace",
        )
        for token in result.stdout.split():
            if token.isdigit():
                pid = int(token)
                if pid not in pids:
                    pids.append(pid)
        if not pids:
            netstat = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True,
                errors="replace",
            )
            port_token = f":{port}"
            for line in netstat.stdout.splitlines():
                if "LISTENING" not in line or port_token not in line:
                    continue
                parts = line.split()
                if parts and parts[-1].isdigit():
                    pid = int(parts[-1])
                    if pid not in pids:
                        pids.append(pid)
    else:
        result = subprocess.run(
            ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            errors="replace",
        )
        for token in result.stdout.split():
            if token.isdigit():
                pid = int(token)
                if pid not in pids:
                    pids.append(pid)
    return pids


def process_command_line(pid: int) -> str:
    if os.name == "nt":
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine",
            ],
            capture_output=True,
            text=True,
            errors="replace",
        )
        return (result.stdout or "").strip()
    proc_cmdline = Path(f"/proc/{pid}/cmdline")
    if proc_cmdline.is_file():
        return proc_cmdline.read_text(errors="replace").replace("\x00", " ")
    return ""


def process_name(pid: int) -> str:
    if os.name == "nt":
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"(Get-Process -Id {pid} -ErrorAction SilentlyContinue).ProcessName",
            ],
            capture_output=True,
            text=True,
            errors="replace",
        )
        return (result.stdout or "").strip()
    proc_comm = Path(f"/proc/{pid}/comm")
    if proc_comm.is_file():
        return proc_comm.read_text(errors="replace").strip()
    return ""


def is_stale_dev_process(command_line: str, pid: int, port: int) -> bool:
    """Return True only for known dev-server processes, never the current runner."""
    if pid <= 0 or pid == os.getpid():
        return False

    state = load_dev_state()
    saved_pids = {state.get("backend_pid"), state.get("frontend_pid")}
    if pid in saved_pids:
        return True

    cmd = (command_line or "").lower()
    root = str(ROOT).lower()
    backend = str(BACKEND_DIR).lower()
    frontend = str(FRONTEND_DIR).lower()

    if port == BACKEND_PORT_DEFAULT:
        if "uvicorn" in cmd and "app.main" in cmd:
            return True
        if backend in cmd and "uvicorn" in cmd:
            return True
        return False

    if port == FRONTEND_PORT_DEFAULT:
        if "vite" in cmd and (frontend in cmd or "upsc-frontend" in cmd):
            return True
        if frontend in cmd and ("vite" in cmd or "npm" in cmd):
            return True
        return False

    if "run_dev.py" in cmd and root in cmd:
        return True

    return False


def kill_process_tree(pid: int) -> None:
    if pid <= 0:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/PID", str(pid), "/T"],
            capture_output=True,
            text=True,
            errors="replace",
        )
    else:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                os.kill(pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                pass


def load_dev_state() -> dict:
    if not DEV_STATE_FILE.is_file():
        return {}
    try:
        import json

        return json.loads(DEV_STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_dev_state(backend_pid: int | None, frontend_pid: int | None, backend_port: int, frontend_port: int) -> None:
    import json

    DEV_STATE_FILE.write_text(
        json.dumps(
            {
                "backend_pid": backend_pid,
                "frontend_pid": frontend_pid,
                "backend_port": backend_port,
                "frontend_port": frontend_port,
            }
        ),
        encoding="utf-8",
    )


def clear_dev_state() -> None:
    if DEV_STATE_FILE.is_file():
        DEV_STATE_FILE.unlink(missing_ok=True)


def stop_saved_dev_servers() -> None:
    state = load_dev_state()
    for key in ("backend_pid", "frontend_pid"):
        pid = state.get(key)
        if isinstance(pid, int) and pid > 0:
            kill_process_tree(pid)
    if state:
        time.sleep(0.75)


def find_stale_dev_pids() -> list[int]:
    import json

    stale: list[int] = []
    if os.name != "nt":
        return stale

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                "Get-CimInstance Win32_Process -Filter "
                "\"Name='python.exe' OR Name='pythonw.exe' OR Name='node.exe'\" "
                "| Select-Object ProcessId, CommandLine "
                "| ConvertTo-Json -Compress"
            ),
        ],
        capture_output=True,
        text=True,
        errors="replace",
    )
    if not result.stdout.strip():
        return stale

    try:
        processes = json.loads(result.stdout)
    except json.JSONDecodeError:
        return stale

    if isinstance(processes, dict):
        processes = [processes]

    for item in processes:
        pid = item.get("ProcessId")
        cmd = item.get("CommandLine") or ""
        if not isinstance(pid, int) or pid == os.getpid():
            continue
        if is_stale_dev_process(cmd, pid, BACKEND_PORT_DEFAULT) or is_stale_dev_process(
            cmd, pid, FRONTEND_PORT_DEFAULT
        ):
            stale.append(pid)
    return stale


def wait_for_port_free(port: int, timeout: float = 12.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not is_port_in_use(port):
            return True
        time.sleep(0.35)
    return not is_port_in_use(port)


def free_stale_dev_port(port: int, label: str) -> bool:
    """Stop dev processes bound to `port` and wait until the port is free."""
    for attempt in range(1, 6):
        listener_pids = pids_listening_on_port(port)
        if not listener_pids:
            return True

        stopped_any = False
        blocked = False

        for pid in listener_pids:
            if pid == os.getpid():
                continue
            cmd = process_command_line(pid)
            if is_stale_dev_process(cmd, pid, port):
                print(
                    f"[runner] Stopping previous {label} on port {port} (PID {pid})...",
                    flush=True,
                )
                kill_process_tree(pid)
                stopped_any = True
            else:
                blocked = True

        if blocked:
            return False

        if stopped_any and wait_for_port_free(port):
            return True

        if not is_port_in_use(port):
            return True

        if attempt < 5:
            print(
                f"[runner] Waiting for port {port} to become free (attempt {attempt}/5)...",
                flush=True,
            )
            time.sleep(0.75)

    return not is_port_in_use(port)


def ensure_dev_ports_available(backend_port: int, frontend_port: int, api_only: bool) -> bool:
    stop_saved_dev_servers()

    ports: list[tuple[int, str]] = [(backend_port, "backend")]
    if not api_only:
        ports.append((frontend_port, "frontend"))

    for port, label in ports:
        if not is_port_in_use(port):
            continue
        if free_stale_dev_port(port, label):
            print(f"[runner] Port {port} is ready for {label}.", flush=True)
            continue
        pid_list = pids_listening_on_port(port)
        pid_hint = f" (PID {pid_list[0]})" if pid_list else ""
        print(
            f"[error] Port {port} is still in use{pid_hint} by another application.",
            flush=True,
        )
        if pid_list:
            if os.name == "nt":
                print(f"        Free it with: taskkill /F /PID {pid_list[0]} /T", flush=True)
            else:
                print(f"        Free it with: kill -9 {pid_list[0]}", flush=True)
        print(
            f"        Then run: npm start",
            flush=True,
        )
        return False
    return True


def wait_for_port(port: int, timeout: float = 90.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_port_in_use(port):
            return True
        time.sleep(0.25)
    return False


def subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    if os.name == "nt":
        env["PYTHONUTF8"] = "1"
    return env


def subprocess_flags() -> int:
    if os.name == "nt":
        return subprocess.CREATE_NEW_PROCESS_GROUP
    return 0


def print_startup_banner(backend_port: int, frontend_port: int) -> None:
    print("", flush=True)
    print("=" * 52, flush=True)
    print("  UPSC App - development servers running", flush=True)
    print("=" * 52, flush=True)
    print(f"  App UI:   http://localhost:{frontend_port}", flush=True)
    print(f"  API:      http://localhost:{backend_port}", flush=True)
    print(f"  API docs: http://localhost:{backend_port}/docs", flush=True)
    print("", flush=True)
    print("  Press Ctrl+C to stop both servers.", flush=True)
    print("=" * 52, flush=True)
    print("", flush=True)


def run_api_only(port: int, python: Path) -> int:
    if not ensure_dev_ports_available(port, FRONTEND_PORT_DEFAULT, api_only=True):
        return 1

    ensure_backend_deps(python)
    print(f"Backend API: http://localhost:{port}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    return subprocess.call(
        [
            str(python),
            "-u",
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(port),
            "--reload",
        ],
        cwd=BACKEND_DIR,
        env=subprocess_env(),
    )


def stop_dev_servers() -> int:
    """Stop saved and stale dev-server processes."""
    print("[runner] Stopping development servers...", flush=True)
    stop_saved_dev_servers()
    stopped = 0
    for port, label in ((BACKEND_PORT_DEFAULT, "backend"), (FRONTEND_PORT_DEFAULT, "frontend")):
        for pid in pids_listening_on_port(port):
            if pid == os.getpid():
                continue
            cmd = process_command_line(pid)
            if is_stale_dev_process(cmd, pid, port):
                print(f"[runner] Stopping {label} on port {port} (PID {pid})...", flush=True)
                kill_process_tree(pid)
                stopped += 1
    clear_dev_state()
    wait_for_port_free(BACKEND_PORT_DEFAULT, timeout=6.0)
    wait_for_port_free(FRONTEND_PORT_DEFAULT, timeout=6.0)
    print("[runner] Development servers stopped.", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the UPSC app (FastAPI backend + React frontend)."
    )
    parser.add_argument("--api-only", action="store_true", help="Start FastAPI backend only")
    parser.add_argument("--stop", action="store_true", help="Stop running dev servers")
    parser.add_argument("--backend-port", type=int, default=BACKEND_PORT_DEFAULT)
    parser.add_argument("--frontend-port", type=int, default=FRONTEND_PORT_DEFAULT)
    args = parser.parse_args()

    if args.stop:
        return stop_dev_servers()

    if not BACKEND_DIR.exists():
        print("[error] backend/ directory not found.", flush=True)
        return 1

    python = ensure_venv()
    if python.resolve() != Path(sys.executable).resolve():
        print(f"[setup] Using project Python: {python}", flush=True)

    if not ensure_backend_env():
        return 1

    if args.api_only:
        return run_api_only(args.backend_port, python)

    if not FRONTEND_DIR.exists():
        print("[error] frontend/ directory not found.", flush=True)
        return 1

    if not check_node_installed():
        return 1

    if not ensure_dev_ports_available(args.backend_port, args.frontend_port, api_only=False):
        return 1

    ensure_backend_deps(python)
    ensure_frontend_env()
    ensure_frontend_deps()

    backend_cmd = [
        str(python),
        "-u",
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(args.backend_port),
        "--reload",
    ]
    frontend_cmd = [
        NPM_CMD,
        "run",
        "dev",
        "--",
        "--host",
        "0.0.0.0",
        "--port",
        str(args.frontend_port),
    ]

    creationflags = subprocess_flags()
    env = subprocess_env()

    backend = subprocess.Popen(
        backend_cmd,
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
        creationflags=creationflags,
    )
    try:
        frontend = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            creationflags=creationflags,
        )
    except Exception:
        if backend.poll() is None:
            backend.terminate()
        raise

    import threading

    backend_thread = threading.Thread(
        target=stream_output, args=("backend", backend), daemon=True
    )
    frontend_thread = threading.Thread(
        target=stream_output, args=("frontend", frontend), daemon=True
    )
    backend_thread.start()
    frontend_thread.start()

    save_dev_state(backend.pid, frontend.pid, args.backend_port, args.frontend_port)

    print("[runner] Starting backend and frontend...", flush=True)
    backend_ready = wait_for_port(args.backend_port)
    frontend_ready = wait_for_port(args.frontend_port)

    if not backend_ready or not frontend_ready:
        print("[error] Timed out waiting for servers to start.", flush=True)
        clear_dev_state()
        for proc in (backend, frontend):
            if proc.poll() is None:
                proc.terminate()
        return 1

    print_startup_banner(args.backend_port, args.frontend_port)

    try:
        while True:
            if backend.poll() is not None:
                print("[runner] Backend exited. Stopping frontend...", flush=True)
                break
            if frontend.poll() is not None:
                print("[runner] Frontend exited. Stopping backend...", flush=True)
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[runner] Stopping services...", flush=True)
    finally:
        clear_dev_state()

    for proc in (backend, frontend):
        if proc.poll() is None:
            if os.name == "nt":
                proc.send_signal(signal.CTRL_BREAK_EVENT)
                time.sleep(0.5)
            proc.terminate()

    for proc in (backend, frontend):
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
