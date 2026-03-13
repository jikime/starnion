name: jikime-domain-uiux-tokens
description: W3C DTCG design tokens with Style Dictionary transformation and Figma MCP integration

## Design Token Architecture

### W3C DTCG 2025.10 Format

The W3C Design Token Community Group (DTCG) specification provides a standardized format for design tokens.

Token Structure:

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "primary": {
      "50": { "$value": "#eff6ff", "$type": "color" },
      "100": { "$value": "#dbeafe", "$type": "color" },
      "500": { "$value": "#3b82f6", "$type": "color" },
      "900": { "$value": "#1e3a5f", "$type": "color" }
    },
    "semantic": {
      "background": { "$value": "{color.primary.50}", "$type": "color" },
      "foreground": { "$value": "{color.primary.900}", "$type": "color" },
      "accent": { "$value": "{color.primary.500}", "$type": "color" }
    }
  },
  "spacing": {
    "xs": { "$value": "0.25rem", "$type": "dimension" },
    "sm": { "$value": "0.5rem", "$type": "dimension" },
    "md": { "$value": "1rem", "$type": "dimension" },
    "lg": { "$value": "1.5rem", "$type": "dimension" },
    "xl": { "$value": "2rem", "$type": "dimension" }
  },
  "typography": {
    "fontFamily": {
      "sans": { "$value": "Inter, system-ui, sans-serif", "$type": "fontFamily" },
      "mono": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" }
    },
    "fontSize": {
      "sm": { "$value": "0.875rem", "$type": "dimension" },
      "base": { "$value": "1rem", "$type": "dimension" },
      "lg": { "$value": "1.125rem", "$type": "dimension" },
      "xl": { "$value": "1.25rem", "$type": "dimension" }
    }
  },
  "shadow": {
    "sm": { "$value": "0 1px 2px 0 rgb(0 0 0 / 0.05)", "$type": "shadow" },
    "md": { "$value": "0 4px 6px -1px rgb(0 0 0 / 0.1)", "$type": "shadow" }
  },
  "borderRadius": {
    "sm": { "$value": "0.25rem", "$type": "dimension" },
    "md": { "$value": "0.375rem", "$type": "dimension" },
    "lg": { "$value": "0.5rem", "$type": "dimension" },
    "full": { "$value": "9999px", "$type": "dimension" }
  }
}
```

DTCG Token Types:
- `color`: Hex, RGB, HSL color values
- `dimension`: Size values with units (rem, px, em)
- `fontFamily`: Font stack definitions
- `fontWeight`: Numeric or named weights
- `shadow`: Box shadow values
- `duration`: Animation timing values
- `cubicBezier`: Easing function values
- `number`: Unitless numeric values

Token Aliasing: Use `{path.to.token}` syntax for referencing other tokens. This enables semantic tokens that reference primitive values.

---

### Style Dictionary 4.0

Style Dictionary transforms design tokens from DTCG format into platform-specific outputs.

Configuration:

```javascript
// style-dictionary.config.mjs
import StyleDictionary from 'style-dictionary';

const sd = new StyleDictionary({
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'build/css/',
      files: [{
        destination: 'variables.css',
        format: 'css/variables',
        options: {
          outputReferences: true
        }
      }]
    },
    tailwind: {
      transformGroup: 'js',
      buildPath: 'build/tailwind/',
      files: [{
        destination: 'tokens.js',
        format: 'javascript/es6'
      }]
    },
    typescript: {
      transformGroup: 'js',
      buildPath: 'build/ts/',
      files: [{
        destination: 'tokens.ts',
        format: 'typescript/es6-declarations'
      }]
    }
  }
});

await sd.buildAllPlatforms();
```

Custom Transform (Dark Mode):

```javascript
// Custom transform for dark mode tokens
StyleDictionary.registerTransform({
  name: 'color/darkMode',
  type: 'value',
  filter: (token) => token.$type === 'color' && token.path.includes('dark'),
  transform: (token) => token.$value
});
```

Output Formats:
- CSS Custom Properties: `--color-primary-500: #3b82f6;`
- Tailwind Config: Direct theme extension object
- TypeScript Constants: Type-safe token access
- SCSS Variables: `$color-primary-500: #3b82f6;`
- iOS Swift: UIColor and CGFloat constants
- Android XML: Color and dimension resources

---

### Figma MCP Integration

Figma MCP enables automated design-to-code token synchronization.

Workflow:

```
Figma Design System → Figma MCP → DTCG JSON → Style Dictionary → CSS/Tailwind/TS
```

Token Extraction:

```typescript
// Extract tokens from Figma using MCP
// Figma variables are automatically mapped to DTCG format
interface FigmaTokenSync {
  // Figma collection → DTCG group mapping
  collections: {
    'Primitives': 'color' | 'spacing' | 'typography';
    'Semantic': 'color.semantic' | 'spacing.semantic';
    'Components': 'component';
  };
  // Mode mapping for multi-theme support
  modes: {
    'Light': 'light';
    'Dark': 'dark';
  };
}
```

Multi-Theme Token Structure:

```json
{
  "color": {
    "background": {
      "$value": "#ffffff",
      "$type": "color",
      "$extensions": {
        "mode": {
          "dark": "#0a0a0a",
          "light": "#ffffff"
        }
      }
    }
  }
}
```

---

### Token Integration with Tailwind CSS

```javascript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import tokens from './build/tailwind/tokens';

const config: Config = {
  theme: {
    extend: {
      colors: tokens.color,
      spacing: tokens.spacing,
      fontFamily: tokens.typography.fontFamily,
      fontSize: tokens.typography.fontSize,
      borderRadius: tokens.borderRadius,
      boxShadow: tokens.shadow
    }
  }
};

export default config;
```

### Token Integration with shadcn/ui

```css
/* globals.css - Generated from Style Dictionary */
@layer base {
  :root {
    --background: var(--color-semantic-background);
    --foreground: var(--color-semantic-foreground);
    --primary: var(--color-primary-500);
    --radius: var(--border-radius-md);
  }

  .dark {
    --background: var(--color-dark-background);
    --foreground: var(--color-dark-foreground);
  }
}
```

---

### Best Practices

Token Naming Conventions:
- Use semantic names for component-facing tokens (`background`, `foreground`, `accent`)
- Use scale names for primitive tokens (`primary-500`, `spacing-md`)
- Group by category (`color.*`, `spacing.*`, `typography.*`)
- Avoid platform-specific naming in source tokens

Token Organization:
- Primitives: Raw values (colors, sizes, fonts)
- Semantic: Purpose-based aliases referencing primitives
- Component: Component-specific tokens referencing semantic

Version Control:
- Track token JSON files in version control
- Use CI/CD to build platform outputs
- Validate token structure with JSON Schema
- Generate changelogs for token updates

---

Version: 1.0.0
Last Updated: 2026-01-23
