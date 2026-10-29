import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from './ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import PanelPage from '../pages/PanelPage'
import UserPermissionsPage from '../pages/UserPermissionsPage'
import VehiclesPage from '../pages/VehiclesPage'
import WorkReportPage from '../pages/WorkReportPage'
import MyReportsPage from '../pages/MyReportsPage'
import WorksitesPage from '../pages/WorksitesPage'
import EmployeesPage from '../pages/EmployeesPage'
import WorkerRecordsPage from '../pages/WorkerRecordsPage'
import ReviewsPage from '../pages/ReviewsPage'
import AbsencesPage from '../pages/AbsencesPage'
import ReportsExportPage from '../pages/ReportsExportPage'
import EpisPage from '../pages/EpisPage'
import ClothingStockPage from '../pages/ClothingStockPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import NotFoundPage from '../pages/NotFoundPage'
import { SECTION } from '../lib/permissions'
export default function AppRouter() {
 return <Routes><Route path="/login" element={<LoginPage/>}/><Route element={<ProtectedRoute/>}><Route element={<AppLayout/>}><Route index element={<Navigate to="/panel" replace/>}/><Route path="panel" element={<PanelPage/>}/><Route path="dashboard" element={<Navigate to="/panel" replace/>}/><Route path="parte" element={<WorkReportPage/>}/><Route path="mis-partes" element={<MyReportsPage/>}/><Route path="sin-permiso" element={<ForbiddenPage/>}/>
 <Route element={<ProtectedRoute requiredSection={SECTION.PARTS}/> }><Route path="usuarios" element={<EmployeesPage/>}/><Route path="partes-panel" element={<DashboardPage/>}/><Route path="obras" element={<WorksitesPage/>}/><Route path="revisiones" element={<ReviewsPage/>}/><Route path="ausencias" element={<AbsencesPage/>}/><Route path="exportar" element={<ReportsExportPage/>}/></Route>
 <Route element={<ProtectedRoute requiredSection={SECTION.WORKERS}/> }><Route path="trabajadores" element={<WorkerRecordsPage/>}/></Route>
 <Route element={<ProtectedRoute requiredSection={SECTION.VEHICLES}/> }><Route path="vehiculos" element={<VehiclesPage/>}/></Route>
 <Route element={<ProtectedRoute requiredSection={SECTION.EPIS_ROPA}/> }><Route path="epis" element={<EpisPage/>}/><Route path="ropa" element={<ClothingStockPage/>}/></Route>
 <Route element={<ProtectedRoute requirePermissionManagement/>}><Route path="usuarios-permisos" element={<UserPermissionsPage/>}/></Route>
 </Route></Route><Route path="*" element={<NotFoundPage/>}/></Routes>
}
