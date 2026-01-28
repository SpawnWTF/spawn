# Spawn iOS/macOS UI Specification

**Version:** 1.0.0-draft  
**Status:** Draft  
**Last Updated:** January 2026

---

## Design Philosophy

### Beyond Flat Chat

Standard chat UIs (iMessage, WhatsApp) are flat—every message is equal. Spawn needs to visualize:

1. **Hierarchy** — Parent agents and sub-agents have visual distinction
2. **Delegation** — When work is handed off, users see the flow
3. **State** — What's running, waiting, complete, or needs attention

### The Metaphor

The main agent is a **Director**. When it delegates to sub-agents, the UI shows nested work—like a Reddit thread or Slack reply, but inline in the conversation.

### Native Feel

This isn't a web view. It's native SwiftUI with:
- SF Symbols for icons
- System fonts (SF Pro)
- Native haptics
- Dynamic Island integration
- iOS/macOS design patterns

---

## Visual Hierarchy

### Agent vs Sub-Agent Distinction

| Element | Main Agent | Sub-Agent |
|---------|------------|-----------|
| Avatar shape | Rounded square (12pt radius) | Circle |
| Avatar size | 40pt | 32pt |
| Bubble width | Full (16pt padding) | Narrower (32pt leading indent) |
| Background | Primary card color | Secondary/muted color |
| Name font | `.headline` | `.subheadline` |
| Message font | `.body` | `.callout` |
| Depth indicator | None | Vertical line connecting to parent |

### Visual Example

```
┌─────────────────────────────────────────┐
│                                         │
│ ┌───┐ Finance Director            10:02 │
│ │ 🤖│ I will rebalance your portfolio.  │
│ └───┘ Starting analysis...              │
│   │                                     │
│   │  ┌──────────────────────────────┐   │
│   ├──│ ○ Market Analyzer      10:02 │   │
│   │  │ Calculated drift: 12%        │   │
│   │  │ Recommendation: Sell ETH     │   │
│   │  └──────────────────────────────┘   │
│   │                                     │
│   │  ┌──────────────────────────────┐   │
│   └──│ ○ Execution Bot        10:03 │   │
│      │ ⚠️ CONFIRMATION REQUIRED     │   │
│      │ Sell 1.2 ETH → Buy 0.4 BTC   │   │
│      │                              │   │
│      │ [  Slide to Execute  >>>>  ] │   │
│      └──────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘

Legend:
┌───┐
│ 🤖│  = Rounded square avatar (main agent)
└───┘

  ○    = Circular avatar (sub-agent)
  
  │    = Delegation line (connects sub-agents to parent)
```

---

## Message Components

### 1. Main Agent Message

```
┌─────────────────────────────────────────┐
│ ┌───┐                                   │
│ │ 🤖│ Trading Bot                 10:02 │
│ └───┘                                   │
│ I'll analyze your portfolio and         │
│ prepare a rebalancing plan.             │
│                                         │
│ [View Details]                          │
└─────────────────────────────────────────┘
```

SwiftUI structure:
```swift
struct MainAgentMessage: View {
    let agent: Agent
    let message: Message
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Rounded square avatar
            AgentAvatar(agent: agent, style: .main)
            
            VStack(alignment: .leading, spacing: 4) {
                // Header
                HStack {
                    Text(agent.name)
                        .font(.headline)
                    Spacer()
                    Text(message.timestamp, style: .time)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                // Content
                MessageContent(message: message)
                
                // Actions
                if let actions = message.actions {
                    ActionButtons(actions: actions)
                }
            }
        }
        .padding()
        .background(.background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
```

### 2. Sub-Agent Message (Nested)

```
│  ┌──────────────────────────────────┐
├──│ ○ Market Analyzer          10:02 │
│  │                                  │
│  │ ├─ Fetched prices for BTC, ETH   │
│  │ ├─ Calculated drift: 12%         │
│  │ └─ Recommendation: Sell ETH      │
│  └──────────────────────────────────┘
```

SwiftUI structure:
```swift
struct SubAgentMessage: View {
    let subAgent: SubAgent
    let message: Message
    let isLast: Bool
    
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Delegation line
            DelegationLine(isLast: isLast)
                .frame(width: 24)
            
            HStack(alignment: .top, spacing: 10) {
                // Circular avatar
                AgentAvatar(agent: subAgent, style: .sub)
                
                VStack(alignment: .leading, spacing: 4) {
                    // Header (smaller)
                    HStack {
                        Text(subAgent.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Spacer()
                        Text(message.timestamp, style: .time)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    
                    // Content (smaller)
                    MessageContent(message: message)
                        .font(.callout)
                }
            }
            .padding(12)
            .background(.background.tertiary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.leading, 32) // Indent from main agent
    }
}
```

