/**
 * Taskwarrior only accepts the `+tag` / `-tag` shorthand for tags built from letters, digits and
 * underscores. Any other character - a dash, space or colon - fails its lexer, and the word is
 * silently reparsed as description text: the tag is dropped and the task description is
 * overwritten (verified against taskwarrior 3.4.2). Our request schemas allow dashes, so every
 * command must use the `tags:` attribute and the `tags.has:` filter, which accept the full charset.
 */

/** Full tag set assignment, e.g. `tags:home,high-priority`. An empty list clears all tags. */
export function tagAssignmentArg(tags: readonly string[]): string {
  return `tags:${tags.join(",")}`;
}

/** One `tags.has:` filter per tag; taskwarrior ANDs repeated filters. */
export function tagFilterArgs(tags: readonly string[]): string[] {
  return tags.map((tag) => `tags.has:${tag}`);
}

/**
 * Resolves an add/remove request against the tags a task already carries, because `tags:`
 * replaces the whole set. Removals win over additions, matching how dependencies are merged.
 */
export function mergeTags(
  existingTags: readonly string[] | undefined,
  addTags: readonly string[] | undefined,
  removeTags: readonly string[] | undefined,
): string[] {
  const removals = new Set(removeTags ?? []);
  const merged = (existingTags ?? []).filter((tag) => !removals.has(tag));

  for (const tag of addTags ?? []) {
    if (!removals.has(tag) && !merged.includes(tag)) {
      merged.push(tag);
    }
  }

  return merged;
}
