import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import AppRouter from './routes/AppRouter'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  )
}
