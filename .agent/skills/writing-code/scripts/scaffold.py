import sys
import os

def create_component(name):
    """Creates a React component with boilerplate."""
    content = f"""import React from 'react';

interface {name}Props {{
  // define props
}}

export const {name}: React.FC<{name}Props> = (props) => {{
  return (
    <div className="flex flex-col gap-4">
      {name} Component
    </div>
  );
}};
"""
    filename = f"{name}.tsx"
    if os.path.exists(filename):
        print(f"[ERROR] {filename} already exists.")
        sys.exit(1)
        
    with open(filename, "w") as f:
        f.write(content)
    print(f"✅ Created component: {filename}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python scaffold.py [type] [name]")
        print("Types: component, hook, api")
        sys.exit(1)
        
    scaffold_type = sys.argv[1]
    name = sys.argv[2]
    
    if scaffold_type == "component":
        create_component(name)
    else:
        print(f"[ERROR] Unknown type: {scaffold_type}")
        sys.exit(1)

if __name__ == "__main__":
    main()
