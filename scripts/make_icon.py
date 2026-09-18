"""One-off generator for the Polar Drift app icon: a glossy red/blue split sphere
(the ball's two charge states) with a glowing seam, on a dark space background.
Rendered at 2x supersampling then downscaled for clean anti-aliased edges.
Shading uses the exact same light/dark mix ratios as the in-game ball (fx.js
shadeColor: +0.55 toward white for the highlight side, -0.35 toward black for
the rim) so the icon reads as "the same ball", not a separate illustration.
"""
from PIL import Image, ImageDraw, ImageFilter


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(color, amt):
    target = 255 if amt >= 0 else 0
    t = abs(amt)
    return tuple(round(c + (target - c) * t) for c in color)


RED = hx('#ff3b5c')
BLUE = hx('#2d9bff')
RED_LIGHT, RED_DARK = shade(RED, 0.55), shade(RED, -0.35)
BLUE_LIGHT, BLUE_DARK = shade(BLUE, 0.55), shade(BLUE, -0.35)
BG_CENTER = hx('#141a33')
BG_EDGE = hx('#05060f')

SS = 2
S = 1024 * SS
cx, cy = S // 2, S // 2
R = int(S * 0.42)

# ---- background: simple, subtle radial vignette (no large detached glow shapes) ----
bg_grad = Image.radial_gradient('L').resize((int(S * 1.6), int(S * 1.6)))
bg_mask = Image.new('L', (S, S), 0)
bg_mask.paste(bg_grad, (cx - bg_grad.width // 2, cy - bg_grad.height // 2))
img = Image.composite(
    Image.new('RGBA', (S, S), BG_CENTER + (255,)),
    Image.new('RGBA', (S, S), BG_EDGE + (255,)),
    bg_mask,
)

# ---- sphere + half masks ----
sphere_mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(sphere_mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
left_half = Image.new('L', (S, S), 0)
ImageDraw.Draw(left_half).rectangle([0, 0, cx, S], fill=255)
right_half = Image.new('L', (S, S), 0)
ImageDraw.Draw(right_half).rectangle([cx, 0, S, S], fill=255)


def circular_glow(color, mask, blur, boost=1.0):
    """A soft colored glow shaped exactly like `mask` (so it stays radially clean,
    no intersecting-shape artifacts), enlarged slightly and blurred."""
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    tinted = Image.new('RGBA', (S, S), color + (255,))
    a = mask.point(lambda p: int(min(255, p * boost)))
    layer.paste(tinted, (0, 0), a)
    return layer.filter(ImageFilter.GaussianBlur(blur))


glow_d = int(R * 2.3)  # only slightly bigger than the sphere itself - stays a clean hugging halo,
# never large enough to reach the canvas corners (that's what caused the chevron artifacts)
glow_mask = Image.new('L', (glow_d, glow_d), 0)
ImageDraw.Draw(glow_mask).ellipse([0, 0, glow_d, glow_d], fill=255)
glow_full = Image.new('L', (S, S), 0)
glow_full.paste(glow_mask, (cx - glow_d // 2, cy - glow_d // 2))
glow_left = Image.composite(glow_full, Image.new('L', (S, S), 0), left_half)
glow_right = Image.composite(glow_full, Image.new('L', (S, S), 0), right_half)

img = Image.alpha_composite(img, circular_glow(RED, glow_left, S * 0.02, 0.9))
img = Image.alpha_composite(img, circular_glow(BLUE, glow_right, S * 0.02, 0.9))


def half_gradient(light, dark, highlight_offset):
    g = Image.radial_gradient('L').resize((R * 4, R * 4))
    mask = Image.new('L', (S, S), 0)
    mask.paste(g, (cx + highlight_offset[0] - g.width // 2, cy + highlight_offset[1] - g.height // 2))
    return Image.composite(
        Image.new('RGBA', (S, S), light + (255,)),
        Image.new('RGBA', (S, S), dark + (255,)),
        mask,
    )


hl_offset = (-int(R * 0.4), -int(R * 0.45))
red_layer = half_gradient(RED_LIGHT, RED_DARK, hl_offset)
blue_layer = half_gradient(BLUE_LIGHT, BLUE_DARK, hl_offset)

sphere = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sphere.paste(red_layer, (0, 0), Image.composite(left_half, Image.new('L', (S, S), 0), sphere_mask))
sphere.paste(blue_layer, (0, 0), Image.composite(right_half, Image.new('L', (S, S), 0), sphere_mask))
img = Image.alpha_composite(img, sphere)

# ---- glowing white seam where the two charges meet ----
seam = Image.new('RGBA', (S, S), (0, 0, 0, 0))
seam_w = max(2, int(S * 0.0055))
ImageDraw.Draw(seam).rectangle([cx - seam_w, cy - R, cx + seam_w, cy + R], fill=(255, 255, 255, 255))
seam.putalpha(Image.composite(seam.getchannel('A'), Image.new('L', (S, S), 0), sphere_mask))
img = Image.alpha_composite(img, seam.filter(ImageFilter.GaussianBlur(S * 0.01)))
img = Image.alpha_composite(img, seam)

# ---- thin bright rim + specular highlight for a glossy, dimensional read ----
rim = Image.new('RGBA', (S, S), (0, 0, 0, 0))
rim_w = max(2, int(S * 0.006))
ImageDraw.Draw(rim).ellipse([cx - R + rim_w, cy - R + rim_w, cx + R - rim_w, cy + R - rim_w],
                             outline=(255, 255, 255, 70), width=rim_w)
img = Image.alpha_composite(img, rim)

spec = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sw, sh = int(R * 0.5), int(R * 0.32)
sx, sy = cx + hl_offset[0] - sw // 2, cy + hl_offset[1] - sh // 2
ImageDraw.Draw(spec).ellipse([sx, sy, sx + sw, sy + sh], fill=(255, 255, 255, 190))
spec = spec.filter(ImageFilter.GaussianBlur(S * 0.01))
spec.putalpha(Image.composite(spec.getchannel('A'), Image.new('L', (S, S), 0), sphere_mask))
img = Image.alpha_composite(img, spec)

stroke = Image.new('RGBA', (S, S), (0, 0, 0, 0))
stroke_w = max(2, int(S * 0.004))
ImageDraw.Draw(stroke).ellipse([cx - R, cy - R, cx + R, cy + R], outline=(0, 0, 0, 110), width=stroke_w)
img = Image.alpha_composite(img, stroke)

img = img.resize((1024, 1024), Image.LANCZOS)
final = Image.new('RGB', (1024, 1024), BG_EDGE)
final.paste(img, (0, 0), img)
final.save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
print('done')
