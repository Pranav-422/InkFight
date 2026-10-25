// Stored cut-out figures. Since Sprint 4 they are transparent PNGs; before that they were painted on white. New files get this
// prefix, so "named like this" means "already transparent" and the admin re-cut tool can tell the old ones (raw photos and
// white cut-outs, whatever their name) from the new ones, and touches each only once.
export const CUT_PREFIX = "tcut-";

export const isTransparentCutout = (imageUrl: string) => imageUrl.includes(`/${CUT_PREFIX}`);
// What the re-cut tool still has to do: everything stored that is not starter art and not already a transparent cut-out.
export const needsRecut = (imageUrl: string) => !imageUrl.startsWith("/samples/") && !isTransparentCutout(imageUrl);
