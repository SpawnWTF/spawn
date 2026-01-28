# Spawn SDK
# Connects your agent to the Spawn app

from __future__ import annotations
import asyncio
import json
import os
import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Union
from datetime import datetime, timedelta
import websockets
from websockets.client import WebSocketClientProtocol


# ============================================================================
# Configuration
# ============================================================================

@dataclass
class PolicyConfig:
    """User's safety settings from the Spawn app."""
    auto_spawn_mode: str = "off"  # off, queue, constrained, trusted, unrestricted
    max_concurrent_sub_agents: int = 5
    max_sub_agents_per_hour: int = 10
    max_tokens_per_sub_agent: int = 50000
    
    permissions_allowed: List[str] = field(default_factory=lambda: ["files.read", "agent.message"])
    permissions_forbidden: List[str] = field(default_factory=lambda: ["system.shell", "files.delete", "agent.spawn"])
    permissions_ask: List[str] = field(default_factory=lambda: ["files.write", "process.execute", "network.fetch"])
    
    allowed_paths: List[str] = field(default_factory=list)
    forbidden_paths: List[str] = field(default_factory=lambda: [
        "~/.ssh/**", "~/.aws/**", "~/.config/gcloud/**",
        "**/.env", "**/*.pem", "**/*.key", "**/secrets/**"
    ])
    
    allowed_commands: List[str] = field(default_factory=list)
    allowed_network_domains: List[str] = field(default_factory=list)
    
    check_in_hours: int = 4


# ============================================================================
# Connection
# ============================================================================

class SpawnConnection:
    """WebSocket connection to the Spawn relay."""
    
    def __init__(self, token: str, relay_url: str = "wss://relay.spawn.io/v1/agent"):
        self.token = token
        self.relay_url = relay_url
        self.ws: Optional[WebSocketClientProtocol] = None
        self.policy: PolicyConfig = PolicyConfig()
        self._handlers: Dict[str, Callable] = {}
        self._pending_responses: Dict[str, asyncio.Future] = {}
        self._connected = False
        
    async def connect(self):
        """Establish connection to relay."""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Agent-Version": "1.0.0",
        }
        self.ws = await websockets.connect(self.relay_url, extra_headers=headers)
        self._connected = True
        
        # Fetch initial policy
        await self._fetch_policy()
        
        # Start message loop
        asyncio.create_task(self._message_loop())
        
    async def _message_loop(self):
        """Process incoming messages."""
        async for message in self.ws:
            data = json.loads(message)
            msg_type = data.get("type")
            
            # Handle responses to our requests
            if "request_id" in data.get("payload", {}):
                req_id = data["payload"]["request_id"]
                if req_id in self._pending_responses:
                    self._pending_responses[req_id].set_result(data)
                    continue
            
            # Handle incoming messages
            if msg_type in self._handlers:
                await self._handlers[msg_type](data)
            elif msg_type == "policy_update":
                self._update_policy(data["payload"])
            elif msg_type == "message":
                if "on_message" in self._handlers:
                    await self._handlers["on_message"](data["payload"])
                    
    async def _fetch_policy(self):
        """Get current policy settings from relay."""
        response = await self._request({
            "type": "get_policy",
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "ts": int(datetime.now().timestamp()),
            "payload": {}
        })
        if response:
            self._update_policy(response.get("payload", {}))
            
    def _update_policy(self, data: Dict):
        """Update local policy from server data."""
        for key, value in data.items():
            if hasattr(self.policy, key):
                setattr(self.policy, key, value)
                
    async def _request(self, message: Dict, timeout: float = 30.0) -> Optional[Dict]:
        """Send a request and wait for response."""
        request_id = message.get("payload", {}).get("request_id") or message.get("id")
        future = asyncio.get_event_loop().create_future()
        self._pending_responses[request_id] = future
        
        await self.ws.send(json.dumps(message))
        
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self._pending_responses.pop(request_id, None)
            
    async def send(self, message: Dict):
        """Send a message without waiting for response."""
        if "id" not in message:
            message["id"] = f"msg_{uuid.uuid4().hex[:12]}"
        if "ts" not in message:
            message["ts"] = int(datetime.now().timestamp())
        await self.ws.send(json.dumps(message))
        
    def on(self, event: str, handler: Callable):
        """Register an event handler."""
        self._handlers[event] = handler


