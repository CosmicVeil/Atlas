import os
import sys
import subprocess
import threading

def log_stream(stream, prefix):
    for line in iter(stream.readline, b''):
        try:
            decoded = line.decode('utf-8', errors='replace').strip()
            print(f"{prefix} {decoded}")
        except Exception:
            pass

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Check frontend dependencies
    frontend_dir = os.path.join(root_dir, 'frontend')
    node_modules = os.path.join(frontend_dir, 'node_modules')
    if not os.path.exists(node_modules):
        print("node_modules not found in frontend. Installing dependencies...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        subprocess.run([npm_cmd, "install"], cwd=frontend_dir)

    # 2. Determine backend python executable
    backend_dir = os.path.join(root_dir, 'backend')
    if sys.platform == "win32":
        python_exe = os.path.join(backend_dir, '.venv', 'Scripts', 'python.exe')
    else:
        python_exe = os.path.join(backend_dir, '.venv', 'bin', 'python')
        
    if not os.path.exists(python_exe):
        # Fallback to system python if venv not found
        python_exe = sys.executable

    print(f"Using Python executable: {python_exe}")
    
    # Start Backend Process
    backend_proc = subprocess.Popen(
        [python_exe, "wsgi.py"],
        cwd=backend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    
    # Start Frontend Process
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT
    )
    
    # Threads to read stdout/stderr from both processes
    t_backend = threading.Thread(target=log_stream, args=(backend_proc.stdout, "[BACKEND]"))
    t_frontend = threading.Thread(target=log_stream, args=(frontend_proc.stdout, "[FRONTEND]"))
    
    t_backend.daemon = True
    t_frontend.daemon = True
    
    t_backend.start()
    t_frontend.start()
    
    print("\n=======================================================")
    print("Application is starting!")
    print("Backend will run on http://localhost:5000")
    print("Frontend dev server will start up shortly.")
    print("Press Ctrl+C in this terminal to stop both servers.")
    print("=======================================================\n")
    
    try:
        # Keep main thread alive while subprocesses run
        while backend_proc.poll() is None and frontend_proc.poll() is None:
            try:
                backend_proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                pass
            try:
                frontend_proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                pass
    except KeyboardInterrupt:
        pass
    finally:
        print("\nStopping servers...")
        try:
            backend_proc.terminate()
        except Exception:
            pass
        try:
            frontend_proc.terminate()
        except Exception:
            pass
        backend_proc.wait()
        frontend_proc.wait()
        print("Application stopped successfully.")

if __name__ == '__main__':
    main()
