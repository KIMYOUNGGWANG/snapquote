import os
import sys

REQUIRED_DOCS = [
    "README.md"
]

def main():
    missing = []
    for doc in REQUIRED_DOCS:
        if not os.path.exists(doc):
            missing.append(doc)
            
    if missing:
        print(f"[FAIL] Missing required documentation: {', '.join(missing)}")
        print("Please create these files immediately.")
        sys.exit(1)
        
    print("✅ All required documentation present.")
    
    # Optional: Check if README is too short
    try:
        with open("README.md", "r") as f:
            content = f.read()
            if len(content) < 100:
                print("[WARN] README.md seems too short (< 100 chars). Expand it.")
    except Exception:
        pass

if __name__ == "__main__":
    main()