# Global connection instance
_connection: Optional[SpawnConnection] = None


def init(token: str = None, relay_url: str = None):
    """Initialize the Spawn SDK."""
    global _connection
    token = token or os.environ.get("SPAWN_TOKEN")
    if not token:
        raise ValueError("SPAWN_TOKEN required")
    _connection = SpawnConnection(token, relay_url or "wss://relay.spawn.io/v1/agent")
    return _connection


async def connect():
    """Connect to the relay."""
    if _connection:
        await _connection.connect()
        

def get_policy() -> PolicyConfig:
    """Get current policy settings."""
    return _connection.policy if _connection else PolicyConfig()


# ============================================================================
# UI Module
# ============================================================================

class ui:
    """UI components for sending rich messages."""
    
    @staticmethod
    async def send_text(content: str, format: str = "plain"):
        """Send a text message."""
        await _connection.send({
            "type": "text",
            "payload": {
                "content": content,
                "format": format  # plain, markdown
            }
        })
        
    @staticmethod
    async def send_card(
        title: str,
        subtitle: str = None,
        value: str = None,
        value_color: str = None,
        icon: str = None,
        fields: List[Dict] = None,
        actions: List[Dict] = None,
        style: str = "default"
    ):
        """Send a card component."""
        payload = {
            "style": style,
            "title": title,
        }
        if subtitle:
            payload["subtitle"] = subtitle
        if value:
            payload["value"] = {"text": value}
            if value_color:
                payload["value"]["color"] = value_color
        if icon:
            payload["icon"] = icon
        if fields:
            payload["fields"] = fields
        if actions:
            payload["actions"] = actions
            
        await _connection.send({
            "type": "card",
            "payload": payload
        })
        
    @staticmethod
    async def send_table(
        title: str,
        columns: List[Dict],
        rows: List[Dict],
        actions: List[Dict] = None
    ):
        """Send a table component."""
        await _connection.send({
            "type": "table",
            "payload": {
                "title": title,
                "columns": columns,
                "rows": rows,
                "actions": actions or []
            }
        })
        
    @staticmethod
    async def send_chart(
        chart_type: str,
        title: str,
        series: List[Dict],
        x_axis: Dict = None,
        y_axis: Dict = None,
        size: str = "medium"
    ):
        """Send a chart component."""
        await _connection.send({
            "type": "chart",
            "payload": {
                "chart_type": chart_type,
                "title": title,
                "series": series,
                "x_axis": x_axis,
                "y_axis": y_axis,
                "size": size
            }
        })
        
    @staticmethod
    async def send_error(
        code: str,
        title: str,
        message: str,
        severity: str = "error",
        recoverable: bool = True,
        actions: List[Dict] = None
    ):
        """Send an error message."""
        await _connection.send({
            "type": "error",
            "payload": {
                "code": code,
                "title": title,
                "message": message,
                "severity": severity,
                "recoverable": recoverable,
                "actions": actions or []
            }
        })


# ============================================================================
# Status Module
# ============================================================================

class status:
    """Agent status updates."""
    
    _current: str = "idle"
    _label: str = None
    
    @classmethod
    async def set(cls, state: str, label: str = None):
        """Update agent status.
        
        States: idle, thinking, working, trading, waiting, error, success
        """
        cls._current = state
        cls._label = label
        
        await _connection.send({
            "type": "status_update",
            "payload": {
                "status": state,
                "label": label
            }
        })
        
    @classmethod
    def get(cls) -> str:
        return cls._current


# ============================================================================
# Progress Module
# ============================================================================

