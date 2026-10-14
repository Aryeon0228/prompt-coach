import type { Project } from '../types'
import { createFreeBrief } from './free-prompt.ts'
import { coachingSource } from './coach-handoff.ts'
import { guidedBrief } from './coach-conversation.ts'

/** Resolve confirmed answers without replacing the user's original scene or reusing stale answers. */
export function coachingContext(project: Pick<Project, 'freeform' | 'references' | 'locks' | 'promptCoaching'>) {
  const originalBrief = project.freeform ?? createFreeBrief()
  const baseSource = coachingSource(originalBrief, project.references, project.locks)
  const savedSession = project.promptCoaching?.session
  const sessionStale = Boolean(savedSession && (savedSession.source !== baseSource || savedSession.mode !== originalBrief.mode))
  const session = sessionStale ? undefined : savedSession
  const brief = guidedBrief(originalBrief, session, baseSource)
  const source = coachingSource(brief, project.references, project.locks, session)
  const answerCount = session ? Object.entries(session.answers).filter(([field, answer]) =>
    answer?.status === 'answered' && !originalBrief[field as keyof typeof originalBrief].trim(),
  ).length : 0
  return { originalBrief, baseSource, brief, source, session, sessionStale, answerCount }
}
