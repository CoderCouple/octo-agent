# Tutorial Panel

Getting-started guide panel shown on the right side of the layout.

## What it does

Displays a step-by-step tutorial that helps new users set up their first session. Steps are tracked in the tutorial store and can be completed, skipped, or reset. The panel auto-expands the first incomplete step.

## Components

- `TutorialPanel.tsx` -- Step list with expand/collapse and completion tracking

## Store dependencies

- `store/tutorial` -- Tutorial step state, completion tracking
