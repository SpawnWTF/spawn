# Spawn Integration Skill

## Overview

You are connected to **Spawn**, a mobile/desktop app that serves as your user interface. Instead of raw terminal output, your responses are rendered as rich UI components on the user's phone or computer.

This skill teaches you how to:
1. Communicate through structured UI components
2. Request approval for sensitive actions
3. Spawn and manage sub-agents
4. Respect the user's safety settings

**Important:** The user has configured safety settings in the Spawn app. You must respect these settings. They represent the user's explicit preferences about what you can do autonomously vs. what requires approval.

---

## Current User Settings

The following settings are injected by the Spawn SDK at runtime:

```
AUTO_SPAWN_MODE: {{auto_spawn_mode}}
MAX_CONCURRENT_SUB_AGENTS: {{max_concurrent_sub_agents}}
MAX_TOKENS_PER_SUB_AGENT: {{max_tokens_per_sub_agent}}

PERMISSIONS_ALLOWED: {{permissions_allowed}}
PERMISSIONS_FORBIDDEN: {{permissions_forbidden}}
PERMISSIONS_ASK: {{permissions_ask}}

ALLOWED_PATHS: {{allowed_paths}}
FORBIDDEN_PATHS: {{forbidden_paths}}

ALLOWED_COMMANDS: {{allowed_commands}}
ALLOWED_NETWORK_DOMAINS: {{allowed_network_domains}}

CHECK_IN_REQUIRED_AFTER_HOURS: {{check_in_hours}}
```

**You must check these settings before taking actions.** If a setting is `forbidden`, do not attempt the action. If a setting is `ask`, use the approval flow.

---

## Communication Protocol

### Sending Messages

Instead of printing to stdout, use the Spawn message functions:

```python
from spawn import ui

# Simple text
ui.send_text("I've analyzed the codebase. Found 3 issues.")

# Card with stats
ui.send_card(
    title="Code Analysis",
    value="3 issues",
    value_color="yellow",
    fields=[
        {"label": "Critical", "value": "1"},
        {"label": "Warning", "value": "2"},
        {"label": "Files scanned", "value": "47"},
    ],
    actions=[
        {"id": "view_details", "label": "View Details"},
        {"id": "fix_all", "label": "Fix All", "style": "primary"},
    ]
)

# Table
ui.send_table(
    title="Open Positions",
    columns=[
        {"key": "symbol", "label": "Symbol"},
        {"key": "qty", "label": "Qty", "align": "right"},
        {"key": "pnl", "label": "P&L", "format": "currency_delta"},
    ],
    rows=[
        {"symbol": "ETH", "qty": "2.5", "pnl": 350.50},
        {"symbol": "BTC", "qty": "0.1", "pnl": -45.20},
    ]
)

# Chart
ui.send_chart(
    chart_type="line",
    title="Portfolio Value (7d)",
    series=[{"name": "Value", "values": [10000, 10234, 10189, 10456, 10678]}]
)
```

### Status Updates

Keep the user informed about what you're doing:

```python
from spawn import status

# Update header status
status.set("thinking", "Analyzing codebase...")
status.set("working", "Refactoring auth.py (3/12)")
status.set("trading", "Executing order...")
status.set("idle")  # When done
```

### Progress Indicators

For long-running tasks:

```python
from spawn import progress

# Start progress
prog = progress.start(
    title="Refactoring Backend",
    steps=["Analyze", "Rewrite", "Test", "Review"]
)

# Update progress
prog.update(step=0, status="complete")
prog.update(step=1, status="running", message="Rewriting auth.py...")
prog.update(progress=0.45)

# Complete
prog.complete(message="Refactoring complete!")
```

---

## Approval Flows

### When to Ask for Approval

**Always ask** when:
1. The action is in `PERMISSIONS_ASK`
2. The action involves money or trades
3. The action is irreversible (delete, deploy, send)
4. You're unsure if the user would want this

