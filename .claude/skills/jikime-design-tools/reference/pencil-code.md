# Pencil-to-Code Export Guide

Export `.pen` designs to production-ready React components with Tailwind CSS styling.

## Export Configuration

```typescript
// pencil.config.js
module.exports = {
  framework: 'react',
  styling: 'tailwind',
  output: './src/components/generated',
  options: {
    typescript: true,
    responsive: true,
    accessibility: true,
    testing: true
  }
};
```

## Export Options

```typescript
const exportOptions = {
  format: 'react',           // react, vue, svelte
  language: 'typescript',    // typescript, javascript
  styling: 'tailwind',       // tailwind, css-in-js, css-modules
  designTokens: true,        // Use design tokens instead of hardcoded values
  components: true,          // Generate separate component files
  stories: true,             // Generate Storybook stories
  tests: true,               // Generate test files
  props: true,               // Generate props interface
  comments: true,            // Add JSDoc comments
};
```

## Supported Frameworks and Libraries

| Framework | Styling | Component Library |
|-----------|---------|-------------------|
| React | Tailwind CSS | Shadcn UI |
| React | Tailwind CSS | Radix UI |
| React | CSS Modules | Chakra UI |
| Next.js | Tailwind CSS | Shadcn UI |
| Vue | Tailwind CSS | - |
| Svelte | Tailwind CSS | - |

## Component Generation Patterns

### Basic Component

```typescript
import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'medium', isLoading, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    const variantStyles = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
      tertiary: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500'
    };
    const sizeStyles = {
      small: 'px-3 py-1.5 text-sm',
      medium: 'px-4 py-2 text-base',
      large: 'px-6 py-3 text-lg'
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
        disabled={isLoading}
        {...props}
      >
        {children}
      </button>
    );
  }
);
```

## Tailwind CSS Design Token Mapping

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',   // From .pen design tokens
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    }
  }
};
```

## Component Organization

```
src/
  components/
    generated/           # Auto-generated from .pen
      Button.tsx
      Input.tsx
      Card.tsx
    ui/                  # Custom wrappers
      EnhancedButton.tsx
    index.ts             # Public API
```

## Design-to-Code Workflow

1. Create design in Pencil using `batch_design`
2. Validate visually with `get_screenshot`
3. Use AI prompt (Cmd/Ctrl + K) to generate code
4. Specify framework and component library in prompts
5. Review and integrate generated components

## Available UI Kits

| Kit | Description |
|-----|-------------|
| Shadcn UI | Popular React component library |
| Halo | Modern design system |
| Lunaris | Versatile design system |
| Nitro | Performance-focused design system |

## Best Practices

- Store `.pen` files alongside code in project repository
- Use descriptive names (`dashboard.pen`, `login-page.pen`)
- Commit `.pen` files to Git for version history
- Keep `.pen` files in the same workspace as source code
- Specify icon libraries in prompts (Lucide, Heroicons) for code generation
- Use component creation (Cmd/Ctrl + Option/Alt + K) for reusable elements

## Variables and Design Tokens

- **Import from CSS**: Extract variables from `globals.css` automatically
- **Import from existing designs**: Copy/paste token data
- **Manual creation**: Define custom variables for themes
- **Bidirectional sync**: Update in Pencil syncs to CSS and vice versa
- **Multi-theme support**: Define different values per theme (light/dark mode)
