import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { canAccessSection, canManagePermissions, SECTION } from '../lib/permissions'
const cards = [
 { section: SECTION.PARTS, title: 'Partes de trabajadores', description: 'Partes, obras, revisiones, ausencias y exportaciones.', to: '/partes-panel' },
 { section: SECTION.WORKERS, title: 'Trabajadores', description: 'Consultar y gestionar la información de trabajadores.', to: '/trabajadores' },
 { section: SECTION.VEHICLES, title: 'Vehículos', description: 'Acceso al módulo de vehículos.', to: '/vehiculos' },
 { section: SECTION.EPIS_ROPA, title: 'EPIS', description: 'Registrar entregas y generar justificantes de recepción.', to: '/epis' },
 { section: SECTION.EPIS_ROPA, title: 'ROPA', description: 'Control de artículos, tallas, entradas y movimientos de stock.', to: '/ropa' },
]
export default function PanelPage() {
 const { profile } = useAuth()
 const visible = cards.filter(c => canAccessSection(profile, c.section))
 return <><div className="mb-4"><p className="text-success text-uppercase small fw-semibold mb-1">Panel de gestión</p><h1 className="h2 fw-bold">Bienvenido, {profile?.display_name}</h1><p className="text-secondary">Selecciona la sección a la que quieres acceder.</p></div><div className="row g-3">{visible.map((c,i) => <div className="col-12 col-md-6 col-xl-4" key={`${c.to}-${i}`}><div className="card border-0 shadow-sm h-100"><div className="card-body p-4 d-flex flex-column"><h2 className="h5">{c.title}</h2><p className="text-secondary flex-grow-1">{c.description}</p><Link className="btn btn-outline-success align-self-start" to={c.to}>Abrir sección</Link></div></div></div>)}{canManagePermissions(profile) && <div className="col-12 col-md-6 col-xl-4"><div className="card border-success shadow-sm h-100"><div className="card-body p-4 d-flex flex-column"><h2 className="h5">Usuarios y permisos</h2><p className="text-secondary flex-grow-1">Administrar roles y permisos de acceso.</p><Link className="btn btn-success align-self-start" to="/usuarios-permisos">Administrar permisos</Link></div></div></div>}</div></>
}
