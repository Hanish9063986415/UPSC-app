export const INSTAMARK_MAINTENANCE_MESSAGE =
  "Instamark is temporarily under maintenance. Please try again in a few minutes.";

export function isMaintenanceDetail(detail) {
  if (!detail || typeof detail !== "object") return false;
  return detail.code === "maintenance" || detail.code === "wallet_billing_unavailable";
}

export function messageFromApiDetail(detail, fallback = INSTAMARK_MAINTENANCE_MESSAGE) {
  if (typeof detail === "string") {
    if (/DATABASE_URL|Supabase|billing database/i.test(detail)) {
      return INSTAMARK_MAINTENANCE_MESSAGE;
    }
    return detail;
  }
  if (isMaintenanceDetail(detail)) {
    return detail.message || INSTAMARK_MAINTENANCE_MESSAGE;
  }
  return detail?.message || fallback;
}

export function parseMaintenancePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const detail = payload.detail ?? payload;
  if (typeof detail === "string" && /DATABASE_URL|Supabase/i.test(detail)) {
    return { message: INSTAMARK_MAINTENANCE_MESSAGE, maintenance: true };
  }
  if (isMaintenanceDetail(detail)) {
    return {
      message: messageFromApiDetail(detail),
      maintenance: true,
    };
  }
  return null;
}
