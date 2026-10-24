// The Admin page's sections. On a wide window each is its own page, /admin/<id>, linked from the
// sidebar (TabBar.jsx); a phone shows them all on one page (views/Admin.jsx). The dashboard is
// English-only, so are these labels.
export const ADMIN_SECTIONS = [
  ['overview', 'Overview', 'grid'],
  ['users', 'Users', 'person'],
  ['invites', 'Invite codes', 'envelope'],
  ['coach', 'Coach', 'sparkles'],
  ['activity', 'Activity log', 'history'],
]

/** The section a path names, `overview` for /admin itself or anything unknown. */
export const adminSectionOf = path => {
  const id = String(path || '').split('/')[2]
  return ADMIN_SECTIONS.some(([s]) => s === id) ? id : 'overview'
}
