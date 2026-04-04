---
name: ques-bank-ui-refactor
description: 'Refactor and restyle the Ques Bank UI without changing functionality. Use for reducing AI-like visuals, introducing Bento Grid or dashboard layouts, system UI or monospace typography, Zinc/Slate neutral colors, border-only surfaces, and a more deliberate information hierarchy across existing HTML/CSS/JS pages.'
argument-hint: 'Target one or more pages to restyle, keeping behavior unchanged'
---

# Ques Bank UI Refactor

## When to Use
- The existing UI feels generic, overly centered, or visually "AI-generated"
- You want a stronger design system without changing backend APIs or feature behavior
- You want to restyle the current pages in place instead of migrating to React

## Scope
- Keep all features, event handlers, routes, storage keys, and API contracts unchanged
- Only modify presentation: layout, spacing, typography, color tokens, borders, buttons, cards, and responsive behavior
- Prefer incremental changes that can be reviewed page by page

## Design Direction
- Layout: use Bento Grid for the home page and dashboard/sidebar composition for the quiz page
- Typography: use a system UI stack for body text and a monospace font for numbers, code, and technical labels
- Color: use Zinc or Slate neutrals, with subtle state colors for success, danger, bookmark, and focus
- Surfaces: prefer border-only cards and inputs; avoid heavy shadows, glossy gradients, and oversized radii
- Density: keep clear spacing between regions, but do not center all content into one vertical column

## Files in This Repo
- Home page: [HTML/index.html](../../../HTML/index.html)
- Quiz page: [HTML/quiz.html](../../../HTML/quiz.html)
- History page: [HTML/parsed_list.html](../../../HTML/parsed_list.html)
- Upload page: [HTML/upload.html](../../../HTML/upload.html)
- Global styles: [css/style.css](../../../css/style.css)
- Quiz styles: [css/quiz.css](../../../css/quiz.css)
- History styles: [css/parsed_list.css](../../../css/parsed_list.css)
- Upload styles: [css/upload.css](../../../css/upload.css)
- Quiz behavior: [js/quiz.js](../../../js/quiz.js)
- History behavior: [js/parsed_list.js](../../../js/parsed_list.js)
- Upload behavior: [js/upload.js](../../../js/upload.js)

## Procedure
1. Audit the current page structure and identify the visual anti-patterns: centered hero stacks, purple-heavy branding, mixed font stacks, and shadow-heavy cards.
2. Introduce or refine a shared token layer in `css/style.css` for background, border, text, spacing, radius, and neutral state colors.
3. Restyle the home page into a Bento-style entry surface with 2-3 clear regions instead of a single centered stack.
4. Restyle the quiz page into a dashboard layout with a question column and a navigator sidebar.
5. Restyle the history page into a data-panel layout with tighter controls, neutral cards, and clearer action hierarchy.
6. Restyle the upload page into a structured workflow panel with clear input, progress, and result sections.
7. Remove or soften decorative shadows, purple gradients, and inconsistent rounded corners.
8. Validate that all existing interactions still work: navigation, favorites, answer submission, upload flow, preview, delete, rename, and theme toggle.

## Page Rules

### Home Page
- Use a bold but restrained headline block
- Replace the one-column hero feel with a grid of entry cards and support panels
- Keep the call-to-action links obvious, but not oversized

### Quiz Page
- Keep the question area and answer area visually separated from the navigator
- Make progress, question metadata, and favorite state readable at a glance
- Use clear focus states and border-based answer states instead of large filled shadows

### History Page
- Keep search and sort controls on one line where possible
- Present each history item as a compact card with title, time, and actions
- Make destructive actions visually secondary until hover or focus

### Upload Page
- Make the upload zone the primary interaction surface
- Present custom prompt, progress, and final result as sequential steps
- Keep the parsing state visible and calm, not flashy

## Implementation Constraints
- Do not rename API endpoints, storage keys, or DOM ids unless absolutely necessary
- Do not change question parsing logic, answer checking logic, or history management logic unless a visual fix requires it
- Prefer CSS and markup restructuring before touching JavaScript
- If JavaScript changes are required, keep them limited to class toggles, state labels, or layout hooks

## Recommended Palette
- Background: Slate 50 / Zinc 50-like light surfaces
- Surface: white or near-white with 1px neutral borders
- Text: Slate 900 for primary, Slate 600 for secondary
- Accent: restrained slate or zinc blue-gray, not vivid purple
- States: green for success, red for error, amber for bookmark or attention

## Success Criteria
- The pages feel more deliberate, less template-like, and more information-dense
- The layout works on desktop and mobile without content piling into the center
- Existing functionality behaves exactly as before
- The UI reads as a cohesive product, not a set of unrelated cards