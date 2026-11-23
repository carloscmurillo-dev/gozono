import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { NewTicketPage } from './pages/NewTicketPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { UsersPage } from './pages/UsersPage';
import { MessagesPage } from './pages/MessagesPage';

// El dashboard es para el personal; un cliente entra directo a sus tiquetes.
function Home() {
  const { isStaff } = useAuth();
  return isStaff ? <DashboardPage /> : <Navigate to="/tiquetes" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/restablecer" element={<ResetPasswordPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }>
            <Route index element={<Home />} />
            <Route path="tiquetes" element={<TicketsPage />} />
            <Route path="tiquetes/nuevo" element={<NewTicketPage />} />
            <Route path="tiquetes/:id" element={<TicketDetailPage />} />
            <Route
              path="clientes"
              element={
                <RequireAuth access="staff">
                  <OrganizationsPage />
                </RequireAuth>
              }
            />
            <Route
              path="mensajes"
              element={
                <RequireAuth access="staff">
                  <MessagesPage />
                </RequireAuth>
              }
            />
            <Route
              path="usuarios"
              element={
                <RequireAuth access="admin">
                  <UsersPage />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