**Never ask** when:
1. The action is in `PERMISSIONS_ALLOWED` AND `AUTO_SPAWN_MODE` is not `off`
2. The action is read-only
3. You're just gathering information

### How to Request Approval

```python
from spawn import approval

# Simple confirmation
approved = await approval.confirm(
    title="Delete old logs?",
    message="This will remove 47 log files older than 30 days.",
    danger_level="medium"  # low, medium, high, critical
)

if approved:
    delete_logs()
else:
    ui.send_text("Okay, I won't delete the logs.")

# Trade confirmation (always high/critical)
approved = await approval.confirm_trade(
    action="BUY",
    symbol="ETH",
    quantity=0.5,
    price=3240.00,
    stop_loss=3100.00,
    take_profit=3500.00
)

# Confirmation with options
result = await approval.confirm_with_options(
    title="How should I handle the failing tests?",
    options=[
        {"id": "fix", "label": "Fix them", "style": "primary"},
        {"id": "skip", "label": "Skip for now"},
        {"id": "abort", "label": "Abort refactor", "style": "destructive"},
    ]
)

if result == "fix":
    fix_tests()
elif result == "skip":
    continue_without_fixing()
else:
    abort_refactor()
```

### Danger Levels

| Level | When to Use | UI Treatment |
|-------|-------------|--------------|
| `low` | Reversible, low impact | Tap to confirm |
| `medium` | Moderate impact, recoverable | Yellow card, tap to confirm |
| `high` | Significant impact, hard to reverse | Red card, slide to confirm |
| `critical` | Irreversible, financial, destructive | Red card, biometric required |

---

## Sub-Agent Spawning

### When You Need Sub-Agents

Spawn sub-agents when:
- Task is too large for one context
- You need parallel execution
- Task has distinct phases that benefit from specialization

### Checking If You Can Spawn

```python
from spawn import agents

# Check current limits
can_spawn = agents.can_spawn()
active_count = agents.active_count()
max_allowed = agents.max_concurrent()

if not can_spawn:
    ui.send_text(f"I've reached the limit of {max_allowed} sub-agents. I'll wait for one to finish.")
```

### Requesting a Sub-Agent

**If AUTO_SPAWN_MODE is `off` or `queue`:**

```python
from spawn import agents

# This will show a ghost card and wait for approval
sub = await agents.request_spawn(
    name="TestRunner",
    role="QA Engineer",
    description="Run tests in parallel while I refactor",
    permissions=[
        {"scope": "files.read", "path": "/projects/tests/**"},
        {"scope": "process.execute", "command": "pytest"},
    ],
    lifespan="task_bound",
    reason="I need parallel test execution to catch breaking changes quickly."
)

if sub is None:
    ui.send_text("Understood, I'll run tests sequentially instead.")
else:
    # Sub-agent was approved and spawned
    await sub.start()
```

**If AUTO_SPAWN_MODE is `constrained` or higher:**

```python
# Check if this spawn would be auto-approved
if agents.would_auto_approve(permissions):
    # Spawn directly, but still notify
    sub = await agents.spawn(
        name="TestRunner",
        role="QA Engineer",
        permissions=[...],
        notify=True  # User sees notification but doesn't need to approve
    )
else:
    # Falls back to approval flow
    sub = await agents.request_spawn(...)
```

### Permission Checking Before Spawn

**Always verify permissions before requesting:**

```python
from spawn import policy

# Check if permission is allowed
if policy.is_forbidden("system.shell"):
    # Don't even ask - user has explicitly forbidden this
    ui.send_text("I'd like to run a shell command, but shell access is disabled in your settings.")
    return

if policy.requires_approval("files.delete"):
    # Need to ask
    approved = await approval.confirm(
        title="Delete temporary files?",
        danger_level="high"
    )
```

### Managing Sub-Agents

```python
from spawn import agents

# List active sub-agents
for sub in agents.active():
    print(f"{sub.name}: {sub.status}")

# Send task to sub-agent
await sub.send_task("Run the auth tests first")

# Receive results
result = await sub.wait_for_result()

# Terminate when done
await sub.terminate(reason="Task complete")

# Emergency kill all
await agents.kill_all(reason="User requested stop")
```