### 3. Delegation Line

The vertical line connecting sub-agents to their parent:

```swift
struct DelegationLine: View {
    let isLast: Bool
    
    var body: some View {
        GeometryReader { geo in
            Path { path in
                let x = geo.size.width / 2
                
                // Vertical line
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: isLast ? geo.size.height / 2 : geo.size.height))
                
                // Horizontal connector
                path.move(to: CGPoint(x: x, y: geo.size.height / 2))
                path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height / 2))
            }
            .stroke(.quaternary, lineWidth: 2)
        }
    }
}
```

### 4. Delegation Header (Collapsible)

When main agent delegates, show a collapsible header:

```
▼ Delegating to 2 sub-agents...
```

```swift
struct DelegationHeader: View {
    @Binding var isExpanded: Bool
    let count: Int
    
    var body: some View {
        Button {
            withAnimation(.spring(response: 0.3)) {
                isExpanded.toggle()
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Text("Delegating to \(count) sub-agent\(count == 1 ? "" : "s")...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .padding(.leading, 52) // Align with message content
        .padding(.vertical, 4)
    }
}
```

---

## Confirmation Components

### Standard Confirmation Card

```
┌──────────────────────────────────────┐
│ ⚠️ CONFIRMATION REQUIRED             │
│                                      │
│ Sell 1.2 ETH at market price         │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Action     SELL                  │ │
│ │ Asset      Ethereum (ETH)        │ │
│ │ Amount     1.2 ETH               │ │
│ │ Est. Value $3,840.00             │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ⏱️ Expires in 4:32                   │
│                                      │
│ [ Cancel ]        [ Approve ]        │
└──────────────────────────────────────┘
```

### High-Stakes Confirmation (Slide to Confirm)

For `danger_level: high`:

```
┌──────────────────────────────────────┐
│ 🔴 HIGH VALUE TRADE                  │
│                                      │
│ Sell 5.0 ETH at market price         │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Est. Value     $16,000.00        │ │
│ │ Stop Loss      $3,050.00         │ │
│ │ Take Profit    $3,500.00         │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ⏱️ Expires in 4:32                   │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │  >>>  Slide to Execute  >>>     │ │
│ └──────────────────────────────────┘ │
│                                      │
│         [ Cancel ]                   │
└──────────────────────────────────────┘
```

SwiftUI implementation:
```swift
struct SlideToConfirm: View {
    let onConfirm: () -> Void
    @State private var offset: CGFloat = 0
    @State private var isConfirmed = false
    
    private let threshold: CGFloat = 200
    
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Track
                RoundedRectangle(cornerRadius: 16)
                    .fill(.red.opacity(0.2))
                
                // Progress fill
                RoundedRectangle(cornerRadius: 16)
                    .fill(.red.opacity(0.4))
                    .frame(width: offset + 60)
                
                // Label
                Text("Slide to Execute")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity)
                    .opacity(1 - (offset / threshold))
                
                // Thumb
                Circle()
                    .fill(.red)
                    .frame(width: 52, height: 52)
                    .overlay {
                        Image(systemName: "chevron.right.2")
                            .foregroundStyle(.white)
                            .fontWeight(.bold)
                    }
                    .offset(x: offset)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                offset = min(max(0, value.translation.width), geo.size.width - 60)
                            }
                            .onEnded { value in
                                if offset > threshold {
                                    withAnimation(.spring()) {
                                        offset = geo.size.width - 60
                                        isConfirmed = true
                                    }
                                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                                    onConfirm()
                                } else {
                                    withAnimation(.spring()) {
                                        offset = 0
                                    }
                                }
                            }
                    )
            }
        }
        .frame(height: 56)
        .disabled(isConfirmed)
    }
}
```

### Critical Confirmation (Biometric)

For `danger_level: critical`, require Face ID/Touch ID:

```swift
struct BiometricConfirmation: View {
    let details: ConfirmationDetails
    let onConfirm: () -> Void
    let onCancel: () -> Void
    
    @State private var showingBiometric = false
    
    var body: some View {
        ConfirmationCard(details: details, dangerLevel: .critical) {
            Button {
                authenticateWithBiometrics()
            } label: {
                Label("Authenticate to Confirm", systemImage: "faceid")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.red)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }
    
    private func authenticateWithBiometrics() {
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                               localizedReason: "Confirm high-value trade") { success, error in
            if success {
                DispatchQueue.main.async {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    onConfirm()
                }
            }
        }
    }
}
```

