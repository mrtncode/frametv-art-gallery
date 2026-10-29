# Frame Gallery — theming implementation prompt

Use the attached **Subtle Signature** brand pack. The selected design is **D from the Thin Modern Frame / Gallery Plaque / Editorial Art Mark / Subtle Signature board**, not D from the later Abstract Salon board. Preserve the supplied logo geometry and wide-spaced sans-serif wordmark; do not redesign, retype, thicken the frame, or add a background inside the mark.

Apply a warm, understated gallery aesthetic to the existing app. Keep the current features, routes, artwork behavior, and overall information architecture. This is a branding and theming pass, not a functional rebuild.

**Brand:** charcoal `#30332F`, terracotta `#C9725D`, ochre `#D69D41`. The terracotta and ochre in the logo stay identical in both themes; reverse the frame and wordmark to ivory `#F4F0E8` on dark backgrounds.

**Light theme:** canvas `#FAF8F4`, cards `#FFFEFC`, raised surfaces `#FFFFFF`, text `#30332F`, muted text `#716D66`, subtle dividers `#E3DDD4`. Primary buttons use deeper clay `#A64E3D` with white text, hover `#904231`. Selected navigation/chips use wash `#F5E5DF` with text `#8F4636`. Ochre is a sparing secondary accent, not body text on ivory.

**Dark theme:** canvas `#1E211F`, cards `#282C28`, raised surfaces `#30362F`, text `#F4F0E8`, muted text `#B7B0A6`, subtle dividers `#42473F`. Primary buttons use `#D58C75` with charcoal `#1E211F` text, hover `#E49F89`. Selected navigation/chips use `#443029` with text `#E8AE98`.

Use the supplied SVG logo + wordmark in the header, standalone logo for compact navigation, and the favicon exports for browser icons. `for-light` assets have dark frame/text and belong on light backgrounds; `for-dark` assets have ivory frame/text and belong on dark backgrounds. Preserve aspect ratios and transparency. Start the desktop lockup around 225–265 px wide and the mobile symbol around 40–44 px wide; verify legibility rather than stretching or adding weight.

Keep artwork as the focal point: no color filters, sepia overlays, tinted image mattes, or decorative texture on images. Use neutral cards, thin borders, restrained shadows, comfortable spacing, softly rounded controls, and compact filter chips. Avoid a cream background on every nested surface, oversized branding, heavy outlines, gradients, and extra ornament. Apply the wordmark's generous letter spacing only to the logo, not normal interface text. Keep the existing readable UI sans-serif.

Implement through shared semantic theme tokens, using `theme/palette.json` and `theme/theme-tokens.css` as the source. Map into the current Tailwind/shadcn/CSS setup without breaking its color format or existing theme toggle. Use `controlBorder` instead of the subtle divider token when a form-control boundary needs more contrast. Keep success/warning/error colors for genuine statuses. Artwork counts, albums, TVs, and storage are neutral values, not good/bad indicators; use restrained category colors only where helpful.

Check header, search, source filters, chips, gallery cards, import panel, dialogs, menus, toasts, device states, and bottom navigation in both themes and at mobile widths. Preserve visible keyboard focus, readable contrast, and hover/selected/disabled distinctions. Deliver one consistent theme pass, not another set of logo concepts.