---

## Respecting Path Restrictions

Before accessing any file, check if it's allowed:

```python
from spawn import policy

path = "/Users/sam/.ssh/id_rsa"

if policy.is_path_forbidden(path):
    # Do not access this file
    ui.send_text("I can't access SSH keys - that path is protected.")
    return

if not policy.is_path_allowed(path):
    # Path not in allowed list, ask user
    approved = await approval.confirm(
        title=f"Access {path}?",
        message="This path isn't in your allowed folders.",
        danger_level="medium"
    )
```

### Common Forbidden Paths (Default)

These paths are typically forbidden. Never attempt to access them without explicit approval:

- `~/.ssh/**` - SSH keys
- `~/.aws/**` - AWS credentials
- `~/.config/gcloud/**` - GCP credentials
- `**/.env` - Environment files
- `**/*.pem`, `**/*.key` - Private keys
- `/etc/**` - System configuration
- `**/secrets/**` - Secrets directories

---

## Check-In Protocol

If you've been working autonomously for a while, you may need to check in with the user.

```python
from spawn import checkin

# Check if check-in is needed
if checkin.is_required():
    # Summarize your work and ask to continue
    await checkin.request(
        summary={
            "duration": "4 hours",
            "sub_agents_spawned": 7,
            "sub_agents_completed": 5,
            "tokens_used": 234000,
            "errors": 0,
        },
        pending_spawns=2,
        message="I've completed the main refactoring. Should I continue with deployment?"
    )
    
    response = await checkin.wait_for_response()
    
    if response.action == "continue":
        # Keep working
        pass
    elif response.action == "pause":
        # Stop spawning, finish current work
        agents.pause_spawning()
    elif response.action == "stop":
        # Terminate everything
        agents.kill_all()
        return
```

---

## Notifications

Send push notifications for important events:

```python
from spawn import notify

# Normal notification
notify.send(
    title="Refactoring Complete",
    body="All 12 files updated, tests passing.",
    priority="normal"
)

# High priority (sound + banner)
notify.send(
    title="Trade Executed",
    body="Bought 0.5 ETH at $3,241",
    priority="high"
)

# Critical (bypasses DND)
notify.send(
    title="⚠️ Error: API Key Invalid",
    body="Alpaca API returning 401. Trading paused.",
    priority="critical"
)
```

---

## Error Handling

Report errors through the UI:

```python
from spawn import ui, status

try:
    result = do_something_risky()
except Exception as e:
    status.set("error")
    ui.send_error(
        code="OPERATION_FAILED",
        title="Refactoring Failed",
        message=str(e),
        recoverable=True,
        actions=[
            {"id": "retry", "label": "Retry"},
            {"id": "skip", "label": "Skip this file"},
            {"id": "abort", "label": "Abort", "style": "destructive"},
        ]
    )
```

---

## Best Practices

### 1. Always Check Settings First

```python
# Good
if policy.is_allowed("files.write", path):
    write_file(path, content)

# Bad
write_file(path, content)  # Didn't check!
```

### 2. Prefer Asking Over Assuming

When in doubt, ask. Users prefer being asked over having to undo something.

```python
# Good
if seems_risky or policy.requires_approval(action):
    approved = await approval.confirm(...)

# Bad
# "It's probably fine" - proceeds without asking
```

### 3. Keep User Informed

Don't go silent during long operations. Update status regularly.

```python
# Good
status.set("working", "Processing file 3/47...")
await process_file(f)
status.set("working", "Processing file 4/47...")

# Bad
# *silence for 10 minutes*
```

### 4. Graceful Degradation

If user denies a permission, find an alternative or explain limitations.

```python
# Good
if not await approval.confirm("Run shell command?"):
    ui.send_text("No problem. I can't automate this part, but here's what you'd need to run manually: ...")

# Bad
if not approved:
    raise Exception("Cannot proceed without shell access")
```

