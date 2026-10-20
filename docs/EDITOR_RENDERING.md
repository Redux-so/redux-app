# Editor rendering and export

The canvas, saved library previews, and downloads share `renderInteractiveImage`
in `lib/interactive-image-preview.ts`. Slider changes render locally before the
next paint. No debounce, network request, autosave response, or delayed Sharp
preview can replace the displayed image. Color effects blend into the image
itself, so zoom/pan and transforms cannot displace them.

The display uses a preview capped at 1600 pixels on its longest edge. Export
renders the original working image at its full native dimensions with the same
filters and color blends. Blur scales with resolution; deterministic grain uses
the same normalized texture. The canvas does not change to a different effect
algorithm after a drag. Sharpen/clarity retain the established contrast-based
appearance. Export never captures the visible viewport or editor UI.

The rendered PNG is sent with `pixelsRendered: true`. Sharp applies the document
transform, adds an sRGB profile, and encodes JPEG, PNG, or TIFF without reapplying
adjustments. Existing API callers sending unrendered pixels can still use the
server effect renderer. Saved thumbnails use the local renderer as well.

## Document and geometry

The working image remains separate from rendered pixels. Retouch, crop, and
resize read that working source; effects are not baked into it twice. Confirmed
results enter shared undo history. Unconfirmed masks and crop handles are
selection UI; export requires confirming or cancelling them first.

Export waits for active image operations and Agent edits before reading the
current document. It loads the required working source, renders at full size,
then applies image-local flips followed by rotation/straightening with
transparent padding. Native dimensions include the complete rotated composition.
Viewport zoom/pan do not affect the output. JPEG flattens alpha onto white;
PNG/TIFF preserve it. JPEG quality and the supported formats remain unchanged.

## Color and viewer limits

This is an SDR, 8-bit sRGB workflow. Browser decoding applies source orientation
and color management; the Canvas 2D output is sRGB. Pixels outside sRGB cannot all
be retained. The exported file carries an sRGB ICC profile and no original EXIF
orientation, avoiding double rotation. External viewers can still differ due to
ignored profiles, monitor calibration, True Tone/Night Shift, HDR enhancements,
backgrounds behind transparency, or preview scaling. JPEG is lossy even at quality
100. Compare on the same display and at the same scale.

## Verification

Before/after compares the immutable `Image.originalUrl` upload against the current
edited composition, including AI replacements, crops, and transforms. The original
is preloaded into a display-only comparison layer using the existing viewport
matrix; it never replaces Fabric's edited pixels or document state. Masks and crop
handles are hidden during comparison. The navigator remains visible, reuses the
loaded original image for the before preview, and switches back to the edited
preview afterward. Its indicator and pan bounds follow the displayed composition.
Autosave, library covers, and exports always use the edited document regardless of the toggle.

Manual comparison QA: after slider, crop/rotation, retouch, or AI edits, toggle
before to see the complete unedited source composition; toggle back to restore
the current edits. Repeat after reopening the editor and during autosave.

Run `node scripts/verify-export-rendering.mjs`,
`node scripts/verify-editor-history.mjs`, lint, typecheck, and a production build.
Encoding checks cover preservation of already rendered PNG/TIFF pixels, alpha,
profile attachment, transform ordering, sizing, and pending document operations.

Manual QA:

- Change light, color, and effect sliders together, then leave them untouched
  through autosave. Their appearance must remain unchanged.
- At reduced zoom, combine temperature, tint, hue, vignette, and grain. Colors
  must remain inside the photo while zooming/panning/rotating.
- Export PNG, JPEG, and TIFF and compare the complete composition at the same
  scale. Test native detail, PNG/TIFF alpha, and JPEG quality/white matte.
- Export during an AI or Agent edit; confirm its completed result is present.
- Undo/redo a sequence of adjustments, retouch results, crops, and replacements;
  export each resulting state and verify controls and pixels agree.

Lossless working/export PNG requests use the existing 50 MiB ceiling. Next.js
proxy buffering allows their base64 expansion (70 MiB JSON); deployment platforms
must also support those request sizes.

## Saved library covers

Autosave and Back to Library render a cover from the same editor snapshot sent
with the version save. The versions route transforms these already adjusted
pixels and publishes the version and cover URL in one image-locked transaction.
Working images and covers use immutable Cloudinary assets. A timestamp-based
save generation survives editor remounts; older saves cannot replace a newer
committed snapshot. Failed rendering, upload, or persistence preserves the
previous saved cover. Successful saves notify the library, including saves that
finish after navigation. Back to Library waits for pending operations and the
complete save, and displays an error if saving fails.

`node scripts/verify-cover-save.mjs` exercises out-of-order saves and upload
failure using isolated route adapters. `verify-editor-history.mjs` also checks
snapshot/cover agreement and save generations across editor remounts.

## Version history

The History panel is a single automatic version list with a Revert action.
Each completed slider gesture, geometry change, AI patch, or destructive edit
records a full editor snapshot. Original remains available. Painted selections
and autosave requests do not create visible versions. Revert restores the whole
document, including its working image, adjustments, dimensions, and transform,
and records that result at the end of the version line. Existing versions remain
available after reverting and making subsequent changes. There is no naming form
or manual version-saving workflow.

Autosave stores the snapshots and toolbar undo/redo cursor inside the existing
v2 `ImageVersion.adjustments.history` JSON together with the current document
and cover. Original plus the latest 999 changes are retained. Working sources
are uploaded once per save and shared between snapshots by immutable URL.
Large batches of native sources upload separately before the final atomic save.
Failed history loading blocks saves rather than overwriting saved work.

Existing saved checkpoints appear in the same version list. Legacy destructive
checkpoints recover their pixels from `ImageVersion.url`; missing historical
steps cannot be reconstructed. New AI result records remain hidden until their
result is successfully applied to the editor. Historical sources retain their
ownership records so retouching and permanent image cleanup still work.

Regression coverage lives in `scripts/verify-editor-history.mjs` and
`scripts/verify-cover-save.mjs`, including full-state reverts, version retention,
legacy sources, persistent snapshots, and cover consistency.
