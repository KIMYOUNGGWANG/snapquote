import sys
import os

MAX_LINES = 100

def check_file(filepath):
    """Checks if a file exceeds complexity limits."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            if len(lines) > MAX_LINES:
                return f"[WARNING] {filepath} has {len(lines)} lines (Limit: {MAX_LINES}). Consider splitting."
        return None
    except Exception:
        return None

def main():
    print("Checking code complexity...")
    issues = []
    
    # Simple recursive walk
    for root, dirs, files in os.walk("."):
        if "node_modules" in root or ".git" in root:
            continue
            
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.jsx', '.py')):
                result = check_file(os.path.join(root, file))
                if result:
                    issues.append(result)
                    
    if issues:
        print(f"Found {len(issues)} complexity issues:")
        for issue in issues:
            print(issue)
        # We don't exit 1 here because it's just a warning
    else:
        print("code complexity looks good.")

if __name__ == "__main__":
    main()
