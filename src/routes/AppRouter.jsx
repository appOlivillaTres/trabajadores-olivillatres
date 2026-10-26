import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from './ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import WorkReportPage from '../pages/WorkReportPage'
import MyReportsPage from '../pages/MyReportsPage'
import WorksitesPage from '../pages/WorksitesPage'
import EmployeesPage from '../pages/EmployeesPage'
import ReviewsPage from '../pages/ReviewsPage'
import AbsencesPage from '../pages/AbsencesPage'
import ReportsExportPage from '../pages/ReportsExportPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import NotFoundPage from '../pages/NotFoundPage'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/parte" replace />} />
          <Route path="parte" element={<WorkReportPage />} />
          <Route path="mis-partes" element={<MyReportsPage />} />
          <Route path="sin-permiso" element={<ForbiddenPage />} />

          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="obras" element={<WorksitesPage />} />
            <Route path="trabajadores" element={<EmployeesPage />} />
            <Route path="revisiones" element={<ReviewsPage />} />
            <Route path="ausencias" element={<AbsencesPage />} />
            <Route path="exportar" element={<ReportsExportPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
