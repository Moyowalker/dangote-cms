export const VENDOR_ROLES = ['admin', 'vendor'];

export function isVendorRole(role) {
  return VENDOR_ROLES.includes(role);
}