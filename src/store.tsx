import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db, uid } from './lib/db'
import { loadIndex, loadTemplate, validateTemplate } from './lib/templates'
import type { Project, Template, TemplateIndexEntry } from './types'

interface Store {
  ready: boolean
  error: string | null
  index: TemplateIndexEntry[]
  projects: Project[]
  project: Project | null
  template: Template | null
  openProject: (id: string | null) => Promise<void>
  createProject: (entry: TemplateIndexEntry, name: string) => Promise<void>
  updateProject: (patch: (p: Project) => Project) => void
  deleteProject: (id: string) => Promise<void>
  importProject: (json: string) => Promise<void>
}

const Ctx = createContext<Store | null>(null)

const CURRENT = 'prompt-coach:current'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<TemplateIndexEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    const all = await db.all()
    all.sort((a, b) => b.updatedAt - a.updatedAt)
    setProjects(all)
    return all
  }, [])

  const openProject = useCallback(
    async (id: string | null) => {
      if (!id) {
        setProject(null)
        setTemplate(null)
        localStorage.removeItem(CURRENT)
        return
      }
      const p = await db.get(id)
      if (!p) return
      const entry = index.find((e) => e.id === p.templateId)
      if (!entry) {
        setError(`이 프로젝트의 템플릿(${p.templateId})이 더 이상 없어요.`)
        return
      }
      const t = await loadTemplate(entry)
      const problems = validateTemplate(t)
      if (problems.length) setError(`템플릿 오류: ${problems.join(' / ')}`)
      setTemplate(t)
      setProject(p)
      localStorage.setItem(CURRENT, id)
    },
    [index],
  )

  useEffect(() => {
    ;(async () => {
      try {
        const idx = await loadIndex()
        setIndex(idx)
        await refresh()
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setReady(true)
      }
    })()
  }, [refresh])

  // reopen the last project once templates are known
  const reopened = useRef(false)
  useEffect(() => {
    if (!ready || reopened.current || !index.length) return
    reopened.current = true
    const id = localStorage.getItem(CURRENT)
    if (id) openProject(id)
  }, [ready, index, openProject])

  const createProject = useCallback(
    async (entry: TemplateIndexEntry, name: string) => {
      const now = Date.now()
      const p: Project = { id: uid(), templateId: entry.id, name: name || entry.name, createdAt: now, updatedAt: now, decisions: {}, references: [], locks: [], iterations: [] }
      await db.put(p)
      await refresh()
      await openProject(p.id)
    },
    [refresh, openProject],
  )

  const updateProject = useCallback((patch: (p: Project) => Project) => {
    setProject((prev) => {
      if (!prev) return prev
      const next = { ...patch(prev), updatedAt: Date.now() }
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        db.put(next).then(() => db.all().then((all) => setProjects(all.sort((a, b) => b.updatedAt - a.updatedAt))))
      }, 250)
      return next
    })
  }, [])

  const deleteProject = useCallback(
    async (id: string) => {
      await db.remove(id)
      if (project?.id === id) await openProject(null)
      await refresh()
    },
    [project, openProject, refresh],
  )

  const importProject = useCallback(
    async (json: string) => {
      const p = JSON.parse(json) as Project
      if (!p || typeof p !== 'object' || !p.templateId || !p.decisions) throw new Error('프로젝트 파일 형식이 아니에요')
      if (!index.some((e) => e.id === p.templateId)) throw new Error(`이 파일의 템플릿(${p.templateId})이 여기에는 없어요`)
      const copy: Project = { ...p, id: uid(), updatedAt: Date.now(), locks: p.locks ?? [], references: p.references ?? [], iterations: p.iterations ?? [] }
      await db.put(copy)
      await refresh()
      await openProject(copy.id)
    },
    [index, refresh, openProject],
  )

  const value = useMemo<Store>(
    () => ({ ready, error, index, projects, project, template, openProject, createProject, updateProject, deleteProject, importProject }),
    [ready, error, index, projects, project, template, openProject, createProject, updateProject, deleteProject, importProject],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