---

## Ghost Agents (Spawn Requests)

When an agent requests to spawn a sub-agent, it doesn't appear instantly. Instead, a "ghost card" appears—a translucent, pulsing outline waiting for user approval.

### The Philosophy

Direct spawning is dangerous. An AI that can create unlimited sub-agents without oversight is an AI that can:
- Consume unlimited resources
- Grant itself elevated permissions
- Reproduce uncontrollably

Ghost agents solve this by making reproduction **visible and controllable**.

### Ghost Card Visual

```
┌─────────────────────────────────────────┐
│                                         │
│ │  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐   │
│ ├┄┄┤ ○ TestRunner_01           ⚡️   ┆   │
│ │  ┆                                ┆   │
│ │  ┆  ⚠️ SPAWN REQUEST              ┆   │
│ │  ┆                                ┆   │
│ │  ┆  Role: QA Engineer             ┆   │
│ │  ┆  Lifespan: Task-bound          ┆   │
│ │  ┆                                ┆   │
│ │  ┆  📁 Read: /tests/**            ┆   │
│ │  ┆  📁 Write: /tests/reports/**   ┆   │
│ │  ┆  ⚙️ Execute: pytest            ┆   │
│ │  ┆                                ┆   │
│ │  ┆  "I need a dedicated process   ┆   │
│ │  ┆   to run tests in parallel"    ┆   │
│ │  ┆                                ┆   │
│ │  ┆  [ Reject ]    [ Approve ]     ┆   │
│ │  └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘   │
│                                         │
└─────────────────────────────────────────┘

┄┄┄ = Dashed/translucent border (ghost state)
```

### Ghost Card States

| State | Visual | Animation |
|-------|--------|-----------|
| **Pending** | Dashed yellow border, translucent fill | Gentle pulse |
| **Approving** | Solid yellow border, scanning lines | Fill animation |
| **Active** | Solid fill, normal card | None |
| **Rejected** | Red flash, fade out | Dissolve |
| **Expired** | Gray, strikethrough | Fade |

### SwiftUI Implementation

```swift
struct GhostAgentCard: View {
    let request: SpawnRequest
    let onApprove: () -> Void
    let onReject: () -> Void
    
    @State private var isPulsing = false
    @State private var isApproving = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Circle()
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
                    .foregroundStyle(.yellow)
                    .frame(width: 32, height: 32)
                    .overlay {
                        Image(systemName: request.proposedAgent.icon)
                            .font(.system(size: 14))
                            .foregroundStyle(.yellow.opacity(0.7))
                    }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(request.proposedAgent.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Text(request.proposedAgent.role ?? "Sub-Agent")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
                
                Image(systemName: "bolt.fill")
                    .foregroundStyle(.yellow)
                    .font(.caption)
            }
            
            // Spawn Request Badge
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.yellow)
                Text("SPAWN REQUEST")
                    .font(.caption)
                    .fontWeight(.bold)
            }
            .foregroundStyle(.yellow)
            
            // Permissions
            VStack(alignment: .leading, spacing: 6) {
                ForEach(request.proposedAgent.permissions, id: \.scope) { permission in
                    PermissionRow(permission: permission)
                }
            }
            .padding(10)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            
            // Reason
            Text("\"\(request.reason)\"")
                .font(.callout)
                .foregroundStyle(.secondary)
                .italic()
            
            // Actions
            HStack(spacing: 12) {
                Button("Reject") {
                    onReject()
                }
                .buttonStyle(GhostButtonStyle(style: .secondary))
                
                Button("Approve") {
                    withAnimation(.spring(response: 0.3)) {
                        isApproving = true
                    }
                    AgentHaptic.subAgentSpawned.trigger()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        onApprove()
                    }
                }
                .buttonStyle(GhostButtonStyle(style: .primary))
            }
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: isApproving ? [] : [8, 6]))
                .foregroundStyle(.yellow.opacity(isApproving ? 1 : 0.6))
        }
        .background {
            RoundedRectangle(cornerRadius: 16)
                .fill(.yellow.opacity(isApproving ? 0.15 : 0.05))
        }
        .opacity(isPulsing ? 0.85 : 1.0)
        .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: isPulsing)
        .onAppear { isPulsing = true }
        .overlay {
            if isApproving {
                ScanningOverlay()
            }
        }
    }
}

struct PermissionRow: View {
    let permission: Permission
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: permission.icon)
                .font(.caption)
                .foregroundStyle(permission.riskColor)
                .frame(width: 16)
            
            Text(permission.displayText)
                .font(.caption)
                .foregroundStyle(.primary)
            
            Spacer()
            
            if permission.riskLevel == .high {
                Text("HIGH")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.red.opacity(0.2))
                    .clipShape(Capsule())
            }
        }
    }
}

struct ScanningOverlay: View {
    @State private var offset: CGFloat = -200
    
    var body: some View {
        GeometryReader { geo in
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [.clear, .yellow.opacity(0.3), .clear],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(height: 60)
                .offset(y: offset)
                .onAppear {
                    withAnimation(.linear(duration: 0.8)) {
                        offset = geo.size.height + 100
                    }
                }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
```

