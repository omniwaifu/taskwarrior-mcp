// src/utils/validation.ts

// Zod schemas in `src/types/task.ts` handle most input validation automatically
// when `schema.parse()` or `schema.safeParse()` is used.

// This file can be used for:
// 1. More complex cross-field validation logic not easily expressed in Zod for a single field.
// 2. Business rule validations that are not strictly about data type or format.
// 3. Helper functions for common validation patterns if needed by multiple tools.

/**
 * Example: Validates if a due date is not in the past.
 * (This is just an illustrative example; actual date handling might be more complex)
 * @param dueDateString The due date string to check.
 * @returns True if the due date is today or in the future, false otherwise.
 */
export function isDueDateNotInPast(
  dueDateString: string | undefined | null,
): boolean {
  if (!dueDateString) return true; // Or false, depending on whether due date is required
  try {
    const dueDate = new Date(dueDateString);
    const today = new Date();
    // Reset time part for date-only comparison if necessary
    today.setHours(0, 0, 0, 0);
    // If dueDate is an ISO string, it might be UTC. Ensure comparison is fair.
    // For simplicity, this example assumes dates are comparable as is.
    return dueDate >= today;
  } catch {
    // Invalid date string
    return false;
  }
}

// Add other common validation utilities as they become necessary.
// For example, validating project name conventions if they are more complex
// than a simple regex, or ensuring tag arrays don't contain duplicates if that's a rule.

export function sanitizeString(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  // Basic sanitization: trim whitespace.
  // More complex sanitization (e.g., removing special characters) can be added if needed,
  // but be careful not to corrupt valid Taskwarrior inputs.
  return input.trim();
}
