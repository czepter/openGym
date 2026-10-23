import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import { useConnectionTrouble } from './SyncBanner.jsx'
import { coachAvailable } from '../lib/coach.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'

// The Admin page's cards, reachable from the sidebar while it is open (views/Admin.jsx ids).
// The dashboard is English-only, so are these.
const ADMIN_SECTIONS = [['adm-overview', 'Overview'], ['adm-users', 'Users'], ['adm-invites', 'Invite codes'], ['adm-coach', 'Coach'], ['adm-activity', 'Activity log']]

// Module scope, not TabBar's render body. Declared inside it, `Tab` was a new function on every
// render, so React saw a different component type each time and threw the button away and built a
// fresh one — on a bar that is fixed on screen, and once a second for the whole of a rest. The
// state it took with it is the DOM node itself: focus, the :active tint, any in-flight transition.
function Tab({ active, icon, label, onClick, dot }) {
  return (
    <button className={active ? 'on' : ''} onClick={onClick} aria-label={dot ? label + ', ' + t('Connection problem') : undefined}>
      <span className="tab-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}</span><span>{label}</span>
    </button>
  )
}

export default function TabBar({ onStart, desktop = false }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  // With the connection banner switched off, a sync problem shows as a dot on Home, the tab
  // Settings lives under (#369, #330).
  const trouble = useConnectionTrouble()
  const config = useStore(s => s.config)
  const coachMode = useStore(s => s.coachLocal?.mode)
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home' && !desktop) || (cur === 'muscles' && k === 'library') || (cur === 'structural-balance' && k === 'stats')

  const running = !!S.active && cur !== 'workout' && !S.active.editingWorkoutId && !S.active.backfill && S.active.start > 0
  const startWorkout = () => {
    if (!S.active) {
      // A weekday can hold several routines; start the combined session if any of them has
      // exercises, otherwise fall through to the picker.
      if (effectiveRoutines(S, todayISO()).some(r => r.ex.length)) { onStart(effectiveRoutineIds(S, todayISO())); return }
    }
    nav('/workout')
  }

  return (
    <nav id="tabbar">
      <Tab active={on('home')} icon="house" label={t('Home')} dot={trouble && !desktop} onClick={() => nav('/home')} />
      <Tab active={on('plan')} icon="calendar" label={t('Plan')} onClick={() => nav('/plan')} />
      {/* On the workout screen itself there is nothing to resume, so the button reads as the
          tab it is and stays lit (#29); anywhere else it brings you back to the exercise you
          were on — the marker is kept in S.active.cur and never moves on its own (#21). The
          glyph is always play: start and resume are one concept, and an exercise is a dumbbell.
          A live session you stepped away from shows its running time instead of a word, the
          button still named Resume; a past workout being edited or logged after the fact has no
          clock to run. */}
      <button className={'start' + (S.active ? ' rec' : '') + (S.active && cur === 'workout' ? ' on' : '')} onClick={startWorkout}
        aria-label={running ? t('Resume') : undefined}>
        <span className="cir"><Icon name="play" /></span>
        {running ? <span className="tab-time"><Elapsed start={S.active.start} /></span>
          : <span>{S.active ? (cur === 'workout' ? t('Workout') : S.active.editingWorkoutId ? t('Edit workout') : t('Resume')) : t('Start')}</span>}
      </button>
      <Tab active={on('stats')} icon="chart" label={t('Stats')} onClick={() => nav('/stats')} />
      <Tab active={on('library')} icon="dumbbell" label={t('Exercises')} onClick={() => nav('/library')} />
      {/* Wide windows only: the tab bar is a sidebar there (index.css, "desktop sidebar"), with
          room for what a phone reaches through Home's gear, Plan's header and the cards. */}
      {desktop && <>
        <div className="side-brand"><span className="side-logo"><Icon name="dumbbell" /></span>openGym</div>
        {coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, coachMode }) &&
          <Tab active={cur === 'coach'} icon="sparkles" label={t('Coach')} onClick={() => nav('/coach')} />}
        <div className="side-gap" />
        {S.checkIn !== false && <Tab active={cur === 'checkin'} icon="qr" label={t('Check in')} onClick={() => nav('/checkin')} />}
        {user?.admin && <Tab active={cur === 'admin'} icon="shield" label="Admin" onClick={() => nav('/admin')} />}
        {cur === 'admin' && ADMIN_SECTIONS.map(([id, label]) =>
          <button key={id} className="side-sub" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>)}
        <Tab active={cur === 'settings'} icon="gear" label={t('Settings')} dot={trouble} onClick={() => nav('/settings')} />
      </>}
    </nav>
  )
}