### Spawn Approval Animation

When user approves, the ghost card transforms into a real agent:

```swift
struct SpawnTransition: View {
    @State private var phase: SpawnPhase = .ghost
    
    enum SpawnPhase {
        case ghost      // Dashed outline
        case scanning   // Yellow scan line
        case filling    // Solid fill animating in
        case active     // Normal card
    }
    
    var body: some View {
        ZStack {
            switch phase {
            case .ghost:
                GhostAgentCard(...)
            case .scanning:
                GhostAgentCard(...)
                    .overlay(ScanningOverlay())
            case .filling:
                SubAgentCard(...)
                    .transition(.opacity.combined(with: .scale(scale: 0.95)))
            case .active:
                SubAgentCard(...)
            }
        }
    }
}
```

### Connection Lines ("Yellow Cables")

The visual connection between parent and spawned sub-agents uses glowing yellow lines:

```swift
struct SpawnConnectionLine: View {
    let isActive: Bool
    
    var body: some View {
        GeometryReader { geo in
            Path { path in
                let startX = geo.size.width / 2
                let startY: CGFloat = 0
                let endY = geo.size.height
                
                path.move(to: CGPoint(x: startX, y: startY))
                path.addLine(to: CGPoint(x: startX, y: endY * 0.5))
                path.addLine(to: CGPoint(x: geo.size.width, y: endY * 0.5))
            }
            .stroke(
                isActive ? Color.yellow : Color.yellow.opacity(0.3),
                style: StrokeStyle(
                    lineWidth: isActive ? 3 : 2,
                    lineCap: .round,
                    lineJoin: .round,
                    dash: isActive ? [] : [6, 4]
                )
            )
            .shadow(color: isActive ? .yellow.opacity(0.5) : .clear, radius: 4)
        }
    }
}
```

### Permission Blast Radius Visualization

Show the scope of what each sub-agent can access:

```swift
struct BlastRadiusView: View {
    let permissions: [Permission]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ACCESS SCOPE")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
            
            ForEach(permissions, id: \.scope) { permission in
                HStack(spacing: 8) {
                    Circle()
                        .fill(permission.riskColor)
                        .frame(width: 8, height: 8)
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(permission.scope)
                            .font(.caption)
                            .fontWeight(.medium)
                        
                        if let path = permission.path {
                            Text(path)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fontDesign(.monospaced)
                        }
                    }
                    
                    Spacer()
                    
                    Image(systemName: permission.riskLevel.icon)
                        .foregroundStyle(permission.riskColor)
                        .font(.caption)
                }
                .padding(8)
                .background(permission.riskColor.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }
}

extension Permission {
    var riskColor: Color {
        switch riskLevel {
        case .low: return .green
        case .medium: return .yellow
        case .high: return .orange
        case .critical: return .red
        }
    }
    
    var icon: String {
        switch scope {
        case "files.read": return "doc.text"
        case "files.write": return "doc.badge.plus"
        case "files.delete": return "trash"
        case "process.execute": return "terminal"
        case "network.fetch": return "network"
        case "system.shell": return "exclamationmark.shield"
        default: return "questionmark.circle"
        }
    }
}
```

### Kill Switch

Slide-to-kill for emergency termination:

```swift
struct KillSwitch: View {
    let agentName: String
    let onKill: () -> Void
    
    @State private var offset: CGFloat = 0
    @State private var isKilled = false
    
    private let threshold: CGFloat = 200
    
    var body: some View {
        VStack(spacing: 12) {
            Text("EMERGENCY KILL")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(.red)
            
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Track
                    RoundedRectangle(cornerRadius: 26)
                        .fill(.red.opacity(0.2))
                    
                    // Progress fill
                    RoundedRectangle(cornerRadius: 26)
                        .fill(.red.opacity(0.4))
                        .frame(width: offset + 52)
                    
                    // Label
                    Text("Slide to Kill \(agentName)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .opacity(1 - (offset / threshold))
                    
                    // Thumb
                    Circle()
                        .fill(.red)
                        .frame(width: 44, height: 44)
                        .overlay {
                            Image(systemName: "xmark")
                                .foregroundStyle(.white)
                                .fontWeight(.bold)
                        }
                        .offset(x: offset + 4)
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    offset = min(max(0, value.translation.width), geo.size.width - 52)
                                    if offset > 50 {
                                        AgentHaptic.slideProgress.trigger()
                                    }
                                }
                                .onEnded { _ in
                                    if offset > threshold {
                                        withAnimation(.spring()) {
                                            isKilled = true
                                        }
                                        AgentHaptic.error.trigger()
                                        onKill()
                                    } else {
                                        withAnimation(.spring()) {
                                            offset = 0
                                        }
                                    }
                                }
                        )
                }
            }
            .frame(height: 52)
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
```

### Observability Panel

See all active sub-agents and their resource usage:

```swift
struct AgentObservabilityPanel: View {
    let parentAgent: Agent
    @ObservedObject var subAgents: SubAgentManager
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("ACTIVE SUB-AGENTS")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                
                Spacer()
                
                Text("\(subAgents.active.count) running")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            // Agent Tree
            ForEach(subAgents.active) { sub in
                SubAgentStatusRow(subAgent: sub)
            }
            
            // Resource Usage
            VStack(alignment: .leading, spacing: 8) {
                Text("RESOURCE USAGE")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                
                HStack {
                    ResourceMeter(
                        label: "Tokens",
                        current: subAgents.totalTokensUsed,
                        max: subAgents.tokenBudget
                    )
                    
                    ResourceMeter(
                        label: "Tool Calls",
                        current: subAgents.totalToolCalls,
                        max: subAgents.toolCallBudget
                    )
                }
            }
            .padding(12)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            
            // Kill All Button
            if subAgents.active.count > 1 {
                Button {
                    // Show confirmation
                } label: {
                    Label("Kill All Sub-Agents", systemImage: "xmark.circle.fill")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .background(.red.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct SubAgentStatusRow: View {
    let subAgent: SubAgent
    
    var body: some View {
        HStack(spacing: 12) {
            // Connection line indicator
            Rectangle()
                .fill(.yellow)
                .frame(width: 3, height: 40)
                .clipShape(Capsule())
            
            // Avatar
            Circle()
                .fill(subAgent.status.color.opacity(0.2))
                .frame(width: 32, height: 32)
                .overlay {
                    Image(systemName: subAgent.icon)
                        .font(.system(size: 14))
                        .foregroundStyle(subAgent.status.color)
                }
            
            // Info
            VStack(alignment: .leading, spacing: 2) {
                Text(subAgent.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Text(subAgent.currentTask ?? "Idle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            
            Spacer()
            
            // Status
            VStack(alignment: .trailing, spacing: 2) {
                StatusBadge(status: subAgent.status)
                
                Text(subAgent.runningFor)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            
            // Kill button
            Button {
                // Kill this sub-agent
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
```

---

## Status Indicators

### Agent Status Header

The conversation header shows real-time agent status:

```
┌─────────────────────────────────────────┐
│  < Back      Trading Bot           ⚙️   │
│              ● Online                   │
│ ─────────────────────────────────────── │
```

With status detail:
```
┌─────────────────────────────────────────┐
│  < Back      Trading Bot           ⚙️   │
│              ◐ Analyzing portfolio...   │
│ ─────────────────────────────────────── │
```

SwiftUI:
```swift
struct AgentStatusHeader: View {
    let agent: Agent
    @ObservedObject var status: AgentStatus
    
    var body: some View {
        VStack(spacing: 2) {
            Text(agent.name)
                .font(.headline)
            
            HStack(spacing: 6) {
                StatusIndicator(status: status.state)
                
                if let label = status.label {
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
    }
}

struct StatusIndicator: View {
    let status: AgentState
    
    var body: some View {
        Circle()
            .fill(status.color)
            .frame(width: 8, height: 8)
            .modifier(PulseModifier(isAnimating: status.isAnimating))
    }
}
```

### Status Colors & Animation