@dataclass
class ProgressHandle:
    """Handle for updating a progress indicator."""
    id: str
    title: str
    steps: List[str] = None
    total: int = None
    _current: int = 0
    
    async def update(
        self,
        current: int = None,
        step: int = None,
        step_status: str = None,
        progress: float = None,
        message: str = None
    ):
        """Update progress state."""
        if current is not None:
            self._current = current
            
        payload = {"request_id": self.id}
        
        if progress is not None:
            payload["progress"] = progress
        elif self.total and current is not None:
            payload["progress"] = current / self.total
            
        if message:
            payload["message"] = message
            
        if step is not None and self.steps:
            payload["steps"] = [
                {
                    "label": s,
                    "status": "complete" if i < step else ("running" if i == step else "pending")
                }
                for i, s in enumerate(self.steps)
            ]
            if step_status:
                payload["steps"][step]["status"] = step_status
                
        payload["status"] = "running"
        
        await _connection.send({
            "type": "progress",
            "payload": payload
        })
        
    async def complete(self, message: str = None):
        """Mark progress as complete."""
        await _connection.send({
            "type": "progress",
            "payload": {
                "request_id": self.id,
                "status": "complete",
                "progress": 1.0,
                "message": message
            }
        })
        
    async def fail(self, message: str = None):
        """Mark progress as failed."""
        await _connection.send({
            "type": "progress",
            "payload": {
                "request_id": self.id,
                "status": "failed",
                "message": message
            }
        })


class progress:
    """Progress indicators for long-running tasks."""
    
    @staticmethod
    async def start(
        title: str,
        steps: List[str] = None,
        total: int = None,
        cancelable: bool = True
    ) -> ProgressHandle:
        """Start a new progress indicator."""
        handle = ProgressHandle(
            id=f"prg_{uuid.uuid4().hex[:12]}",
            title=title,
            steps=steps,
            total=total
        )
        
        payload = {
            "request_id": handle.id,
            "title": title,
            "status": "running",
            "progress": 0,
            "cancelable": cancelable
        }
        
        if steps:
            payload["steps"] = [{"label": s, "status": "pending"} for s in steps]
            
        await _connection.send({
            "type": "progress",
            "payload": payload
        })
        
        return handle


# ============================================================================
# Approval Module
# ============================================================================

class approval:
    """Request user approval for sensitive actions."""
    
    @staticmethod
    async def confirm(
        title: str,
        message: str = None,
        danger_level: str = "medium",
        details: List[Dict] = None,
        timeout_seconds: int = 300
    ) -> bool:
        """Request simple yes/no confirmation.
        
        danger_level: low, medium, high, critical
        """
        request_id = f"cfm_{uuid.uuid4().hex[:12]}"
        
        payload = {
            "request_id": request_id,
            "title": title,
            "danger_level": danger_level,
            "timeout_seconds": timeout_seconds,
            "options": [
                {"id": "cancel", "label": "Cancel", "style": "secondary"},
                {"id": "confirm", "label": "Confirm", "style": "primary"}
            ]
        }
        
        if message:
            payload["summary"] = message
        if details:
            payload["details"] = details
            
        # High/critical require slide
        if danger_level in ("high", "critical"):
            payload["requires_slide"] = True
        if danger_level == "critical":
            payload["requires_biometric"] = True
            
        response = await _connection._request({
            "type": "confirmation_request",
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "ts": int(datetime.now().timestamp()),
            "payload": payload
        }, timeout=timeout_seconds)
        
        if response:
            return response.get("payload", {}).get("action") == "confirm"
        return False  # Timeout = reject
    
    @staticmethod
    async def confirm_trade(
        action: str,
        symbol: str,
        quantity: float,
        price: float,
        stop_loss: float = None,
        take_profit: float = None,
        timeout_seconds: int = 300
    ) -> bool:
        """Request confirmation for a trade."""
        total = quantity * price
        
        details = [
            {"label": "Action", "value": action},
            {"label": "Symbol", "value": symbol},
            {"label": "Quantity", "value": str(quantity)},
            {"label": "Price", "value": f"${price:,.2f}"},
            {"label": "Total", "value": f"${total:,.2f}"},
        ]
        
        if stop_loss:
            details.append({"label": "Stop Loss", "value": f"${stop_loss:,.2f}"})
        if take_profit:
            details.append({"label": "Take Profit", "value": f"${take_profit:,.2f}"})
            
        return await approval.confirm(
            title=f"{action} {quantity} {symbol}?",
            message=f"{action} {quantity} {symbol} at ${price:,.2f}",
            danger_level="high",
            details=details,
            timeout_seconds=timeout_seconds
        )
        
    @staticmethod
    async def confirm_with_options(
        title: str,
        options: List[Dict],
        message: str = None,
        danger_level: str = "medium",
        timeout_seconds: int = 300
    ) -> Optional[str]:
        """Request confirmation with custom options.
        
        Returns the selected option ID, or None if cancelled/timeout.
        """
        request_id = f"cfm_{uuid.uuid4().hex[:12]}"
        
        response = await _connection._request({
            "type": "confirmation_request",
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "ts": int(datetime.now().timestamp()),
            "payload": {
                "request_id": request_id,
                "title": title,
                "summary": message,
                "danger_level": danger_level,
                "timeout_seconds": timeout_seconds,
                "options": options
            }
        }, timeout=timeout_seconds)
        
        if response:
            return response.get("payload", {}).get("action")
        return None


