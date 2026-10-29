export const SECTION = Object.freeze({ PARTS: 'parts', WORKERS: 'workers', VEHICLES: 'vehicles', EPIS_ROPA: 'epis_ropa' })
export const ROLE = Object.freeze({ ADMIN: 'admin_general', PARTS: 'manager_parts', WORKERS: 'manager_workers', VEHICLES: 'manager_vehicles', EPIS_ROPA: 'manager_epis_ropa', WORKER: 'worker' })
export const SECTION_LABELS = Object.freeze({ parts: 'Partes de trabajadores', workers: 'Trabajadores', vehicles: 'Vehículos', epis_ropa: 'EPIS y ROPA' })
export function isGeneralAdmin(profile) { return profile?.active === true && profile?.role === ROLE.ADMIN }
export function canAccessSection(profile, section) {
  if (!profile?.active) return false
  if (isGeneralAdmin(profile)) return true
  if (section === SECTION.EPIS_ROPA && profile.role === ROLE.EPIS_ROPA) return true
  return Array.isArray(profile.permissions) && profile.permissions.includes(section)
}
export function canManagePermissions(profile) { return isGeneralAdmin(profile) }