| State | Color | Animation |
|-------|-------|-----------|
| `online` | Green | None |
| `thinking` | Blue | Pulse |
| `working` | Blue | Pulse |
| `trading` | Yellow | Pulse |
| `waiting` | Gray | None |
| `error` | Red | None |
| `offline` | Gray | None |

```swift
struct PulseModifier: ViewModifier {
    let isAnimating: Bool
    @State private var isPulsing = false
    
    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.5 : 1.0)
            .animation(
                isAnimating ? .easeInOut(duration: 0.8).repeatForever() : .default,
                value: isPulsing
            )
            .onAppear {
                isPulsing = isAnimating
            }
            .onChange(of: isAnimating) { _, new in
                isPulsing = new
            }
    }
}
```

---

## Loading States

### Skeleton Loader (Sub-Agent Spawning)

When a sub-agent is being created, show a skeleton immediately:

```
│  ┌──────────────────────────────────┐
├──│ ○ ████████████            ···    │
│  │                                  │
│  │ ██████████████████████           │
│  │ █████████████                    │
│  └──────────────────────────────────┘
```

SwiftUI:
```swift
struct SubAgentSkeleton: View {
    @State private var isAnimating = false
    
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            DelegationLine(isLast: true)
                .frame(width: 24)
            
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(.quaternary)
                    .frame(width: 32, height: 32)
                
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        SkeletonBar(width: 100)
                        Spacer()
                        SkeletonDots()
                    }
                    SkeletonBar(width: .infinity)
                    SkeletonBar(width: 150)
                }
            }
            .padding(12)
            .background(.background.tertiary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.leading, 32)
        .shimmer(isAnimating: isAnimating)
        .onAppear { isAnimating = true }
    }
}

struct SkeletonBar: View {
    let width: CGFloat?
    
    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(.quaternary)
            .frame(maxWidth: width, minHeight: 12, maxHeight: 12)
    }
}

extension View {
    func shimmer(isAnimating: Bool) -> some View {
        self.modifier(ShimmerModifier(isAnimating: isAnimating))
    }
}
```

### Typing Indicator

When agent is composing:

```swift
struct TypingIndicator: View {
    @State private var phase = 0.0
    
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(.secondary)
                    .frame(width: 8, height: 8)
                    .offset(y: sin(phase + Double(index) * 0.5) * 4)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
        }
    }
}
```

---

## Haptic Feedback

Strategic haptic feedback for key moments:

| Event | Haptic | Code |
|-------|--------|------|
| Sub-agent spawned | `.light` | `UIImpactFeedbackGenerator(style: .light)` |
| Sub-agent complete | `.success` | `UINotificationFeedbackGenerator().notificationOccurred(.success)` |
| Confirmation required | `.warning` | `UINotificationFeedbackGenerator().notificationOccurred(.warning)` |
| Trade executed | `.success` | `UINotificationFeedbackGenerator().notificationOccurred(.success)` |
| Error occurred | `.error` | `UINotificationFeedbackGenerator().notificationOccurred(.error)` |
| Collapse/expand | `.light` | `UIImpactFeedbackGenerator(style: .light)` |
| Slide confirm progress | `.rigid` | `UIImpactFeedbackGenerator(style: .rigid)` |
| Slide confirm complete | `.success` | `UINotificationFeedbackGenerator().notificationOccurred(.success)` |

```swift
enum AgentHaptic {
    case subAgentSpawned
    case subAgentComplete
    case confirmationRequired
    case tradeExecuted
    case error
    case toggle
    case slideProgress
    case slideComplete
    
    func trigger() {
        switch self {
        case .subAgentSpawned, .toggle:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .subAgentComplete, .tradeExecuted, .slideComplete:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .confirmationRequired:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .error:
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        case .slideProgress:
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.5)
        }
    }
}
```

---

## Dynamic Island Integration

### Compact View

When app is backgrounded during active agent work:

```
┌─────────────────────────────────┐
│ 🤖 Trading...           🟢 30%  │
└─────────────────────────────────┘
```

### Expanded View (Long Press)

```
┌─────────────────────────────────────┐
│                                     │
│  🤖 Trading Bot                     │
│                                     │
│  ├── ✅ Market Analyzer (done)      │
│  ├── ⏳ Execution Bot (waiting)     │
│  └── 🔴 Needs confirmation          │
│                                     │
│  [ Open App ]                       │
│                                     │
└─────────────────────────────────────┘
```

Implementation with ActivityKit:

