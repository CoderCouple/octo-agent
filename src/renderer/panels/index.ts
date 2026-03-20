/**
 * Barrel export for the panel system.
 *
 * Re-exports everything from the system/ subdirectory, which contains the panel
 * registry, type definitions, built-in panel definitions, and React context.
 */
export * from './system'
export type { PanelDefinition, PanelPosition, PanelId } from './system'
