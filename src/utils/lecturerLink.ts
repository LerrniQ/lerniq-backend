/**
 * Builds the lecturer survey link for a course rep.
 *
 * Priority:
 *   1. Custom survey  → FRONTEND_URL/s/LECTURER_SURVEY_SLUG?ref=refId
 *   2. Typeform       → LECTURER_TYPEFORM_URL?ref=refId
 *   3. Neither set    → null
 */
export function buildLecturerLink(refId: string): string | null {
  const surveySlug  = process.env.LECTURER_SURVEY_SLUG
  const typeformUrl = process.env.LECTURER_TYPEFORM_URL
  const frontendUrl = process.env.FRONTEND_URL ?? 'https://lerniq.co'

  if (surveySlug) return `${frontendUrl}/s/${surveySlug}?ref=${refId}`
  if (typeformUrl) return `${typeformUrl}?ref=${refId}`
  return null
}