# ============================================================================
# Policy Module
# ============================================================================

class policy:
    """Check user's safety policies."""
    
    @staticmethod
    def is_allowed(permission: str, target: str = None) -> bool:
        """Check if a permission is allowed without asking."""
        cfg = get_policy()
        
        # Check if explicitly forbidden
        if permission in cfg.permissions_forbidden:
            return False
            
        # Check if explicitly allowed
        if permission in cfg.permissions_allowed:
            # Still need to check path for file permissions
            if permission.startswith("files.") and target:
                return policy.is_path_allowed(target) and not policy.is_path_forbidden(target)
            return True
            
        return False
    
    @staticmethod
    def is_forbidden(permission: str) -> bool:
        """Check if a permission is explicitly forbidden."""
        cfg = get_policy()
        return permission in cfg.permissions_forbidden
    
    @staticmethod
    def requires_approval(permission: str) -> bool:
        """Check if a permission requires user approval."""
        cfg = get_policy()
        return permission in cfg.permissions_ask
    
    @staticmethod
    def is_path_allowed(path: str) -> bool:
        """Check if a path is in the allowed list."""
        cfg = get_policy()
        path = os.path.expanduser(path)
        
        for pattern in cfg.allowed_paths:
            pattern = os.path.expanduser(pattern)
            if _match_glob(path, pattern):
                return True
        return False
    
    @staticmethod
    def is_path_forbidden(path: str) -> bool:
        """Check if a path is in the forbidden list."""
        cfg = get_policy()
        path = os.path.expanduser(path)
        
        for pattern in cfg.forbidden_paths:
            pattern = os.path.expanduser(pattern)
            if _match_glob(path, pattern):
                return True
        return False
    
    @staticmethod
    def is_command_allowed(command: str) -> bool:
        """Check if a command is in the allowed list."""
        cfg = get_policy()
        cmd_name = command.split()[0] if command else ""
        return cmd_name in cfg.allowed_commands
    
    @staticmethod
    def is_domain_allowed(domain: str) -> bool:
        """Check if a network domain is allowed."""
        cfg = get_policy()
        return domain in cfg.allowed_network_domains


def _match_glob(path: str, pattern: str) -> bool:
    """Simple glob matching for paths."""
    # Convert glob to regex
    regex = pattern.replace(".", r"\.")
    regex = regex.replace("**", "<<<DOUBLESTAR>>>")
    regex = regex.replace("*", r"[^/]*")
    regex = regex.replace("<<<DOUBLESTAR>>>", r".*")
    regex = f"^{regex}$"
    return bool(re.match(regex, path))


