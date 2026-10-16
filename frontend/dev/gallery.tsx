/**
 * Dev-only gallery entry at the frontend package root.
 *
 * The canonical page component lives in src/dev/Gallery.tsx (declared by the
 * frontend skeleton ticket and registered at the /dev/gallery route); this
 * module keeps that route resolvable from the frontend package root as well,
 * so both paths point at the same implementation.
 */
export { default } from "../src/dev/Gallery";
