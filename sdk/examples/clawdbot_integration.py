# Example: Connecting Clawdbot to Spawn
#
# This shows how to integrate your existing Clawdbot with the Spawn app.
# You don't need to change how Clawdbot runs - just add the Spawn bridge.

import asyncio
from clawdbot import Clawdbot  # Your existing Clawdbot
import spawn
from spawn import ui, status, approval, agents, policy, notify


async def main():
    # 1. Initialize Spawn with your token (from the app)
    spawn.init(token="spwn_sk_your_token_here")
    await spawn.connect()
    
    # 2. Create your Clawdbot as usual
    bot = Clawdbot()
    
    # 3. Wrap Clawdbot's actions with Spawn checks
    
    @bot.on_task
    async def handle_task(task: str):
        """Main task handler - now with Spawn integration."""
        
        # Update status in the app
        await status.set("thinking", "Analyzing task...")
        
        # Send the task to the app as a card
        await ui.send_card(
            title="New Task",
            subtitle=task[:100] + "..." if len(task) > 100 else task,
            icon="doc.text"
        )
        
        # Let Clawdbot process the task
        plan = await bot.plan(task)
        
        # Show the plan
        await ui.send_card(
            title="Execution Plan",
            fields=[
                {"label": "Steps", "value": str(len(plan.steps))},
                {"label": "Est. time", "value": plan.estimated_time},
            ],
            actions=[
                {"id": "view_details", "label": "View Details"},
            ]
        )
        
        # Execute with Spawn-aware actions
        for step in plan.steps:
            await execute_step_safely(step)
            
        await status.set("idle")
        await ui.send_text("✓ Task complete!")
        
        
async def execute_step_safely(step):
    """Execute a step with Spawn safety checks."""
    
    await status.set("working", f"Executing: {step.description[:50]}...")
    
    # Check what kind of action this is
    if step.requires_file_write:
        await handle_file_write(step)
    elif step.requires_shell:
        await handle_shell_command(step)
    elif step.requires_sub_agent:
        await handle_sub_agent(step)
    else:
        # Safe action, just do it
        await step.execute()
        
        
async def handle_file_write(step):
    """Handle file write with policy checks."""
    
    path = step.target_path
    
    # Check if path is forbidden
    if policy.is_path_forbidden(path):
        await ui.send_error(
            code="PATH_FORBIDDEN",
            title="Cannot Write File",
            message=f"The path {path} is in your protected paths list.",
            severity="warning"
        )
        return
        
    # Check if path is allowed
    if not policy.is_path_allowed(path):
        # Ask for permission
        approved = await approval.confirm(
            title=f"Write to {path}?",
            message="This path isn't in your allowed folders.",
            danger_level="medium"
        )
        if not approved:
            await ui.send_text(f"Skipping write to {path}")
            return
            
    # Check if file write requires approval
    if policy.requires_approval("files.write"):
        approved = await approval.confirm(
            title="Write File?",
            message=f"I want to write to {path}",
            details=[
                {"label": "Path", "value": path},
                {"label": "Size", "value": f"{len(step.content)} bytes"},
            ],
            danger_level="low"
        )
        if not approved:
            return
            
    # Do the write
    await step.execute()
    await ui.send_text(f"✓ Wrote {path}")
    
    
async def handle_shell_command(step):
    """Handle shell commands with policy checks."""
    
    command = step.command
    
    # Shell is typically forbidden
    if policy.is_forbidden("system.shell"):
        await ui.send_error(
            code="SHELL_FORBIDDEN",
            title="Shell Access Disabled",
            message=f"I'd like to run: {command}\n\nBut shell access is disabled in your settings.",
            severity="warning",
            actions=[
                {"id": "copy", "label": "Copy Command"},
            ]
        )
        return
        
    # Check if specific command is whitelisted
    cmd_name = command.split()[0]
    if policy.is_command_allowed(cmd_name):
        # Whitelisted command, just need standard approval
        approved = await approval.confirm(
            title=f"Run {cmd_name}?",
            message=command,
            danger_level="medium"
        )
    else:
        # Non-whitelisted command, high danger
        approved = await approval.confirm(
            title="Run Shell Command?",
            message=f"This command isn't in your allowed list:\n\n{command}",
            danger_level="high"
        )
        
    if approved:
        await status.set("working", f"Running {cmd_name}...")
        result = await step.execute()
        await ui.send_card(
            title=f"Command Result: {cmd_name}",
            fields=[
                {"label": "Exit code", "value": str(result.exit_code)},
            ]
        )
    else:
        await ui.send_text(f"Skipped: {command}")
        

async def handle_sub_agent(step):
    """Handle sub-agent spawning with policy checks."""
    
    # Check if we can spawn
    if not agents.can_spawn():
        await ui.send_text(
            f"I'd like to spawn a sub-agent for '{step.sub_agent_name}', "
            f"but I've reached the limit of {agents.max_concurrent()} concurrent sub-agents. "
            f"I'll do this sequentially instead."
        )
        await step.execute_sequentially()
        return
        
    # Request the spawn
    sub = await agents.request_spawn(
        name=step.sub_agent_name,
        role=step.sub_agent_role,
        description=step.sub_agent_description,
        permissions=step.required_permissions,
        lifespan="task_bound",
        reason=step.spawn_reason
    )
    
    if sub:
        # Spawn approved
        await ui.send_text(f"✓ Spawned {sub.name}")
        
        # Send task to sub-agent
        await sub.send_task(step.sub_agent_task)
        
        # Wait for result
        result = await sub.wait_for_result()
        
        # Terminate sub-agent
        await sub.terminate(reason="Task complete")
        
        return result
    else:
        # Spawn rejected
        await ui.send_text(
            f"Sub-agent '{step.sub_agent_name}' wasn't approved. "
            f"I'll handle this myself."
        )
        await step.execute_sequentially()


# ============================================================================
# Alternative: Decorator-based integration
# ============================================================================

# If you prefer decorators, you can wrap Clawdbot's methods:

def spawn_safe(permission: str, danger_level: str = "medium"):
    """Decorator to add Spawn safety checks to any function."""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Check policy
            if policy.is_forbidden(permission):
                await ui.send_error(
                    code="PERMISSION_DENIED",
                    title=f"{permission} is disabled",
                    message=f"The function {func.__name__} requires {permission}, which is forbidden.",
                    severity="warning"
                )
                return None
                
            # Request approval if needed
            if policy.requires_approval(permission):
                approved = await approval.confirm(
                    title=f"Allow {func.__name__}?",
                    message=f"This action requires {permission} permission.",
                    danger_level=danger_level
                )
                if not approved:
                    return None
                    
            # Execute
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# Usage:
# 
# @spawn_safe("files.delete", danger_level="high")
# async def delete_old_logs():
#     ...


# ============================================================================
# Run
# ============================================================================

if __name__ == "__main__":
    asyncio.run(main())
