import os
import re
import sys

# Regex patterns for common secrets
PATTERNS = {
    'AWS Key': r'AKIA[0-9A-Z]{16}',
    'Private Key': r'-----BEGIN PRIVATE KEY-----',
    'Generic Token': r'(api_key|access_token|secret_key)[\s]*=[\s]*[\'"][a-zA-Z0-9_\-]{20,}[\'"]',
}

def scan_file(filepath):
    """Scans a single file for secrets."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            for name, pattern in PATTERNS.items():
                if re.search(pattern, content):
                    return f"[FAIL] Found {name} in {filepath}"
        return None
    except Exception as e:
        return f"[WARN] Could not read {filepath}: {e}"

def main():
    """Scans the current directory recursively."""
    print("Locked on target. Scanning for secrets...")
    root_dir = os.getcwd()
    issues = []

    for root, dirs, files in os.walk(root_dir):
        # Skip hidden folders and node_modules
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
        
        for file in files:
            filepath = os.path.join(root, file)
            result = scan_file(filepath)
            if result:
                issues.append(result)

    if issues:
        print(f"\nFound {len(issues)} security issues:")
        for issue in issues:
            print(issue)
        sys.exit(1)
    else:
        print("\nAll Clear. No secrets found.")
        sys.exit(0)

if __name__ == "__main__":
    main()
