import type { Project } from '../types'
import { createFreeBrief, type FreePromptBrief } from './free-prompt.ts'
import { coachingSource } from './coach-handoff.ts'
import { guidedBrief, nextCoachingQuestion, type CoachingField, type GuidedSession } from './coach-conversation.ts'

const SOURCE_LIMIT = 100_000

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
    answer?.status === 'answered' && (session.conditionsApplied
      ? originalBrief[field as CoachingField] === answer.text
      : !originalBrief[field as CoachingField].trim()),
  ).length : 0
  return { originalBrief, baseSource, brief, source, session, sessionStale, answerCount }
}

/** Commit scene conditions and their snapshot together, preserving all saved text/history. */
function applyConditions(project: Project, brief: FreePromptBrief, session: GuidedSession): Project {
  const source = coachingSource(brief, project.references, project.locks)
  return {
    ...project,
    freeform: brief,
    promptCoaching: {
      ...project.promptCoaching!,
      session: {
        ...session,
        conditionsApplied: true,
        // Long input remains saved, but the session requires review after it is shortened.
        source: source.length <= SOURCE_LIMIT ? source : session.source,
      },
    },
  }
}

/** A normal condition edit keeps other confirmed conditions active; scene changes need review. */
export function updateSceneCondition<Field extends keyof FreePromptBrief>(project: Project, field: Field, value: FreePromptBrief[Field]): Project {
  const context = coachingContext(project)
  if (context.brief[field] === value) return project
  if (field === 'idea' || field === 'mode' || !context.session) {
    return { ...project, freeform: { ...context.originalBrief, [field]: value } }
  }
  return applyConditions(project, { ...context.brief, [field]: value }, context.session)
}

/** Save an answer into the same fields used by the scene editor. Draft-only edits never call this. */
export function confirmGuidedAnswer(project: Project, field: CoachingField, deferred = false): Project {
  const context = coachingContext(project)
  const session = context.session
  if (!session || !context.brief.idea.trim() || context.baseSource.length > SOURCE_LIMIT) return project
  const draft = session.drafts[field] ?? session.answers[field]?.text ?? ''
  if (!deferred && !draft.trim()) return project
  const brief = deferred ? context.brief : { ...context.brief, [field]: draft }
  const next: GuidedSession = {
    ...session,
    drafts: { ...session.drafts, [field]: draft },
    answers: { ...session.answers, [field]: { status: deferred ? 'deferred' : 'answered', text: deferred ? '' : draft } },
  }
  next.completed = session.completed || !nextCoachingQuestion(brief, next)
  return applyConditions(project, brief, next)
}

/** Call only after the user explicitly compares stale records with the current scene. */
export function adoptReviewedConditions(project: Project): Project {
  const context = coachingContext(project)
  const previous = project.promptCoaching?.session
  if (!previous || !context.originalBrief.idea.trim() || context.baseSource.length > SOURCE_LIMIT) return project
  const reviewed: GuidedSession = { ...previous, source: context.baseSource, mode: context.originalBrief.mode }
  const brief = guidedBrief(context.originalBrief, reviewed, context.baseSource)
  return applyConditions(project, brief, reviewed)
}
