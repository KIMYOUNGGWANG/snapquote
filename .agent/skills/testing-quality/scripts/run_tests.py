import subprocess
import os
import sys
import json

def detect_runner():
    """Detects available test runners in the current environment."""
    if os.path.exists("package.json"):
        with open("package.json") as f:
            pkg = json.load(f)
            if "scripts" in pkg and "test" in pkg["scripts"]:
                return "npm test"
            if "devDependencies" in pkg:
                if "vitest" in pkg["devDependencies"]:
                    return "npx vitest run"
                if "jest" in pkg["devDependencies"]:
                    return "npx jest"
    
    if os.path.exists("go.mod"):
        return "go test ./..."
    
    if os.path.exists("requirements.txt") or os.path.exists("pyproject.toml"):
        return "pytest"
        
    return None

def run_tests():
    cmd = detect_runner()
    if not cmd:
        print("[ERROR] No test runner detected. Please verify your setup.")
        sys.exit(1)
        
    print(f"🚀 Executing tests using: {cmd}...")
    
    try:
        # Run the tests and stream output
        process = subprocess.run(cmd, shell=True, check=False)
        
        if process.returncode == 0:
            print("\n✅ All tests passed!")
            sys.exit(0)
        else:
            print(f"\n❌ Tests failed with exit code {process.returncode}")
            sys.exit(1)
            
    except Exception as e:
        print(f"[FATAL] Failed to execute runner: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
