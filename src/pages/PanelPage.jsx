import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { canAccessSection, canManagePermissions, SECTION } from '../lib/permissions'
const cards = [
 { section: SECTION.PARTS, title: 'Partes de trabajadores', description: 'Partes, obras, revisiones, ausencias y exportaciones.', to: '/partes-panel', icon: 'bi-clipboard-check' },
 { section: SECTION.WORKERS, title: 'Trabajadores', description: 'Consultar y gestionar la información de trabajadores.', to: '/trabajadores', icon: 'bi-people' },
 { section: SECTION.VEHICLES, title: 'Vehículos', description: 'Acceso al módulo de vehículos.', to: '/vehiculos', icon: 'bi-truck' },
]
export default function PanelPage() {
 const { profile } = useAuth()
 const visible = cards.filter(c => canAccessSection(profile, c.section))
 return <><div className="mb-4"><p className="text-success text-uppercase small fw-semibold mb-1">Panel de gestión</p><h1 className="h2 fw-bold">Bienvenido, {profile?.display_name}</h1><p className="text-secondary">Selecciona la sección a la que quieres acceder.</p></div><div className="row g-3">{visible.map(c => <div className="col-12 col-md-6 col-xl-4" key={c.section}><div className="card border-0 shadow-sm h-100"><div className="card-body p-4 d-flex flex-column"><h2 className="h5">{c.title}</h2><p className="text-secondary flex-grow-1">{c.description}</p><Link className="btn btn-outline-success align-self-start" to={c.to}>Abrir sección</Link></div></div></div>)}{canManagePermissions(profile) && <div className="col-12 col-md-6 col-xl-4"><div className="card border-success shadow-sm h-100"><div className="card-body p-4 d-flex flex-column"><h2 className="h5">Usuarios y permisos</h2><p className="text-secondary flex-grow-1">Administrar roles y permisos de acceso.</p><Link className="btn btn-success align-self-start" to="/usuarios-permisos">Administrar permisos</Link></div></div></div>}</div></>
}
