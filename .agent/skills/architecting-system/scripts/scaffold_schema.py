import sys
import os

TEMPLATE = """erDiagram
    USER ||--o{ POST : writes
    USER {
        string id PK
        string email
        string password_hash
    }
    POST {
        string id PK
        string title
        string content
        string author_id FK
    }
"""

def main():
    if len(sys.argv) < 2:
        filename = "schema.mermaid"
    else:
        filename = sys.argv[1]
        
    if os.path.exists(filename):
        print(f"[ERROR] {filename} already exists.")
        sys.exit(1)
        
    with open(filename, "w") as f:
        f.write(TEMPLATE)
        
    print(f"✅ Created ERD template: {filename}")
    print("Run 'mmdc -i schema.mermaid -o schema.png' to visualize (if installed).")

if __name__ == "__main__":
    main()
