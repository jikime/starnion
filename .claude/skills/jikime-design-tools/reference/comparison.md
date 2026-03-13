# Design Tools Comparison Guide

Comprehensive comparison of Figma MCP, Pencil MCP, and Pencil-to-Code export.

## Feature Comparison Matrix

| Feature | Figma MCP | Pencil MCP | Pencil-to-Code |
|---------|-----------|------------|----------------|
| Primary Use | Fetch existing designs | Create visual designs | Generate implementation code |
| Input | Figma file URLs | Natural language / DNA codes | .pen frame files |
| Output | Design metadata, tokens | Visual .pen frames | React/Tailwind code |
| Design Creation | No (read-only) | Yes (text-to-design) | No (export only) |
| Code Generation | No | No | Yes |
| Version Control | Limited (snapshots) | Excellent (DNA codes) | Excellent (code) |

## Decision Matrix

### Choose Figma MCP When:
- Team uses Figma for design work
- Need to extract design tokens and specifications
- Working with professional designers
- Design source of truth is Figma

### Choose Pencil MCP When:
- Creating new designs from scratch
- Rapid prototyping needed
- Version-controlled designs preferred
- Developer-led design workflow
- Fast iteration cycles required

### Choose Pencil-to-Code When:
- Designs are finalized in `.pen` format
- Ready to implement components
- Using React and Tailwind
- Design fidelity is critical

### Choose Hybrid Approach When:
- Use Figma for complex designs (icons, illustrations)
- Use Pencil for UI layouts and components
- Extract tokens from Figma
- Generate components from Pencil

## Workflow Patterns

### Pattern 1: Figma → Code
```
Designer creates in Figma → Figma MCP fetches specs → Developer implements
```

### Pattern 2: Pencil → Export
```
Describe design → Pencil generates .pen → Review with screenshot → Export to React
```

### Pattern 3: Hybrid
```
Figma for icons/illustrations + Pencil for layouts → Combine tokens → Generate code
```

## Team Size Recommendations

| Team Size | Recommended Approach |
|-----------|---------------------|
| 1-5 developers | Pencil MCP + Pencil-to-Code |
| 5-20 developers | Hybrid (Figma + Pencil) |
| 20+ developers | Figma MCP + Design System Team |

## Setup Complexity

| Tool | Setup | Learning Curve |
|------|-------|----------------|
| Figma MCP | Medium (account + API token) | Low |
| Pencil MCP | Low (desktop app + MCP) | Medium |
| Pencil-to-Code | Low (export config) | Low |
