import { describe, expect, it } from 'vitest'
import { parseImport, parseWorkoutCSV } from './import-csv.js'

// The shape of a Jefit export (My Jefit → Settings → Data Controls → Export Data): several CSV
// tables in one file, each under a "### NAME ###" line. Every set of an exercise sits packed in
// one `logs` cell as "weight x reps"; the session it belongs to carries a Unix start time and
// its length in seconds. Sections openGym does not read (routines, body stats) come along too.
const start = (d, h, m) => Math.floor(new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime() / 1000)
const JEFIT = [
  '### MY ROUTINES ###',
  '_id,name,day',
  '1,"PPL, push",1',
  '',
  '### WORKOUT SESSIONS ###',
  '_id,mydate,starttime,endtime,total_time',
  `10,2026-03-02,${start('2026-03-02', 18, 0)},${start('2026-03-02', 19, 10)},4200`,
  `11,2026-03-02,${start('2026-03-02', 7, 30)},${start('2026-03-02', 8, 0)},1800`,
  `12,2026-03-04,${start('2026-03-04', 17, 0)},,3000`,
  '',
  '### EXERCISE LOGS ###',
  '_id,mydate,ename,logs,belongsession',
  '100,2026-03-02,Barbell Bench Press,"60x8,62.5x6,65x4",10',
  '101,2026-03-02,Dumbbell Lateral Raise,"10x12,10x12",10',
  '102,2026-03-02,Pull-Up,"0x10,0x8",11',
  '103,2026-03-04,Barbell Squat,"100x5,100x5,100x5",12',
  '104,2026-03-04,Grip Trainer Thing,"20x15",12',
  '105,2026-03-05,Leg Press,"140x10,bad",',
  '',
  '### BODY STATS ###',
  '_id,mydate,weight',
  '1,2026-03-01,82.5',
].join('\n')

describe('a Jefit export', () => {
  const parsed = parseWorkoutCSV(JEFIT, { unit: 'kg' })

  it('is recognised and unpacks every "weight x reps" into its own set', () => {
    expect(parsed.error).toBeUndefined()
    expect(parsed.source).toBe('Jefit')
    // 3 + 2 + 2 + 3 + 1 + 1, the unreadable "bad" counted rather than imported
    expect(parsed.sets).toBe(12)
    expect(parsed.skipped).toBe(1)
    const bench = parsed.workouts.flatMap(w => w.entries).find(e => e.sets.length === 3 && e.topW === 65)
    expect(bench.sets.map(s => [s.w, s.r])).toEqual([[60, 8], [62.5, 6], [65, 4]])
  })

  it('keeps two sessions on one day apart, at the time each started', () => {
    const mar2 = parsed.workouts.filter(w => w.d === '2026-03-02')
    expect(mar2).toHaveLength(2)
    const [morning, evening] = mar2
    expect(new Date(morning.start).getHours()).toBe(7)
    expect(new Date(evening.start).getHours()).toBe(18)
    expect((evening.end - evening.start) / 60000).toBe(70)
    expect((morning.end - morning.start) / 60000).toBe(30)
  })

  it('reads a bodyweight set as reps only and invents an exercise for an unknown name', () => {
    const pullups = parsed.workouts.find(w => w.d === '2026-03-02' && w.entries.length === 1).entries[0]
    expect(pullups.sets.map(s => [s.w, s.r])).toEqual([[0, 10], [0, 8]])
    expect(parsed.unmatchedNames).toContain('Grip Trainer Thing')
  })

  it('files a log with no session under its own date', () => {
    const lone = parsed.workouts.find(w => w.d === '2026-03-05')
    expect(lone.entries[0].sets.map(s => [s.w, s.r])).toEqual([[140, 10]])
  })

  it('is what parseImport picks, not the body-weight table further down', () => {
    expect(parseImport(JEFIT, { unit: 'kg' }).kind).toBe('workouts')
  })
})
