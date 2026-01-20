---
description: Git branching strategy for feature development
---
# Git Feature Branch Workflow

## Branch Naming Convention
```
feature/[ticket-or-short-name]
```

Examples:
- `feature/auth-login`
- `feature/analytics-dashboard`
- `feature/client-management`

## Workflow Steps

// turbo-all

1. Create feature branch from main
```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

2. Develop and commit changes
```bash
git add -A
git commit -m "feat: description of change"
```

3. Push feature branch to remote
```bash
git push -u origin feature/your-feature-name
```

4. Create Pull Request on GitHub
- Go to GitHub repo
- Create PR: feature/your-feature-name → main
- Request review if needed

5. After approval, merge to main
```bash
git checkout main
git pull origin main
git merge feature/your-feature-name
git push origin main
```

6. Delete feature branch (cleanup)
```bash
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

## Commit Message Convention
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `docs:` - Documentation
- `style:` - Formatting, no code change
- `test:` - Adding tests
