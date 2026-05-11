/**
 * Returns the avatar URL for a user.
 * If the user has uploaded a photo, use it.
 * Otherwise fall back to a gender-appropriate silhouette.
 */
export function getAvatar(user) {
  if (user?.avatar) return user.avatar

  const gender = user?.gender?.toLowerCase()
  if (gender === 'female') return '/avatars/default-female.svg'
  if (gender === 'male') return '/avatars/default-male.svg'
  return '/avatars/default-neutral.svg'
}