# ============================================================================
# Agents Module
# ============================================================================

@dataclass
class SubAgent:
    """Handle for a spawned sub-agent."""
    id: str
    name: str
    role: str
    status: str = "online"
    
    async def send_task(self, task: str):
        """Send a task to this sub-agent."""
        await _connection.send({
            "type": "internal_command",
            "payload": {
                "from": "parent",
                "to": self.id,
                "command": "task",
                "data": {"task": task}
            }
        })
        
    async def wait_for_result(self, timeout: float = 300) -> Any:
        """Wait for sub-agent to complete and return result."""
        # Implementation would register handler and wait
        pass
    
    async def terminate(self, reason: str = "Task complete"):
        """Terminate this sub-agent."""
        await _connection.send({
            "type": "sub_agent_terminate",
            "payload": {
                "sub_agent_id": self.id,
                "reason": reason,
                "notify_user": True
            }
        })


class agents:
    """Sub-agent management."""
    
    _active: List[SubAgent] = []
    _spawned_this_hour: int = 0
    
    @classmethod
    def can_spawn(cls) -> bool:
        """Check if we can spawn another sub-agent."""
        cfg = get_policy()
        
        if cfg.auto_spawn_mode == "off":
            return True  # Can request, just needs approval
            
        if len(cls._active) >= cfg.max_concurrent_sub_agents:
            return False
            
        if cls._spawned_this_hour >= cfg.max_sub_agents_per_hour:
            return False
            
        return True
    
    @classmethod
    def active_count(cls) -> int:
        """Get count of active sub-agents."""
        return len(cls._active)
    
    @classmethod
    def max_concurrent(cls) -> int:
        """Get max allowed concurrent sub-agents."""
        return get_policy().max_concurrent_sub_agents
    
    @classmethod
    def active(cls) -> List[SubAgent]:
        """Get list of active sub-agents."""
        return cls._active.copy()
    
    @classmethod
    def would_auto_approve(cls, permissions: List[Dict]) -> bool:
        """Check if a spawn request would be auto-approved."""
        cfg = get_policy()
        
        if cfg.auto_spawn_mode in ("off", "queue"):
            return False
            
        if cfg.auto_spawn_mode == "unrestricted":
            return True
            
        # Check each requested permission
        for perm in permissions:
            scope = perm.get("scope", "")
            
            # Forbidden permissions never auto-approve
            if scope in cfg.permissions_forbidden:
                return False
                
            # Must-ask permissions don't auto-approve in constrained mode
            if cfg.auto_spawn_mode == "constrained" and scope in cfg.permissions_ask:
                return False
                
        return True
    
    @classmethod
    async def request_spawn(
        cls,
        name: str,
        role: str = None,
        description: str = None,
        permissions: List[Dict] = None,
        lifespan: str = "task_bound",
        reason: str = None,
        icon: str = None
    ) -> Optional[SubAgent]:
        """Request to spawn a sub-agent (may require approval)."""
        
        request_id = f"spawn_req_{uuid.uuid4().hex[:12]}"
        sub_agent_id = f"sub_{name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
        
        response = await _connection._request({
            "type": "agent_spawn_request",
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "ts": int(datetime.now().timestamp()),
            "payload": {
                "request_id": request_id,
                "proposed_agent": {
                    "id": sub_agent_id,
                    "name": name,
                    "role": role,
                    "description": description,
                    "icon": icon,
                    "permissions": permissions or [],
                    "lifespan": lifespan,
                },
                "reason": reason
            }
        }, timeout=600)  # 10 min timeout for approval
        
        if response and response.get("payload", {}).get("decision") == "approved":
            sub = SubAgent(
                id=sub_agent_id,
                name=name,
                role=role or "Sub-Agent"
            )
            cls._active.append(sub)
            cls._spawned_this_hour += 1
            return sub
            
        return None
    
    @classmethod
    async def spawn(
        cls,
        name: str,
        role: str = None,
        permissions: List[Dict] = None,
        lifespan: str = "task_bound",
        notify: bool = True
    ) -> SubAgent:
        """Spawn a sub-agent directly (only works if would_auto_approve)."""
        
        if not cls.would_auto_approve(permissions or []):
            raise PermissionError("Cannot auto-spawn with these permissions")
            
        sub_agent_id = f"sub_{name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
        
        await _connection.send({
            "type": "sub_agent_spawn",
            "payload": {
                "sub_agent_id": sub_agent_id,
                "name": name,
                "role": role,
                "permissions": permissions or [],
                "lifespan": lifespan,
                "status": "online"
            }
        })
        
        sub = SubAgent(id=sub_agent_id, name=name, role=role or "Sub-Agent")
        cls._active.append(sub)
        cls._spawned_this_hour += 1
        
        if notify:
            # Send notification (user sees but doesn't approve)
            await _connection.send({
                "type": "notification",
                "payload": {
                    "title": "Sub-Agent Spawned",
                    "body": f"{name} started",
                    "priority": "low",
                    "category": "auto_spawn"
                }
            })
            
        return sub
    
    @classmethod
    async def kill_all(cls, reason: str = "User requested"):
        """Terminate all active sub-agents."""
        for sub in cls._active:
            await sub.terminate(reason)
        cls._active.clear()
        
    @classmethod
    def pause_spawning(cls):
        """Stop spawning new sub-agents."""
        # Sets a local flag; active agents continue
        cls._spawning_paused = True


