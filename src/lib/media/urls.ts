export function toSecureImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // KTO still returns a small number of http image URLs. The public site is
  // served over HTTPS, so normalize those URLs at every serving boundary.
  return trimmed.replace(/^http:\/\//i, 'https://');
}
