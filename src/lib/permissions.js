export const SECTION = Object.freeze({ PARTS: 'parts', WORKERS: 'workers', VEHICLES: 'vehicles' })
export const ROLE = Object.freeze({ ADMIN: 'admin_general', PARTS: 'manager_parts', WORKERS: 'manager_workers', VEHICLES: 'manager_vehicles', WORKER: 'worker' })
export const SECTION_LABELS = Object.freeze({ parts: 'Partes de trabajadores', workers: 'Trabajadores', vehicles: 'Vehículos' })
export function isGeneralAdmin(profile) { return profile?.active === true && profile?.role === ROLE.ADMIN }
export function canAccessSection(profile, section) {
  if (!profile?.active) return false
  if (isGeneralAdmin(profile)) return true
  return Array.isArray(profile.permissions) && profile.permissions.includes(section)
}
export function canManagePermissions(profile) { return isGeneralAdmin(profile) }
