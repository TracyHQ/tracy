import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useMemo, useState } from 'react'
import { type Job, makeApi } from '../../../../../site/tracy-site-build-core/src/client/api'
import { BuildWorkspace } from '../../../../../site/tracy-site-build-core/src/client/BuildWorkspace'
import { parkComposer } from '../../../../../site/tracy-site-build-core/src/client/composer'
import { baseEn, type Translate } from '../../../../../site/tracy-site-build-core/src/client/strings'

export default { title: 'Pages/In dsh/Build workspace', parameters: { layout: 'fullscreen' } } satisfies Meta
const t: Translate = (key, params) =>
  (baseEn[key as keyof typeof baseEn] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    String(params?.[name] ?? match)
  )

/** Transport fixtures only; every control is the production component. */
export const Workspace: StoryObj = {
  render: function WorkspaceStory() {
    const [ready, setReady] = useState(false)
    const api = useMemo(
      () => makeApi({ name: 'tracy-site-build-joomla', stages: ['seed'] }, 'fixture-session'),
      []
    )
    useEffect(() => {
      const original = window.fetch
      const at = '2026-09-13T08:00:00Z'
      const job: Job = {
        job: 'fixture-build',
        inspiration: 'apple',
        platform: 'joomla',
        status: 'done',
        startedAt: at,
        endedAt: at,
        targetSiteKey: 'workspace.example',
        targetUrl: 'https://workspace.example/',
        stages: [{ name: 'seed', status: 'done' }],
        runs: 1,
        answers: {
          name: 'Review fixture',
          about: 'Industrial infrastructure',
          pages: ['home', 'contact'],
          languages: ['en', 'ru'],
          tone: 'plain'
        }
      }
      job.brief = { answers: job.answers ?? {}, updatedAt: at }
      const report = {
        at,
        revision: at,
        currentRevision: at,
        targets: [
          {
            id: 'page:home:en',
            label: 'Home',
            kind: 'article',
            entityId: '89',
            page: 'home',
            language: 'en',
            position: '',
            field: 'content',
            scope: 'page',
            source: 'receipt'
          },
          {
            id: 'menu:home:en',
            label: 'Home',
            kind: 'menuItem',
            entityId: '332',
            page: 'home',
            language: 'en',
            position: 'menu',
            field: 'title',
            scope: 'site',
            source: 'receipt'
          },
          {
            id: 'hero',
            label: 'Project heading',
            kind: 'module',
            entityId: '42',
            page: 'home',
            language: 'en-GB',
            position: 'hero',
            field: 'title',
            scope: 'site',
            source: 'review'
          },
          {
            id: 'setting:mailonline',
            label: 'Contact mail',
            kind: 'setting',
            field: 'mailonline',
            page: '',
            language: '',
            position: '',
            scope: 'site',
            source: 'spec'
          }
        ],
        questions: [
          {
            id: 'figures',
            title: 'Project figures',
            prompt: 'Which project figures should we use?',
            source: 'Fixture / content-rules.md',
            targetId: 'hero'
          }
        ],
        checks: [
          {
            id: 'stage:seed',
            label: 'seed',
            status: 'passed',
            evidence: 'all',
            at,
            revision: at,
            source: 'stage'
          },
          {
            id: 'mobile',
            label: 'Mobile layout',
            status: 'unverified',
            evidence: '',
            at: '',
            targetId: 'hero',
            revision: at,
            source: 'review'
          }
        ],
        comments: [] as Record<string, unknown>[]
      }
      const json = (value: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
        )
      window.fetch = (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          location.href
        )
        if (url.pathname.includes('tracy-site-build-joomla')) {
          const route = url.pathname.split('/').at(-1)
          if (route === 'workspace') return json(report)
          if (route === 'job') return json(job)
          if (route === 'ask') return json(null)
          if (route === 'answers') {
            const body = JSON.parse(String(init?.body)) as { answers: NonNullable<Job['answers']> }
            job.answers = { ...job.answers, ...body.answers }
            job.brief = { answers: job.answers, updatedAt: new Date().toISOString() }
            return Promise.resolve(
              new Response(JSON.stringify(job), {
                status: 202,
                headers: { 'content-type': 'application/json' }
              })
            )
          }
          if (route === 'comment') {
            const body = JSON.parse(String(init?.body)) as { targetId: string; questionId?: string }
            report.comments.push({
              ...body,
              id: String(report.comments.length + 1),
              target: report.targets.find((item) => item.id === body.targetId),
              at: new Date().toISOString(),
              status: 'sent',
              question: body.questionId ? report.questions[0]?.prompt : undefined
            })
            return json({ ok: true })
          }
          if (route === 'inspect') return json({ ok: true })
        }
        if (url.pathname.endsWith('/backups'))
          return json({
            latest: null,
            rows: [
              {
                kind: 'moment',
                sha: 'fixture-sha',
                title: 'Update project heading',
                at: 1789290000,
                files: 1,
                by: { kind: 'agent' }
              }
            ]
          })
        if (url.pathname.endsWith('/site') || url.pathname.endsWith('/ask')) return json(null)
        return original(input, init)
      }
      parkComposer({ setDraft() {}, submit() {} })
      setReady(true)
      return () => {
        window.fetch = original
        parkComposer(undefined)
      }
    }, [])
    return (
      <div style={{ maxWidth: 560, height: '100vh', margin: 'auto' }}>
        {ready && (
          <BuildWorkspace
            spec={{ api, platform: 'joomla', platformName: 'Joomla' }}
            workspace={{ adminUrl: (siteUrl) => new URL('administrator/', siteUrl).href }}
            meta={{ siteKey: 'workspace.example' }}
            t={t}
            icon={<span>J</span>}
            preview={() => <div className="p-4">Preview transport fixture</div>}
          />
        )}
      </div>
    )
  }
}

