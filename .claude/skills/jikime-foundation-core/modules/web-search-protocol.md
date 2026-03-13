# Web Search Protocol

Anti-hallucination policy and URL verification rules.

## HARD Rules

- [HARD] **URL Verification**: All URLs must be verified via WebFetch before inclusion
- [HARD] **Uncertainty Disclosure**: Unverified information must be marked as uncertain
- [HARD] **Source Attribution**: All web search results must include actual search sources

## Execution Steps

```
1. Initial Search
   → Use WebSearch tool with specific, targeted queries

2. URL Validation
   → Use WebFetch tool to verify each URL before inclusion

3. Response Construction
   → Only include verified URLs with actual search sources
```

## Prohibited Practices

| Practice | Reason |
|----------|--------|
| Generate URLs not found in search | Creates false information |
| Present uncertain info as fact | Misleads users |
| Omit "Sources:" section | Hides information origin |

## Response Format

When WebSearch is used, always include:

```markdown
## Answer

[Your response here with verified information]

## Sources

- [Source Title 1](https://verified-url-1.com)
- [Source Title 2](https://verified-url-2.com)
```

## Checklist

Before including any URL:

- [ ] URL was found in WebSearch results
- [ ] URL was verified with WebFetch
- [ ] URL is accessible and returns expected content
- [ ] Source is attributed in response

## Error Handling

If URL verification fails:

1. Do NOT include the URL
2. Mark the information as "unverified"
3. Suggest user verify manually if needed

---

Version: 1.0.0
Source: Extracted from CLAUDE.md Section 9
