import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, streakWeeks, lastBW, setsDoneActive, setsDone, workoutDay, workoutDuration, workoutVolume, supersetUnits, unitOf, setUnitsTotal } from '../lib/history.js'
import { fmtNum, fmtDate, fmtVol, durPart, todayISO, isoOf, weekStartOf, weekDayOffset, DAYS, DAYN } from '../lib/format.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, starterPlanSheet, bwDeltaColor, weighInsSheet, workoutDetailSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import Elapsed from '../components/Elapsed.jsx'
import QueueRow from '../components/QueueRow.jsx'
import { queueOf, queueView, weekTally, pinState } from '../lib/queue.js'
import { scheduleModeOf } from '../lib/rotation.js'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'
import { dayNoteOf } from '../lib/day-notes.js'
import { weighInAt } from '../lib/bodyweight.js'
import { useDesktop } from '../lib/use-desktop.js'
import { fatigueOf } from '../lib/recovery.js'
import { fatigueStateOf } from '../lib/recovery-view.js'
import { MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { fatigueLabel, profileBodyweightKg } from './Stats.jsx'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  // The banner switched off and the sync stuck: a dot on the gear (Settings → Show connection status).
  const trouble = useConnectionTrouble()
  const [weekOffset, setWeekOffset] = useState(0)
  const desktop = useDesktop()
  // The six most tired muscles, for the desktop Recovery card. Only worked out on a wide window:
  // a phone never shows it, and the model walks the whole history.
  const recovery = useMemo(() => {
    if (!desktop || !S.workouts.length) return null
    const f = fatigueOf(S.workouts, Date.now(), { bodyweightKg: profileBodyweightKg(S), unit: S.unit })
    return MUSCLES.map(m => [m, f[m] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [desktop, S.workouts, S.bodyweight, S.unit])

  const today = new Date()
  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayISO())
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  // A fulfilled pin (a coach session pinned to today and since done) reads as no override.
  const todayOvr = S.dayPlan[todayISO()] !== undefined && pinState(S, S.dayPlan[todayISO()]) !== 'done'
  // An open editor on a saved workout (lib/session-edit.js) holds S.active too, but it is not a
  // session in progress: the row takes you back to it as an edit, the way the tab bar does.
  const editingSaved = !!S.active?.editingWorkoutId
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const ws = weekStartOf(S)
  // The first day of the shown week. Named for the role, not for Monday — which day that is
  // is the setting.
  const wkStart = new Date(today)
  wkStart.setDate(today.getDate() - weekDayOffset(today.getDay(), ws) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  // The last session logged for today, if any — what the row below reports instead of asking
  // you to start the one you already did. Last wins, so a second session names itself. Only once
  // today's plan is covered, though: a freestyle session on a planned day, or the rotation's
  // first session done when its next one is today's too, leaves the row offering what is still
  // to do, as Start and the progress row already do. A queue session is never "covered" by an
  // earlier workout: the queue only names one it does not count as done yet.
  const loggedToday = S.workouts.filter(w => w.d === todayISO())
  const queueIds = queueOf(S)?.ids || []
  const coveredToday = id => !queueIds.includes(id) && loggedToday.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
  const doneToday = (todayRoutines.every(r => coveredToday(r.id)) && loggedToday.at(-1)) || null
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    // In a rotation the weekdays plan nothing (lib/rotation.js); only what was done shows (desktop).
    const fixedWeek = scheduleModeOf(S) !== 'rotation'
    const eff = fixedWeek && effectiveRoutineIds(S, iso).length > 0, ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    const dayName = !desktop ? '' : done ? S.workouts.filter(w => w.d === iso).map(w => w.name).filter(Boolean).join(' + ')
      : eff ? effectiveRoutines(S, iso).map(r => r.name).join(' + ') : ''
    // A day off with a note (#261) reads as excused, not as a plan that went by.
    const dot = done ? ' done' : dayNoteOf(S, iso) ? ' noted' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} {...tappable(() => dayOverrideSheet(iso))}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} />
      {desktop && <div className="nm" title={dayName}>{dayName}</div>}</div>)
  }
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${wkStart.getDate()} ${wkStart.toLocaleDateString(dateLocale(), { month: 'short' })} – ${wkEnd.getDate()} ${wkEnd.toLocaleDateString(dateLocale(), { month: 'short' })}`

  // A coach week (S.queue) read through the same tolerant reader QueueRow uses, so a malformed
  // queue from another client shows the weekday dots, never an empty card.
  const queue = queueView(S, todayISO())
  // This card shows one thing or the other — QueueRow for a live queue, or Rotation chosen with
  // nothing built yet (S.scheduleMode), in which case there is no queue for QueueRow to render and
  // an empty-state card takes its place. Plan does the same in rotation mode: no weekday grid, only
  // the days that add a routine the loop does not have (Plan.jsx, "Also on fixed days").
  const rotating = scheduleModeOf(S) === 'rotation'
  // A planner-written queue (no rotationId) still names its weekday when it hasn't started yet —
  // that copy predates rotation and stays as it is. Our own rotation has no weekday of its own
  // (lib/rotation.js): naming one here — including on the pass's own one-day empty gap (THE
  // ONE-DAY BOUNDARY, rotation.js) or before a first routine is even added — would be the
  // fixed-week model leaking into a schedule that was never weekday-based.
  const liveQ = queueOf(S)
  const plannerQueue = !!queue && !liveQ?.rotationId
  // Ownership, not mere presence of a rotationId: a stale id left over from a rebuilt rotation
  // would otherwise still read as "this app manages it" (lib/rotation.js).
  const managedQueue = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length && !(rotating && !plannerQueue) ? nextTrainingDay(S, todayISO()) : null
  // The streak card's fraction: this calendar week's workouts over the weekdays with a plan, or,
  // in a coach week, the queue's sessions and your own days together (lib/queue.js weekTally).
  const { done: doneThisWeek, planned: plannedPerWeek } = weekTally(S, todayISO())
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: weighInAt(b), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (todayRoutines.length) startFlow(effectiveRoutineIds(S, todayISO())); else dayOverrideSheet(todayISO()) }
  // A chip on the coach week's progress row starts that one routine, in any order. A session
  // already in progress wins, as on the today row — starting another would overwrite it.
  const onQueueStart = id => { if (S.active) nav('/workout'); else startFlow([id]) }

  const header = <>
    <div className="hdr">
      <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}><Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}</button>
    </div>
  </>
  const weekCard = <>
    <div className="card">
      {/* A coach week runs by order, not by weekday, so its progress row stands in for the
          seven dots (components/QueueRow.jsx). The today row below stays as it is: the queue's
          next session reaches it through effectiveRoutineIds like any planned routine. */}
      {rotating && (queue ? <QueueRow S={S} today={todayISO()} onStart={onQueueStart} managed={managedQueue} /> : <div className="empty">
        {t('No rotation yet. Add routines to it in Plan.')}
        <div style={{ marginTop: 10 }}><Button size="sm" variant="tinted" onClick={() => nav('/plan')}>{t('Set up in Plan')}</Button></div>
      </div>)}
      {(!rotating || desktop) && <>
        {desktop ? <div className="row between wk-head">
          <h2>{wkLabel}</h2>
          <div className="row" style={{ gap: 4 }}>
            <button className="iconbtn" onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
            <button className="iconbtn" onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
          </div>
        </div> : <div className="row between" style={{ marginBottom: 8 }}>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
          <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
        </div>}
        <div className="week">{strip}</div>
      </>}
      {/* Once today's session is logged the row stops asking for it. The week strip already
          knew (its dot goes 'done'); this row did not, so a finished day kept showing the
          routine name behind a green Start tag and read as still outstanding (issue #4).
          An in-progress session still wins — that one is happening right now. Tapping the
          row keeps working, so a second session in one day is a tap away, just not urged. */}
      <div className="today-row" {...tappable(onToday)}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : doneToday ? 'var(--surface-3)' : routine ? 'var(--acc)' : 'var(--surface-3)' }}>
            <Icon name={S.active ? (editingSaved ? 'pencil' : 'play') : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'}
              style={doneToday && !S.active ? { color: 'var(--green)' } : undefined} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Today')}</div>
            <div className="ttl">{S.active ? (editingSaved ? S.active.name : t('{0} (in progress)', S.active.name))
              : doneToday ? (doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done'))
              : routine ? todayName : t('Rest day')}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
            {desktop && S.active && !editingSaved && S.active.entries.length > 0 && (() => {
              const units = supersetUnits(S.active.entries)
              const at = units.indexOf(unitOf(units, S.active.cur || 0)) + 1
              return <div className="ss">{t('Exercise {0} / {1}', at, units.length)} · {t('{0} sets', setsDoneActive(S.active) + '/' + setUnitsTotal(S.active.entries))} · <Elapsed start={S.active.start} /></div>
            })()}
            {next && !doneToday && !desktop && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{editingSaved ? t('Edit') : t('Resume')}</span>
          : doneToday ? <span className="tag" style={{ color: 'var(--green)', background: 'color-mix(in srgb,var(--green) 16%,transparent)' }}>{t('Done')}</span>
          : routine ? <span className="tag acc">{t('Start')}</span>
          : <Icon name="plus" className="chev" />}
      </div>
      {/* The row above starts today's plan in one tap, and so does the Start button in the tab
          bar — which is the whole problem when you want something else. Both jump straight into
          the planned session whenever there is one, so the Start screen (a freestyle session,
          and your other routines) is only reachable on a day with nothing planned. The one other
          way in, "Choose a different workout" on the weigh-in sheet, does not exist when the
          weigh-in is switched off. This is that door, and it starts nothing on its own. */}
      {!S.active && !desktop && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <Button size="sm" variant="ghost" className="dim" icon="swap" onClick={() => nav('/workout')}>
          {t('Choose a different workout')}
        </Button>
      </div>}
    </div>
  </>
  const checkInCard = <>
    {/* Jump to the gym check-in cards (QR membership codes). Shown here as a quick tap on
        arrival at the gym; folds away per user via the "Gym check-in" switch in Settings. */}
    {S.checkIn !== false && (
      <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => nav('/checkin'))}>
        <div className="row between">
          <div className="row" style={{ gap: 9 }}>
            <span className="lrow-i" style={{ background: 'var(--blue)' }}><Icon name="qr" /></span>
            <div>
              <div className="lbl2">{t('At the gym')}</div>
              <div className="ttl">{t('Check in')}</div>
            </div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      </div>
    )}
  </>
  const welcomeCard = <>
    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="calendar" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going, or grab a ready-made starter plan.')}</div>
        <Button variant="primary" icon="clipboard" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}
  </>
  const weightCard = <>
    {S.showWeightCard !== false && <div className="card">
      <div className="row between bw-head" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: '1rem' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginInlineStart: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--yellow)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 13 }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
        {/* every weigh-in, week by week with its average (Discord 'Weight') */}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
        </div>
      </> : <div className="muted small">{S.weighIn === false
        ? t('No weigh-ins yet. Log your weight to start the curve.')
        : t("No weigh-ins yet. Log your weight to start the curve (we also ask before every workout).")}</div>}
    </div>}
  </>
  const streakCard = <>
    <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => calendarSheet())}>
      <div className="row between">
        <div>
          <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
            <Icon name="flame" style={{ color: 'var(--orange)' }} />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>{doneThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {tn('{0} workout total', '{0} workouts total', S.workouts.length)}</div>
        </div>
        <Icon name="calendar" className="chev" style={{ fontSize: 20 }} />
      </div>
    </div>
  </>

  // A wide window (lib/use-desktop.js) lays Home out as a dashboard (index.css .home-desk): what
  // to do now with the week beside the streak, body weight beside recovery, then the year of
  // training and the last sessions. The check-in sits in the sidebar there. A phone keeps the
  // single column below, in its own order.
  if (desktop) {
    const lastW = S.workouts.at(-1)
    // Within the last week a weekday says it ("Wed"); further back, the date.
    const dayOrDate = iso => (todayISO() > iso && (new Date(todayISO()) - new Date(iso)) < 6 * 86400000
      ? t(DAYS[new Date(iso + 'T12:00:00').getDay()]) : fmtDate(iso))
    const upNext = !(rotating && !plannerQueue) ? nextTrainingDay(S, todayISO()) : null
    const yearFrom = isoOf(new Date(Date.now() - 365 * 86400000))
    const year = S.workouts.filter(w => (workoutDay(w) || '') >= yearFrom)
    const kpis = [
      [year.length, t('Workouts')],
      [fmtNum(Math.round(year.reduce((n, w) => n + workoutDuration(w), 0) / 3600000)), t('Hours')],
      [year.reduce((n, w) => n + (w.prs?.length || 0), 0), t('PRs')],
      [streakWeeks(S), t('Week streak')],
    ]
    const recent = S.workouts.slice(-6).reverse().filter(w => Array.isArray(w.entries))
    return <div className="home-desk">
      <div className="hdr">
        <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
        <div className="hdr-actions">
          {!S.active && <Button icon="swap" onClick={() => nav('/workout')}>{t('Choose a different workout')}</Button>}
          {S.active ? <Button variant="primary" icon="play" onClick={() => nav('/workout')}>{editingSaved ? t('Edit') : t('Resume')} · {S.active.name}</Button>
            : routine && !doneToday && <Button variant="primary" icon="play" onClick={onToday}>{t('Start')} · {todayName}</Button>}
        </div>
      </div>
      {welcomeCard}
      <div className="home-cols">
        {weekCard}
        <div className="card dk-streak">
          <div className="dk-streak-t"><Icon name="flame" />{t('{0} week streak', streakWeeks(S))}</div>
          <div className="muted small">{doneThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {tn('{0} workout total', '{0} workouts total', S.workouts.length)}</div>
          {plannedPerWeek > 0 && <div className="dk-bar"><i style={{ width: Math.min(100, doneThisWeek / plannedPerWeek * 100) + '%' }} /></div>}
          <div className="dk-kv">
            {upNext && <div className="row between"><span className="muted">{t('Next session')}</span><b>{t(DAYS[upNext.weekday])} · {upNext.routine.name}</b></div>}
            {lastW && <div className="row between"><span className="muted">{t('Last workout')}</span><span>{dayOrDate(lastW.d)} · {lastW.name}</span></div>}
          </div>
          <Button size="sm" icon="calendar" onClick={() => calendarSheet()}>{t('Calendar')}</Button>
        </div>
        {weightCard}
        {recovery && <div className="card">
          <div className="row between"><h2 style={{ margin: 0 }}>{t('Recovery')}</h2>
            <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/stats')}>{t('Open')}</Button></div>
          <div className="muted small" style={{ margin: '2px 0 8px' }}>{t('Fatigue shows how recently each muscle was trained. High means rest.')}</div>
          {recovery.map(([m, v]) => <div key={m} className={'dk-rec ' + fatigueStateOf(v)}>
            <span>{t(MUSCLE_NAME[m])}</span>
            <div className="dk-bar"><i style={{ width: Math.min(100, v * 100) + '%' }} /></div>
            <span className="tag nocap">{fatigueLabel(v)}</span>
          </div>)}
        </div>}
      </div>
      {S.workouts.length > 0 && <div className="card">
        <h2>{t('Activity (last 12 months)')}</h2>
        <div className="dk-kpis">{kpis.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>
        <Heatmap S={S}
          metric={S.heatmapMetric === 'vol' ? 'vol' : 'time'}
          onMetricChange={metric => useStore.getState().update(s => { s.heatmapMetric = metric })}
          onDay={iso => calendarSheet(iso)} />
      </div>}
      {recent.length > 0 && <div className="card dk-recent">
        <div className="row between"><h2 style={{ margin: 0 }}>{t('Recent workouts')}</h2>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('Progress & history')}</Button></div>
        <div className="dk-tr dk-th" aria-hidden="true"><span>{t('Workout')}</span><span>{t('Date')}</span><span className="num">{t('Duration')}</span><span className="num">{t('Sets')}</span><span className="num">{t('Volume')}</span><span className="num">{t('PRs')}</span></div>
        {recent.map(w => <button key={w.id} className="dk-tr" onClick={() => workoutDetailSheet(w)}>
          <b>{w.name}</b>
          <span className="muted">{fmtDate(w.d, true)}</span>
          <span className="num muted">{durPart(workoutDuration(w))[0] || '–'}</span>
          <span className="num">{setsDone(w)}</span>
          <span className="num"><b>{fmtVol(w.vol ?? workoutVolume(w), S.unit)}</b></span>
          <span className="num">{w.prs?.length ? <span className="tag nocap" style={{ color: 'var(--yellow)' }}>{w.prs.length}</span> : ''}</span>
        </button>)}
      </div>}
    </div>
  }

  return <div className="narrow">
    {header}
    {weekCard}
    {checkInCard}
    {welcomeCard}
    {weightCard}
    {streakCard}
  </div>
}
