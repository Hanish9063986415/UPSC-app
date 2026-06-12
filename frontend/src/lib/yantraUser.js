const STORAGE_KEY = "yantra-user-session";

const USER_ID_PARAMS = ["yantra_user_id", "user_id", "userId", "_id"];
const USER_NAME_PARAMS = [
  "yantra_user_name",
  "user_name",
  "userName",
  "name",
  "display_name",
  "displayName"
];
const USER_EMAIL_PARAMS = ["user_email", "email"];

const URL_PARAMS_TO_STRIP = [...USER_ID_PARAMS, ...USER_NAME_PARAMS, ...USER_EMAIL_PARAMS];

function readFirstParam(params, keys) {
  for (const key of keys) {
    const value = params.get(key);
    if (value?.trim()) return value.trim();
  }
  return null;
}

function normalizeContext(raw = {}) {
  const userId =
    raw.userId ||
    raw.user_id ||
    raw._id ||
    raw.yantra_user_id ||
    import.meta.env.VITE_YANTRA_USER_ID?.trim() ||
    null;
  const userName =
    raw.userName ||
    raw.user_name ||
    raw.yantra_user_name ||
    raw.name ||
    raw.display_name ||
    import.meta.env.VITE_YANTRA_USER_NAME?.trim() ||
    null;
  const email = raw.email || raw.user_email || import.meta.env.VITE_YANTRA_USER_EMAIL?.trim() || null;

  return { userId, userName, email };
}

function loadStoredContext() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizeContext({});
    return normalizeContext(JSON.parse(stored));
  } catch {
    return normalizeContext({});
  }
}

function saveContext(context) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

function stripUserParamsFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;

  for (const param of URL_PARAMS_TO_STRIP) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }

  if (changed) {
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  }
}

/** Read user id/name from URL, persist for the session, and clean the address bar. */
export function captureYantraUserFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    userId: readFirstParam(params, USER_ID_PARAMS),
    userName: readFirstParam(params, USER_NAME_PARAMS),
    email: readFirstParam(params, USER_EMAIL_PARAMS)
  };

  if (fromUrl.userId || fromUrl.userName || fromUrl.email) {
    const context = normalizeContext(fromUrl);
    saveContext(context);
    stripUserParamsFromUrl();
    return context;
  }

  return loadStoredContext();
}

export function getYantraUser() {
  return loadStoredContext();
}

export function getYantraUserId() {
  return getYantraUser().userId;
}

export function getYantraUserDisplayName() {
  const { userName, email, userId } = getYantraUser();
  if (userName) return userName;
  if (email) return email;
  if (userId) return `User ${userId.slice(0, 8)}`;
  return null;
}

export function getYantraUserInitial() {
  const label = getYantraUserDisplayName();
  if (!label) return "?";
  return label.trim().charAt(0).toUpperCase();
}

export function isYantraUserSignedIn() {
  const { userId, userName, email } = getYantraUser();
  return Boolean(userId || userName || email);
}

/** Parent YantraIAS page can push user context via postMessage when embedded in an iframe. */
export function subscribeYantraUserUpdates(onUpdate) {
  const handler = (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    const isYantraMessage =
      data.type === "yantra-user-context" ||
      data.source === "yantraias" ||
      data.event === "yantra-user";

    if (!isYantraMessage) return;

    const context = normalizeContext(data);
    if (!context.userId && !context.userName && !context.email) return;

    saveContext(context);
    onUpdate(context);
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
