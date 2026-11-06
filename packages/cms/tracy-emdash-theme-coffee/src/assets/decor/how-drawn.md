# How the decor pictures were drawn

Each picture was drawn by Codex (the built-in image tool of codex-cli 0.162.1, `codex exec`) on 2026-10-31,
two versions per tool, the better one kept. Codex drew on a plain light grey background; the grey was
cut away by its colour (alpha from the colour distance to the median border colour, only in the region
joined to the border, grey spill removed from the edges), the picture trimmed and shrunk to WebP
(longest side 800 px, quality 80, alpha quality 90). A local matting model (`hyperframes remove-background`)
was tried first and lost half the beans and most of the spoon, so it was not used. No stock photo, no
copied media. Style tail added to every prompt:

> Realistic premium product photograph of a single isolated object, centred, whole object visible with generous empty margin, on a perfectly plain flat light grey seamless background, no other objects, no table, no surface, no cast shadow on the background. Warm soft studio light with a gentle warm rim light, deep espresso-brown, dark walnut, kraft and matte ceramic tones, natural and realistic, like moody editorial coffee-shop photography. Square 1:1. Absolutely no text, no letters, no numbers, no logos, no brand marks, no labels anywhere. Do not invent a style beyond this.

| Picture | Prompt |
|---|---|
| beans.webp | A loose handful of about twelve roasted coffee beans scattered in mid-air as if falling, dark glossy brown beans at slightly different angles and sizes. |
| spoon.webp | A carved wooden scoop spoon heaped with roasted coffee beans, a few beans spilling over the edge, seen from a slight angle. |
| kettle.webp | A matte dark brown enamel gooseneck pour-over kettle with a slim curved spout and a wooden handle, seen from the side. |
| moka.webp | A classic stovetop moka pot coffee maker in dark brushed metal with a black handle, seen from a three-quarter angle. |

Six more were drawn the same way on 2026-10-31 for the espresso machine beside the shop name and the two
text-only home sections (story, the four reasons):

| Picture | Prompt |
|---|---|
| espresso.webp | A compact retro espresso machine with a single group head, a portafilter locked in, a steam wand and a small cream ceramic cup on the drip tray, dark brushed metal with walnut wood handles, three-quarter view. |
| roaster.webp | A small tabletop coffee roaster with a dark metal drum, a round cooling tray of freshly roasted beans in front and a little wisp of smoke, three-quarter view. |
| green-beans.webp | A small heap of raw green unroasted coffee beans with a few beans scattered beside it, pale green and olive tones. |
| roasted-beans.webp | A small shallow wooden bowl of freshly roasted glossy coffee beans, a few beans scattered beside it, a thin wisp of warm steam. |
| pour.webp | A matte dark gooseneck kettle tilted and pouring a thin stream of hot water into a ceramic pour-over dripper sitting on a glass server, seen from the side. |
| table-cup.webp | A small round walnut wood café side table with a cream ceramic cup of coffee and saucer on it, seen from a three-quarter angle. |