```swift
struct AgentActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var agentName: String
        var status: String
        var progress: Double?
        var subAgentStatuses: [SubAgentStatus]
        var needsConfirmation: Bool
    }
    
    var agentId: String
    var agentIcon: String
}

struct SubAgentStatus: Codable, Hashable {
    var name: String
    var state: String // "complete", "working", "waiting", "error"
}

// Start Live Activity
func startAgentActivity(agent: Agent) {
    let attributes = AgentActivityAttributes(
        agentId: agent.id,
        agentIcon: agent.icon
    )
    
    let initialState = AgentActivityAttributes.ContentState(
        agentName: agent.name,
        status: "Starting...",
        progress: 0,
        subAgentStatuses: [],
        needsConfirmation: false
    )
    
    do {
        let activity = try Activity.request(
            attributes: attributes,
            content: .init(state: initialState, staleDate: nil),
            pushType: .token
        )
        // Store activity.id for updates
    } catch {
        print("Failed to start activity: \(error)")
    }
}

// Update Live Activity
func updateAgentActivity(activityId: String, state: AgentActivityAttributes.ContentState) {
    Task {
        for activity in Activity<AgentActivityAttributes>.activities {
            if activity.id == activityId {
                await activity.update(using: state)
            }
        }
    }
}
```

Dynamic Island Widget:

```swift
struct AgentActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentActivityAttributes.self) { context in
            // Lock screen / banner view
            AgentLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.attributes.agentIcon)
                        .font(.title2)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.agentName)
                            .font(.headline)
                        
                        ForEach(context.state.subAgentStatuses, id: \.name) { sub in
                            HStack(spacing: 4) {
                                Text(sub.state.icon)
                                Text(sub.name)
                                    .font(.caption)
                            }
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.needsConfirmation {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.red)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.needsConfirmation {
                        Text("Tap to confirm")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: context.attributes.agentIcon)
            } compactTrailing: {
                if let progress = context.state.progress {
                    ProgressView(value: progress)
                        .progressViewStyle(.circular)
                        .frame(width: 16, height: 16)
                } else if context.state.needsConfirmation {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.red)
                } else {
                    StatusDot(status: context.state.status)
                }
            } minimal: {
                Image(systemName: context.attributes.agentIcon)
            }
        }
    }
}
```

---

## Sidebar Navigation (iPad / Mac)

On larger screens, show a persistent sidebar:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐ ┌─────────────────────────────────────────────┐ │
│ │                  │ │                                             │ │
│ │ 🔍 Search        │ │  < Back      Trading Bot              ⚙️    │ │
│ │                  │ │              ◐ Executing trade...           │ │
│ │ ▼ Trading Bot  ● │ │ ─────────────────────────────────────────── │ │
│ │   #eth-watcher ● │ │                                             │ │
│ │   #btc-watcher ● │ │  [Conversation content...]                  │ │
│ │   #risk-monitor● │ │                                             │ │
│ │   #executor    ○ │ │                                             │ │
│ │                  │ │                                             │ │
│ │ ▶ Research     ● │ │                                             │ │
│ │                  │ │                                             │ │
│ │ ▶ Code Review  ○ │ │                                             │ │
│ │                  │ │                                             │ │
│ │ ─────────────────│ │                                             │ │
│ │ 🔌 Services      │ │                                             │ │
│ │   MarketPulse  ● │ │                                             │ │
│ │                  │ │                                             │ │
│ │                  │ │                                             │ │
│ │ ┌──────────────┐ │ │ ┌─────────────────────────────────────────┐ │ │
│ │ │   + Agent    │ │ │ │ Type a message...                     ➤ │ │ │
│ │ └──────────────┘ │ │ └─────────────────────────────────────────┘ │ │
│ └──────────────────┘ └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

SwiftUI (NavigationSplitView):

```swift
struct SpawnApp: View {
    @StateObject var viewModel = SpawnViewModel()
    @State private var selectedAgent: Agent?
    @State private var selectedSubAgent: SubAgent?
    
    var body: some View {
        NavigationSplitView {
            // Sidebar
            AgentSidebar(
                agents: viewModel.agents,
                selectedAgent: $selectedAgent,
                selectedSubAgent: $selectedSubAgent
            )
            .navigationTitle("Agents")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        viewModel.showCreateAgent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        } detail: {
            // Conversation
            if let subAgent = selectedSubAgent {
                SubAgentConversationView(subAgent: subAgent)
            } else if let agent = selectedAgent {
                AgentConversationView(agent: agent)
            } else {
                ContentUnavailableView(
                    "Select an Agent",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("Choose an agent from the sidebar")
                )
            }
        }
    }
}
```

---

