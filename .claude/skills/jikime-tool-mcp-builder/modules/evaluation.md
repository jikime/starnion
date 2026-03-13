# MCP Server Evaluation Guide

## Overview

Create comprehensive evaluations to test whether LLMs can effectively use your MCP server to answer realistic, complex questions.

---

## Purpose

The measure of quality of an MCP server is NOT how well it implements tools, but **how well these implementations enable LLMs to answer realistic questions**.

---

## Quick Reference

### Requirements

- 10 human-readable questions
- Questions must be READ-ONLY, NON-DESTRUCTIVE
- Each question requires multiple tool calls
- Answers must be single, verifiable values
- Answers must be STABLE (won't change over time)

### Output Format

```xml
<evaluation>
   <qa_pair>
      <question>Your question here</question>
      <answer>Single verifiable answer</answer>
   </qa_pair>
</evaluation>
```

---

## Question Guidelines

### Core Requirements

1. **Independent**: Each question should NOT depend on other questions
2. **Non-Destructive**: Should NOT require modifying state
3. **Complex**: Require multiple (potentially dozens of) tool calls
4. **Verifiable**: Single, clear answer that can be string-compared

### Complexity Requirements

Questions should:

- Require deep exploration (multi-hop reasoning)
- May require extensive paging through results
- May query old data (1-2 years)
- Require synthesis across multiple data types
- NOT be solvable with simple keyword search

### Stability Requirements

Questions must be designed so answers DON'T CHANGE:

- Don't count current reactions/replies/members
- Use historical data ("in Q1 2024")
- Reference completed/closed items
- Specify fixed time windows

---

## Good Question Examples

### Multi-hop Question

```xml
<qa_pair>
  <question>Find the repository archived in Q3 2023 that had previously been the most forked. What was its primary programming language?</question>
  <answer>Python</answer>
</qa_pair>
```

**Why it's good:**
- Requires searching archived repos
- Needs to find historical fork counts
- Must access repo details
- Based on closed data

### Context-Based (No Keywords)

```xml
<qa_pair>
  <question>Locate the initiative focused on improving customer onboarding completed in late 2023. What was the project lead's role title?</question>
  <answer>Product Manager</answer>
</qa_pair>
```

**Why it's good:**
- Uses paraphrase ("initiative focused on improving customer onboarding")
- Requires understanding context
- Answer is stable (historical role)

### Complex Aggregation

```xml
<qa_pair>
  <question>Among bugs reported in January 2024 marked as critical, which assignee resolved the highest percentage within 48 hours? Provide their username.</question>
  <answer>alex_eng</answer>
</qa_pair>
```

**Why it's good:**
- Requires filtering by date, priority, status
- Needs to calculate percentages
- Tests timestamp understanding
- Uses specific time period

---

## Bad Question Examples

### Answer Changes Over Time

```xml
<qa_pair>
  <question>How many open issues are assigned to the engineering team?</question>
  <answer>47</answer>
</qa_pair>
```

**Why it's bad:** Count changes as issues open/close

### Too Easy (Keyword Search)

```xml
<qa_pair>
  <question>Find the PR titled "Add authentication feature". Who created it?</question>
  <answer>developer123</answer>
</qa_pair>
```

**Why it's bad:** Direct title search, no analysis needed

### Ambiguous Format

```xml
<qa_pair>
  <question>List all Python repositories.</question>
  <answer>repo1, repo2, repo3, data-pipeline</answer>
</qa_pair>
```

**Why it's bad:** Lists can be returned in any order

---

## Answer Guidelines

### Format Specification

If the answer can be formatted multiple ways, specify in the question:

```xml
<question>When was the project created? Use YYYY-MM-DD format.</question>
<answer>2024-03-15</answer>

<question>Is this claim true or false? Answer exactly "True" or "False".</question>
<answer>True</answer>

<question>Which option is correct: A, B, C, or D?</question>
<answer>C</answer>
```

### Acceptable Answer Types

- User ID, username, display name, email
- Resource ID, name, title
- Numerical quantity
- Timestamp, date (with format specified)
- Boolean (True/False)
- Multiple choice (A/B/C/D)
- Single word or short phrase

### Not Acceptable

- Lists of values
- Complex JSON objects
- Natural language paragraphs
- Formatted tables

---

## Evaluation Process

### Step 1: Documentation Review

1. Read target API documentation
2. Understand available endpoints
3. Identify data models and relationships

### Step 2: Tool Inspection

1. List available MCP tools
2. Examine input/output schemas
3. Note limitations and constraints
4. **DO NOT call tools yet**

### Step 3: Content Exploration

1. Use READ-ONLY tools to explore
2. Find specific content for questions
3. Use small limits (<10) to avoid context overflow
4. **ONLY non-destructive operations**

### Step 4: Question Generation

Create 10 questions following all guidelines:

```xml
<evaluation>
  <qa_pair>
    <question>Find the project created in Q2 2024 with the highest task count. What is the project name?</question>
    <answer>Website Redesign</answer>
  </qa_pair>
  <!-- 9 more questions -->
</evaluation>
```

### Step 5: Verification

1. Attempt to answer each question using the MCP server
2. Verify answers are correct
3. Flag any that require write operations
4. Update incorrect answers
5. Remove questions requiring destructive operations

---

## Running Evaluations

### Setup

```bash
pip install anthropic mcp
export ANTHROPIC_API_KEY=your_key
```

### Stdio Server

```bash
python scripts/evaluation.py \
  -t stdio \
  -c python \
  -a my_server.py \
  evaluation.xml
```

### SSE/HTTP Server

```bash
# Start server first, then:
python scripts/evaluation.py \
  -t sse \
  -u https://example.com/mcp \
  evaluation.xml
```

### Options

```
-t, --transport    stdio | sse | http
-c, --command      Command to run server (stdio)
-a, --args         Arguments for command
-e, --env          Environment variables
-u, --url          Server URL (sse/http)
-H, --header       HTTP headers
-o, --output       Output report file
```

---

## Output Report

The evaluation generates:

### Summary Statistics

- Accuracy (correct/total)
- Average task duration
- Average tool calls per task
- Total tool calls

### Per-Task Results

- Question and expected answer
- Actual answer from agent
- Pass/fail status
- Duration and tool calls
- Agent's approach summary
- Agent's feedback on tools

---

## Troubleshooting

### Low Accuracy

- Review tool descriptions
- Check if parameters are well-documented
- Verify tools return appropriate data
- Consider if error messages are clear

### Timeouts

- Use more capable model
- Check if tools return too much data
- Verify pagination works correctly
- Simplify complex questions

### Connection Errors

- Verify command/URL is correct
- Check API keys are set
- Ensure server is running (SSE/HTTP)

---

Version: 1.0.0
