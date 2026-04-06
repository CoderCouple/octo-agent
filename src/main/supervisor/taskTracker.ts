/**
 * Task Tracker: manages the lifecycle of tasks created by the supervisor brain.
 *
 * Tasks form a tree (parent → subtasks) with dependency tracking.
 * Persisted to ~/.octoagent/supervisor/tasks.json (Invariant #5).
 */
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ─── Types ──────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'done' | 'failed' | 'blocked'

export interface TaskState {
  id: string
  description: string
  assignedTo: string[] // session IDs
  status: TaskStatus
  parentTaskId?: string
  subtaskIds: string[]
  dependencies: string[] // task IDs that must complete first
  result?: string
  createdAt: number
  updatedAt: number
}

// ─── Persistence ────────────────────────────────────────────────

const SUPERVISOR_DIR = join(homedir(), '.octoagent', 'supervisor')
const TASKS_FILE = join(SUPERVISOR_DIR, 'tasks.json')

function ensureDir(): void {
  if (!existsSync(SUPERVISOR_DIR)) {
    mkdirSync(SUPERVISOR_DIR, { recursive: true })
  }
}

// ─── TaskTracker ────────────────────────────────────────────────

export class TaskTracker {
  private tasks = new Map<string, TaskState>()

  constructor() {
    this.loadFromDisk()
  }

  /** Load tasks from disk (Invariant #5). */
  private loadFromDisk(): void {
    try {
      if (existsSync(TASKS_FILE)) {
        const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8')) as TaskState[]
        for (const task of data) {
          this.tasks.set(task.id, task)
        }
        console.log(`[TaskTracker] Loaded ${this.tasks.size} tasks from disk`)
      }
    } catch (err) {
      console.error('[TaskTracker] Failed to load tasks:', err)
    }
  }

  /** Persist tasks to disk. */
  private saveToDisk(): void {
    try {
      ensureDir()
      const data = [...this.tasks.values()]
      writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[TaskTracker] Failed to save tasks:', err)
    }
  }

  /** Create a new task. Returns the created task. */
  createTask(opts: {
    description: string
    parentTaskId?: string
    dependencies?: string[]
  }): TaskState {
    const now = Date.now()
    const task: TaskState = {
      id: randomUUID(),
      description: opts.description,
      assignedTo: [],
      status: opts.dependencies?.length ? 'blocked' : 'pending',
      parentTaskId: opts.parentTaskId,
      subtaskIds: [],
      dependencies: opts.dependencies ?? [],
      createdAt: now,
      updatedAt: now,
    }

    this.tasks.set(task.id, task)

    // If this is a subtask, add to parent's subtaskIds
    if (opts.parentTaskId) {
      const parent = this.tasks.get(opts.parentTaskId)
      if (parent) {
        parent.subtaskIds.push(task.id)
        parent.updatedAt = now
      }
    }

    this.saveToDisk()
    return task
  }

  /** Assign a task to one or more sessions. */
  assignTask(taskId: string, sessionIds: string[]): TaskState | null {
    const task = this.tasks.get(taskId)
    if (!task) return null

    task.assignedTo = sessionIds
    task.status = 'assigned'
    task.updatedAt = Date.now()
    this.saveToDisk()
    return task
  }

  /** Update a task's status. */
  updateStatus(taskId: string, status: TaskStatus, result?: string): TaskState | null {
    const task = this.tasks.get(taskId)
    if (!task) return null

    task.status = status
    if (result !== undefined) task.result = result
    task.updatedAt = Date.now()

    // When a task completes, check if it unblocks other tasks
    if (status === 'done' || status === 'failed') {
      this.checkUnblocked(taskId)
      this.checkParentCompletion(task.parentTaskId)
    }

    this.saveToDisk()
    return task
  }

  /** Check if completing a task unblocks any dependent tasks. */
  private checkUnblocked(completedTaskId: string): void {
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue
      if (!task.dependencies.includes(completedTaskId)) continue

      // Check if ALL dependencies are done
      const allDone = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId)
        return dep && (dep.status === 'done' || dep.status === 'failed')
      })

      if (allDone) {
        task.status = 'pending'
        task.updatedAt = Date.now()
      }
    }
  }

  /** Check if all subtasks of a parent are done → mark parent done. */
  private checkParentCompletion(parentTaskId?: string): void {
    if (!parentTaskId) return
    const parent = this.tasks.get(parentTaskId)
    if (!parent || parent.subtaskIds.length === 0) return

    const allSubtasksDone = parent.subtaskIds.every((id) => {
      const sub = this.tasks.get(id)
      return sub && (sub.status === 'done' || sub.status === 'failed')
    })

    if (allSubtasksDone) {
      const anyFailed = parent.subtaskIds.some((id) => {
        const sub = this.tasks.get(id)
        return sub?.status === 'failed'
      })
      parent.status = anyFailed ? 'failed' : 'done'
      parent.updatedAt = Date.now()
      // Recursively check grandparent
      this.checkParentCompletion(parent.parentTaskId)
    }
  }

  /** Get all tasks assigned to a session. */
  getSessionTasks(sessionId: string): TaskState[] {
    return [...this.tasks.values()].filter((t) => t.assignedTo.includes(sessionId))
  }

  /** Get the full task tree (all tasks). */
  getTaskTree(): TaskState[] {
    return [...this.tasks.values()]
  }

  /** Get active (non-done, non-failed) tasks. */
  getActiveTasks(): TaskState[] {
    return [...this.tasks.values()].filter(
      (t) => t.status !== 'done' && t.status !== 'failed',
    )
  }

  /** Get a single task by ID. */
  getTask(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId)
  }

  /** Check if two sessions share a task. */
  shareTask(sessionA: string, sessionB: string): boolean {
    for (const task of this.tasks.values()) {
      if (task.assignedTo.includes(sessionA) && task.assignedTo.includes(sessionB)) {
        return true
      }
      // Also check if they're on subtasks of the same parent
      if (task.subtaskIds.length > 0) {
        const subtasks = task.subtaskIds.map((id) => this.tasks.get(id)).filter(Boolean)
        const aOnSubtask = subtasks.some((st) => st!.assignedTo.includes(sessionA))
        const bOnSubtask = subtasks.some((st) => st!.assignedTo.includes(sessionB))
        if (aOnSubtask && bOnSubtask) return true
      }
    }
    return false
  }
}