## Dark Mode

All colors use semantic system colors for automatic dark mode support:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Main bubble bg | `.background.secondary` | `.background.secondary` |
| Sub-agent bubble bg | `.background.tertiary` | `.background.tertiary` |
| Delegation line | `.quaternary` | `.quaternary` |
| Confirmation (high) | `.red.opacity(0.1)` | `.red.opacity(0.2)` |
| Status green | `.green` | `.green` |
| Status yellow | `.yellow` | `.yellow` |

SwiftUI handles this automatically when using system colors.

---

## Accessibility

### VoiceOver

```swift
struct MainAgentMessage: View {
    // ...
    
    var body: some View {
        // ...
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(agent.name) says: \(message.content)")
        .accessibilityHint(message.actions != nil ? "Actions available" : nil)
    }
}

struct SubAgentMessage: View {
    // ...
    
    var body: some View {
        // ...
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sub-agent \(subAgent.name) says: \(message.content)")
    }
}

struct DelegationHeader: View {
    // ...
    
    var body: some View {
        // ...
        .accessibilityLabel(isExpanded ? "Collapse sub-agents" : "Expand \(count) sub-agents")
        .accessibilityAddTraits(.isButton)
    }
}
```

### Dynamic Type

All text uses system fonts with proper scaling:

```swift
Text(agent.name)
    .font(.headline) // Scales with Dynamic Type
    
Text(message.content)
    .font(.body)     // Scales with Dynamic Type
```

### Reduce Motion

Disable animations for users who prefer reduced motion:

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

var body: some View {
    content
        .animation(reduceMotion ? nil : .spring(), value: isExpanded)
}
```

---

## Color Palette

### Semantic Colors

| Name | Usage | SwiftUI |
|------|-------|---------|
| Primary | Main agent accent | `.accentColor` |
| Success | Positive, complete | `.green` |
| Warning | Caution, trading | `.yellow` |
| Danger | Error, destructive | `.red` |
| Info | Neutral highlight | `.blue` |

### Agent Type Colors

```swift
extension Agent {
    var accentColor: Color {
        switch type {
        case .trading: return .yellow
        case .research: return .blue
        case .code: return .purple
        case .automation: return .green
        default: return .accentColor
        }
    }
}
```

---

## File Structure

```
Spawn/
├── App/
│   ├── SpawnApp.swift
│   └── ContentView.swift
│
├── Features/
│   ├── Agents/
│   │   ├── AgentSidebar.swift
│   │   ├── AgentConversationView.swift
│   │   ├── SubAgentConversationView.swift
│   │   └── CreateAgentView.swift
│   │
│   ├── Messages/
│   │   ├── MessageList.swift
│   │   ├── MainAgentMessage.swift
│   │   ├── SubAgentMessage.swift
│   │   ├── DelegationHeader.swift
│   │   └── DelegationLine.swift
│   │
│   ├── Confirmations/
│   │   ├── ConfirmationCard.swift
│   │   ├── SlideToConfirm.swift
│   │   └── BiometricConfirmation.swift
│   │
│   ├── Input/
│   │   ├── MessageInputBar.swift
│   │   ├── InputMask.swift
│   │   └── FormInput.swift
│   │
│   └── Status/
│       ├── AgentStatusHeader.swift
│       ├── StatusIndicator.swift
│       └── TypingIndicator.swift
│
├── Components/
│   ├── AgentAvatar.swift
│   ├── SkeletonLoader.swift
│   ├── ActionButtons.swift
│   └── Charts/
│       ├── LineChart.swift
│       ├── CandlestickChart.swift
│       └── PieChart.swift
│
├── LiveActivity/
│   ├── AgentActivityAttributes.swift
│   └── AgentActivityWidget.swift
│
├── Services/
│   ├── AgentService.swift
│   ├── WebSocketService.swift
│   └── NotificationService.swift
│
├── Models/
│   ├── Agent.swift
│   ├── SubAgent.swift
│   ├── Message.swift
│   └── Confirmation.swift
│
└── Utilities/
    ├── Haptics.swift
    ├── Animations.swift
    └── Extensions/
```

---

## Changelog

### 1.0.0-draft (January 2026)
- Initial UI specification
- Threaded stream design for hierarchy visualization
- Sub-agent visual nesting with delegation lines
- Confirmation components (tap, slide, biometric)
- Status indicators with animations
- Skeleton loaders for spawning states
- Haptic feedback mapping
- Dynamic Island integration
- Sidebar navigation for iPad/Mac
- Accessibility support
