#!/usr/bin/env python3
import sys
import os
import time

# ANSI colors
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header():
    print(f"{Colors.HEADER}============================================================{Colors.ENDC}")
    print(f"{Colors.HEADER}       🚀 Dual AI Agile Development System (Antigravity) 🚀      {Colors.ENDC}")
    print(f"{Colors.HEADER}============================================================{Colors.ENDC}")
    print(f"{Colors.CYAN}   Manager (PM/QA/Audit): Antigravity System (Skills){Colors.ENDC}")
    print(f"{Colors.BLUE}   Builder (Dev/Arch):    Antigravity Agent (Action){Colors.ENDC}")
    print(f"{Colors.HEADER}============================================================{Colors.ENDC}")
    print("")

def print_menu():
    print(f"{Colors.BOLD}📋 Agile Sprint Menu{Colors.ENDC}")
    print("")
    
    print(f"  {Colors.WARNING}[ Planning ]{Colors.ENDC}")
    print(f"  [1] Sprint Planning     {Colors.CYAN}(→ /plan 'Sprint Goal'){Colors.ENDC}")
    print(f"  [2] User Story Creation {Colors.CYAN}(→ /ideate 'Feature'){Colors.ENDC}")
    print("")
    
    print(f"  {Colors.WARNING}[ Design ]{Colors.ENDC}")
    print(f"  [3] Architecture/Design {Colors.CYAN}(→ /architect 'Spec'){Colors.ENDC}")
    print("")
    
    print(f"  {Colors.WARNING}[ Development ]{Colors.ENDC}")
    print(f"  [4] Feature Development {Colors.CYAN}(→ /develop 'Feature'){Colors.ENDC}")
    print(f"  [5] Bug Fix             {Colors.CYAN}(→ /fix 'Bug Description'){Colors.ENDC}")
    print(f"  [6] Refactoring         {Colors.CYAN}(→ /refactor 'Target'){Colors.ENDC}")
    print("")
    
    print(f"  {Colors.WARNING}[ Quality ]{Colors.ENDC}")
    print(f"  [7] Run Tests           {Colors.CYAN}(→ /test 'Scope'){Colors.ENDC}")
    print(f"  [8] Code Review         {Colors.CYAN}(→ /review){Colors.ENDC}")
    print("")
    
    print(f"  {Colors.WARNING}[ Release ]{Colors.ENDC}")
    print(f"  [9] Deployment Prep     {Colors.CYAN}(→ /ship 'Version'){Colors.ENDC}")
    print(f"  [R] Retrospective       {Colors.CYAN}(→ /retro){Colors.ENDC}")
    print("")
    
    print(f"  [0] Exit")
    print(f"============================================================")

def handle_choice(choice):
    if choice == '1':
        print(f"\n{Colors.GREEN}👉 To Start Sprint Planning, type to Agent:{Colors.ENDC}")
        print(f"{Colors.BOLD}/plan 'Sprint 1: [Goal]'{Colors.ENDC}")
    elif choice == '2':
        print(f"\n{Colors.GREEN}👉 To Create User Stories, type to Agent:{Colors.ENDC}")
        print(f"{Colors.BOLD}/ideate 'User stories for [Feature]'{Colors.ENDC}")
    elif choice == '3':
        print(f"\n{Colors.GREEN}👉 For Architecture Design, type to Agent:{Colors.ENDC}")
        print(f"{Colors.BOLD}/architect '[Requirements]'{Colors.ENDC}")
    elif choice == '4':
        print(f"\n{Colors.GREEN}👉 For Development, REMEMBER to check branch first!{Colors.ENDC}")
        print(f"{Colors.BOLD}/develop '[Feature Name]'{Colors.ENDC}")
    elif choice == '5':
        print(f"\n{Colors.GREEN}👉 For Quick Fixes:{Colors.ENDC}")
        print(f"{Colors.BOLD}/fix '[What to fix]'{Colors.ENDC}")
    elif choice == '6':
        print(f"\n{Colors.GREEN}👉 For Refactoring:{Colors.ENDC}")
        print(f"{Colors.BOLD}Can you refactor [File/Component] to improve [Metric]?{Colors.ENDC}")
    elif choice == '7':
        print(f"\n{Colors.GREEN}👉 To Run Tests:{Colors.ENDC}")
        print(f"{Colors.BOLD}/test all{Colors.ENDC}")
    elif choice == '8':
        print(f"\n{Colors.GREEN}👉 For Code Review:{Colors.ENDC}")
        print(f"{Colors.BOLD}/review{Colors.ENDC}")
    elif choice == '9':
        print(f"\n{Colors.GREEN}👉 For Full Release (Ship):{Colors.ENDC}")
        print(f"{Colors.BOLD}/ship '[Feature Name]'{Colors.ENDC}")
    elif choice.lower() == 'r':
        print(f"\n{Colors.GREEN}👉 For Retrospective:{Colors.ENDC}")
        print(f"{Colors.BOLD}Lets do a retrospective on the last task. What went well?{Colors.ENDC}")
    elif choice == '0':
        print("\nExiting...")
        sys.exit(0)
    else:
        print("\nInvalid selection.")

    print("\n(Press Enter to return to menu)")
    input()

def main():
    while True:
        clear_screen()
        print_header()
        print_menu()
        choice = input(f"{Colors.BOLD}Select an option > {Colors.ENDC}")
        handle_choice(choice)

if __name__ == "__main__":
    main()
