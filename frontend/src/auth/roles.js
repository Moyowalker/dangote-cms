export const ADMIN_ROLE = 'admin';
export const VENDOR_ROLE = 'vendor';
export const VIEWER_ROLE = 'viewer';
export const HR_ROLE = 'hr';
export const EMPLOYEE_ROLE = 'employee';

export const VENDOR_ROLES = [ADMIN_ROLE, VENDOR_ROLE];
export const REPORT_VIEWER_ROLES = [ADMIN_ROLE, VIEWER_ROLE, HR_ROLE];
export const MENU_MANAGEMENT_ROLES = [ADMIN_ROLE];
export const WORKFORCE_VIEW_ROLES = [ADMIN_ROLE, HR_ROLE];
export const HELP_DESK_ROLES = [ADMIN_ROLE, VENDOR_ROLE];
export const OFFLINE_ACTIVITY_ROLES = [ADMIN_ROLE, VENDOR_ROLE, VIEWER_ROLE, HR_ROLE];

export function isVendorRole(role) {
  return VENDOR_ROLES.includes(role);
}

export function isReportViewerRole(role) {
  return REPORT_VIEWER_ROLES.includes(role);
}

export function canViewWorkforce(role) {
  return WORKFORCE_VIEW_ROLES.includes(role);
}

export function canManageMenu(role) {
  return MENU_MANAGEMENT_ROLES.includes(role);
}

export function canAccessHelpDesk(role) {
  return HELP_DESK_ROLES.includes(role);
}

export function canAccessOfflineActivity(role) {
  return OFFLINE_ACTIVITY_ROLES.includes(role);
}