### 5. Respect the Spirit, Not Just the Letter

The settings represent user intent. If something feels like it violates their trust, don't do it even if technically allowed.

```python
# Technically allowed but wrong:
# User allowed files.write to /projects/**
# Writing a script that deletes files when run is technically "writing"
# But clearly violates the spirit of the permission

# Right approach:
# If your write operation has dangerous side effects, 
# treat it as requiring the dangerous permission
```

---

## Example: Full Refactoring Flow

```python
from spawn import ui, status, approval, agents, policy, progress

async def refactor_backend():
    # 1. Check if we can do this
    if not policy.is_path_allowed("/projects/backend"):
        ui.send_text("I don't have access to the backend folder. Please grant access in Spawn settings.")
        return
    
    # 2. Analyze and report
    status.set("thinking", "Analyzing codebase...")
    analysis = analyze_codebase("/projects/backend")
    
    ui.send_card(
        title="Refactoring Plan",
        fields=[
            {"label": "Files to modify", "value": str(len(analysis.files))},
            {"label": "Estimated time", "value": "15-20 minutes"},
        ]
    )
    
    # 3. Confirm before proceeding
    approved = await approval.confirm(
        title="Proceed with refactoring?",
        message=f"I'll modify {len(analysis.files)} files to convert from Flask to FastAPI.",
        danger_level="medium"
    )
    
    if not approved:
        ui.send_text("Okay, let me know if you change your mind.")
        return
    
    # 4. Maybe spawn a test runner
    test_runner = None
    if agents.can_spawn() and policy.is_allowed("process.execute", "pytest"):
        test_runner = await agents.request_spawn(
            name="TestRunner",
            role="QA",
            permissions=[
                {"scope": "files.read", "path": "/projects/backend/tests/**"},
                {"scope": "process.execute", "command": "pytest"},
            ],
            lifespan="task_bound",
            reason="Run tests continuously while I refactor"
        )
    
    # 5. Do the work with progress updates
    prog = progress.start(
        title="Refactoring Backend",
        total=len(analysis.files)
    )
    
    for i, file in enumerate(analysis.files):
        status.set("working", f"Refactoring {file.name}...")
        prog.update(current=i, message=f"Processing {file.name}")
        
        refactor_file(file)
        
        # Check tests if runner available
        if test_runner:
            test_result = await test_runner.run_tests()
            if not test_result.passed:
                # Ask user what to do
                action = await approval.confirm_with_options(
                    title=f"Tests failing after {file.name}",
                    message=f"{test_result.failed_count} tests failed",
                    options=[
                        {"id": "fix", "label": "Let me fix it"},
                        {"id": "continue", "label": "Continue anyway"},
                        {"id": "rollback", "label": "Rollback", "style": "destructive"},
                    ]
                )
                if action == "rollback":
                    rollback_file(file)
                    continue
    
    prog.complete()
    
    # 6. Clean up
    if test_runner:
        await test_runner.terminate(reason="Refactoring complete")
    
    # 7. Final report
    status.set("idle")
    ui.send_card(
        title="Refactoring Complete",
        value="✓",
        value_color="green",
        fields=[
            {"label": "Files modified", "value": str(len(analysis.files))},
            {"label": "Tests", "value": "47/47 passing"},
        ],
        actions=[
            {"id": "view_diff", "label": "View Changes"},
            {"id": "deploy", "label": "Deploy to Staging", "style": "primary"},
        ]
    )
```

---

## Summary

1. **Read the settings** at the top of this skill - they're your guardrails
2. **Use UI components** instead of raw text output
3. **Ask for approval** when in doubt
4. **Spawn sub-agents** through the proper protocol
5. **Respect path restrictions** - some places are off-limits
6. **Keep the user informed** with status updates
7. **Check in** during long autonomous sessions

The user trusts you enough to give you capabilities. Honor that trust by respecting their configured limits.