/**
 * A build the tab watches end (David, 24/09): the brief shows the build running, and when the job
 * turns `done` the workspace opens the live site in place — the Monitor toggle's own preview, no
 * new tab. The job flips after two polls; the preview fixture is tinted so the turn is visible.
 */
export const BuildEndsOnLiveSite: StoryObj = {
  render: function BuildEndsStory() {
    const [ready, setReady] = useState(false)
    const api = useMemo(
      () => makeApi({ name: 'tracy-site-build-emdash', stages: ['check', 'personalize'] }, 'fixture-session'),
      []
    )
    useEffect(() => {
      const original = window.fetch
      const at = new Date().toISOString()
      const job: Job = {
        job: 'fixture-build',
        inspiration: 'tracy-business',
        platform: 'emdash',
        status: 'running',
        startedAt: at,
        targetSiteKey: 'workspace.example',
        targetUrl: 'https://workspace.example/',
        stages: [
          { name: 'check', status: 'done' },
          { name: 'personalize', status: 'running' }
        ],
        runs: 1,
        answers: { name: 'Review fixture', languages: ['en'] }
      }
      const finish = window.setTimeout(() => {
        job.status = 'done'
        job.endedAt = new Date().toISOString()
        job.stages = job.stages.map((stage) => ({ ...stage, status: 'done' }))
        job.brief = { answers: job.answers ?? {}, updatedAt: job.endedAt }
      }, 5000)
      const json = (value: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
        )
      window.fetch = (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          location.href
        )
        if (url.pathname.includes('tracy-site-build-emdash')) {
          const route = url.pathname.split('/').at(-1)
          if (route === 'job') return json(job)
          if (route === 'workspace')
            return json({ at, revision: at, currentRevision: at, targets: [], questions: [], comments: [] })
          if (route === 'ask') return json(null)
        }
        if (url.pathname.endsWith('/backups')) return json({ latest: null, rows: [] })
        if (url.pathname.endsWith('/site') || url.pathname.endsWith('/ask')) return json(null)
        return original(input, init)
      }
      parkComposer({ setDraft() {}, submit() {} })
      setReady(true)
      return () => {
        window.clearTimeout(finish)
        window.fetch = original
        parkComposer(undefined)
      }
    }, [])
    return (
      <div style={{ maxWidth: 560, height: '100vh', margin: 'auto' }}>
        {ready && (
          <BuildWorkspace
            spec={{ api, platform: 'emdash', platformName: 'EmDash' }}
            workspace={{}}
            meta={{ siteKey: 'workspace.example' }}
            t={t}
            icon={<span>E</span>}
            preview={(siteKey) => (
              <div className="m-4 rounded-md bg-emerald-50 p-6 text-emerald-900" data-testid="live-site">
                Live site fixture — {siteKey}
              </div>
            )}
          />
        )}
      </div>
    )
  }
}
