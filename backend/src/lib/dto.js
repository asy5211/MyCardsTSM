// Shapes database rows into the JSON the app receives. Never includes password hashes.
export const iso = (date) => (date ? new Date(date).toISOString() : null);

export function userDto(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    phone: row.phone ?? null,
    avatarKey: row.avatar_key ?? null,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: iso(row.created_at),
  };
}

export function staffDto(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