# ============================================================================
# Check-in Module
# ============================================================================

class checkin:
    """Check-in flow for long autonomous sessions."""
    
    _last_checkin: datetime = None
    _session_start: datetime = None
    
    @classmethod
    def is_required(cls) -> bool:
        """Check if a check-in is required."""
        cfg = get_policy()
        
        if cls._session_start is None:
            cls._session_start = datetime.now()
            cls._last_checkin = datetime.now()
            return False
            
        hours_since_checkin = (datetime.now() - cls._last_checkin).total_seconds() / 3600
        return hours_since_checkin >= cfg.check_in_hours
    
    @classmethod
    async def request(
        cls,
        summary: Dict,
        pending_spawns: int = 0,
        message: str = None
    ):
        """Send a check-in request to the user."""
        await _connection.send({
            "type": "checkin_request",
            "payload": {
                "running_since": int(cls._session_start.timestamp()),
                "summary": summary,
                "pending_spawns": pending_spawns,
                "message": message
            }
        })
        
    @classmethod
    async def wait_for_response(cls, timeout: float = 3600) -> Dict:
        """Wait for user's check-in response."""
        # Would register handler and wait for response
        response = await _connection._request({
            "type": "checkin_request",
            "payload": {}
        }, timeout=timeout)
        
        if response:
            cls._last_checkin = datetime.now()
            return response.get("payload", {})
            
        return {"action": "pause"}  # Default to pause on timeout


# ============================================================================
# Notify Module
# ============================================================================

class notify:
    """Push notifications to user's devices."""
    
    @staticmethod
    async def send(
        title: str,
        body: str,
        priority: str = "normal",
        category: str = "message",
        actions: List[Dict] = None
    ):
        """Send a push notification.
        
        priority: low, normal, high, critical
        """
        await _connection.send({
            "type": "notification",
            "payload": {
                "title": title,
                "body": body,
                "priority": priority,
                "category": category,
                "actions": actions or []
            }
        })


# ============================================================================
# Convenience Exports
# ============================================================================

__all__ = [
    "init",
    "connect",
    "get_policy",
    "ui",
    "status",
    "progress",
    "approval",
    "policy",
    "agents",
    "checkin",
    "notify",
    "PolicyConfig",
    "SubAgent",
    "ProgressHandle",
]
