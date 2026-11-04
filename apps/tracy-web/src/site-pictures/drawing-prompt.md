# Drawing prompt of the picture step

The drawer's fixed template (ADR 0043, #344). Code fills the `{{...}}` places from the site plan's words for one frame
(shows, mustInclude, avoid, mood, size) and nothing else, and for a cut-out frame (#346) the plain ground colour code
chose and will remove (cutout-ground.js), joins the `common` part with the part of the mode code chose,
and adds the `redraw` part on the one redraw after the looker rejected a drawing. Only the text under the `##` headings
is sent; this paragraph is not.

## common

Nothing in the picture may be readable: no letters, words, numbers, signs, logos, labels, watermarks or brand marks.
No frame, border, caption or collage. One single picture.
It must show: {{shows}}.
These must be clearly visible: {{mustInclude}}.
These must not appear: {{avoid}}.
Mood: {{mood}}.
The frame it fills on the website: {{size}}.

## scene

Make a realistic photograph, as a professional would take it for a small business website: natural light, true colours,
a real place, sharp where it matters. Keep the main subject whole inside the picture, with some space around it; never
cut a head, a face, hands or the tool in use at the edge. Faces, if any, small or turned away, and every hand and body
natural.

## object

Make a realistic product photograph of the one thing it must show, whole and centred, on a plain, quiet background that
suits the mood, with soft light and a little space on every side. No person in the picture.

## outpaint

The attached picture is a real photograph of the business, placed in the middle of a wider frame; the grey bands on
its left and right are empty. Extend the photograph into the grey bands so the whole frame is one continuous photograph
of the same place: the same light, colours, perspective and grain. Keep the middle photograph exactly as it is: do not
change, move, redraw or recolour anything in it. Add no new person and no new subject; continue only the surroundings
(walls, floor, background, the room or the street). No visible line, change of light or repeated pattern where the
photograph ends.

## cutout

Make a realistic photograph of one figure alone on a completely flat, plain background of one single colour:
{{ground}}. The background is exactly that colour everywhere: no gradient, no floor, no horizon, no shadow, no
reflection, no texture, no smoke or glow and no other thing on it. Nothing in the figure is that colour, not even a
small part. Keep the whole figure inside the picture with clear background on its left, its right and above it; it may
stand on the bottom edge. Every hand, arm, leg and foot, and everything the figure holds or wears (gloves, a racket, a
ball, a tool), is whole and sharp against the background. Even light, crisp edges, no motion blur.

## redraw

An earlier drawing for this frame was rejected because of: {{faults}}. Make a new picture that avoids these faults.
