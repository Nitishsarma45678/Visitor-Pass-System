const KEY = "carepass:currentUser";

const DEMO_USERS = [
  { email: "admin@demo",        name: "Admin",       role: "admin",        password: "admin" },
  { email: "reception@demo",    name: "Reception",   role: "reception",    password: "reception" },
  { email: "security@demo",     name: "Security",    role: "security",     password: "security" },
];

export function login(email, password) {
  const u = DEMO_USERS.find(x => x.email === email && x.password === password);
  if (!u) return null;
  const { password: _omit, ...user } = u;
  localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function logout() { localStorage.removeItem(KEY); }
export function currentUser() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function hasRole(role) {
  const u = currentUser();
  if (!u) return false;
  if (Array.isArray(role)) return role.includes(u.role);
  return u.role === role;
}
