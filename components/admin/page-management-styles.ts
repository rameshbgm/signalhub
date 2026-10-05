/** Shared class strings for the page-management screens. */

/**
 * PlatformActionForm always renders its feedback paragraph. Inside a `gap-4` grid or
 * flex form this cancels the gap while the message is empty, so card footers stay tight.
 */
export const formMessage = "col-span-full empty:-mt-4";

/**
 * A quiet row action that turns rose on hover. The `!` keeps it ahead of the ghost
 * variant's own hover colours.
 */
export const dangerGhost = "text-ink-soft hover:bg-danger-bg! hover:text-danger-fg! [&_svg]:text-ink-dim! hover:[&_svg]:text-danger-fg!";
