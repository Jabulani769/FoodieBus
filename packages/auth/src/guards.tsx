import type { ReactNode } from 'react';
import type { NavigateProps } from 'react-router-dom';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@foodiebus/types';
import { useAuth } from './context.js';

export interface AuthGuardProps {
  children: ReactNode;
  redirectTo?: NavigateProps['to'];
}

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export interface RoleGuardProps {
  children: ReactNode;
  roles: Role[];
  fallback?: ReactNode;
}

export function RoleGuard({ children, roles, fallback = null }: RoleGuardProps) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
