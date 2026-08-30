#!/usr/bin/env python3
"""Generate StitchSpeak vertical social videos (1080x1920, caption-first, silent)."""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "videos" / "vertical"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

W, H = 1080, 1920
FPS = 30
SCENE_SECONDS = 3.15
FADE_SECONDS = 0.35

INK = "#16231A"
GREEN = "#314C38"
MOSS = "#71806A"
SAGE = "#DCE6D8"
MINT = "#EDF4E9"
PAPER = "#F7F4ED"
WARM = "#EEE7DD"
WHITE = "#FFFFFF"
MUTED = "#667168"
CORAL = "#D98468"
GOLD = "#D3A652"

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int, *, serif: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = SERIF_BOLD if serif and bold else SERIF if serif else SANS_BOLD if bold else SANS
    return ImageFont.truetype(path, size)


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def rounded(draw: ImageDraw.ImageDraw, box, radius=34, fill=WHITE, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap_lines(draw: ImageDraw.ImageDraw, value: str, fnt, max_width: int) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def multiline(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    *,
    fill=INK,
    bold=False,
    serif=False,
    max_width=880,
    spacing=1.08,
    anchor="la",
) -> int:
    fnt = font(size, serif=serif, bold=bold)
    lines = wrap_lines(draw, value, fnt, max_width)
    x, y = xy
    line_h = int(size * spacing)
    for i, line in enumerate(lines):
        draw.text((x, y + i * line_h), line, font=fnt, fill=fill, anchor=anchor)
    return y + len(lines) * line_h


def add_texture(im: Image.Image):
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, H, 48):
        d.line((0, y, W, y), fill=(49, 76, 56, 8), width=1)
    for x in range(0, W, 48):
        d.line((x, 0, x, H), fill=(49, 76, 56, 6), width=1)
    d.ellipse((-310, -210, 480, 580), fill=(220, 230, 216, 105))
    d.ellipse((720, 1420, 1330, 2030), fill=(238, 231, 221, 180))


def base(progress: str, dark=False) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (W, H), INK if dark else PAPER)
    if not dark:
        add_texture(im)
    d = ImageDraw.Draw(im, "RGBA")
    icon_fill = WHITE if dark else GREEN
    d.ellipse((72, 78, 134, 140), fill=icon_fill)
    d.text((103, 110), "S", font=font(31, serif=True, bold=True), fill=INK if dark else WHITE, anchor="mm")
    d.text((154, 110), "StitchSpeak", font=font(34, serif=True, bold=True), fill=WHITE if dark else INK, anchor="lm")
    d.text((1006, 110), progress, font=font(22, bold=True), fill=SAGE if dark else MUTED, anchor="rm")
    d.line((72, 166, 1008, 166), fill=(220, 230, 216, 80) if dark else (49, 76, 56, 38), width=2)
    return im, d


def kicker(d, value: str, y=232, dark=False):
    rounded(d, (72, y, 72 + max(270, len(value) * 16), y + 54), 27, SAGE if not dark else "#46604D")
    d.text((96, y + 27), value.upper(), font=font(22, bold=True), fill=GREEN if not dark else WHITE, anchor="lm")


def footer(d, label="stitchspeak.com", dark=False):
    d.text((72, 1802), label, font=font(28, bold=True), fill=WHITE if dark else GREEN, anchor="lm")
    d.text((1008, 1802), "PATTERN TRANSLATION FOR DESIGNERS", font=font(19, bold=True), fill=SAGE if dark else MUTED, anchor="rm")


def center_title(d, title: str, subtitle: str, *, dark=False, accent=None):
    color = WHITE if dark else INK
    multiline(d, (72, 460), title, 92, fill=color, bold=True, serif=True, max_width=930, spacing=1.02)
    multiline(d, (72, 785), subtitle, 40, fill=SAGE if dark else MUTED, max_width=900, spacing=1.18)
    if accent:
        rounded(d, (72, 1020, 1008, 1198), 48, accent)
        multiline(d, (540, 1109), accent[1] if isinstance(accent, tuple) else "", 36, bold=True, max_width=820, anchor="ma")


def screenshot_card(d, screenshot: Image.Image, box=(72, 690, 1008, 1582), crop="contain"):
    x1, y1, x2, y2 = box
    shadow = (x1 + 12, y1 + 18, x2 + 12, y2 + 18)
    rounded(d, shadow, 42, (22, 35, 26, 35))
    rounded(d, box, 42, WHITE, "#C8D0C6", 2)
    d.rounded_rectangle((x1, y1, x2, y1 + 82), radius=42, fill="#E9EEE7")
    d.rectangle((x1, y1 + 42, x2, y1 + 82), fill="#E9EEE7")
    for i, col in enumerate((CORAL, GOLD, "#6FA276")):
        d.ellipse((x1 + 34 + i * 34, y1 + 32, x1 + 50 + i * 34, y1 + 48), fill=col)
    d.text((x1 + 145, y1 + 42), "stitchspeak.com", font=font(20), fill=MUTED, anchor="lm")
    target_w, target_h = x2 - x1 - 22, y2 - y1 - 104
    src = screenshot.copy().convert("RGB")
    if crop == "cover":
        ratio = max(target_w / src.width, target_h / src.height)
        src = src.resize((int(src.width * ratio), int(src.height * ratio)), Image.Resampling.LANCZOS)
        left = (src.width - target_w) // 2
        top = (src.height - target_h) // 2
        src = src.crop((left, top, left + target_w, top + target_h))
    else:
        src.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    px = x1 + 11 + (target_w - src.width) // 2
    py = y1 + 93 + (target_h - src.height) // 2
    d._image.paste(src, (px, py))


def extract_frame(video: Path, seconds: float, output: Path):
    subprocess.run(
        [FFMPEG, "-y", "-ss", str(seconds), "-i", str(video), "-frames:v", "1", str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def scene_market_1():
    im, d = base("01 / 05")
    kicker(d, "For pattern designers")
    multiline(d, (72, 430), "Your pattern speaks one language.", 86, bold=True, serif=True, max_width=900)
    rounded(d, (72, 960, 1008, 1210), 52, GREEN)
    multiline(d, (540, 1084), "Your customers don’t.", 60, fill=WHITE, bold=True, serif=True, max_width=810, anchor="ma")
    d.arc((220, 1295, 860, 1695), start=200, end=340, fill=MOSS, width=8)
    d.ellipse((516, 1460, 564, 1508), fill=CORAL)
    footer(d)
    return im


def scene_market_2(screenshot):
    im, d = base("02 / 05")
    kicker(d, "One upload")
    multiline(d, (72, 345), "Turn one PDF into a new market.", 70, bold=True, serif=True, max_width=900)
    screenshot_card(d, screenshot, (72, 665, 1008, 1585), "cover")
    footer(d)
    return im


def scene_market_3():
    im, d = base("03 / 05", dark=True)
    kicker(d, "Choose the destination", dark=True)
    multiline(d, (72, 360), "13 languages. One familiar workflow.", 76, fill=WHITE, bold=True, serif=True, max_width=900)
    langs = [("EN", "English"), ("ES", "Español"), ("DE", "Deutsch"), ("FR", "Français"), ("IT", "Italiano"), ("KO", "한국어")]
    for i, (code, name) in enumerate(langs):
        col, row = i % 2, i // 2
        x = 72 + col * 476
        y = 770 + row * 220
        rounded(d, (x, y, x + 436, y + 170), 34, "#F7F4ED")
        rounded(d, (x + 24, y + 34, x + 126, y + 136), 28, SAGE)
        d.text((x + 75, y + 85), code, font=font(26, bold=True), fill=GREEN, anchor="mm")
        d.text((x + 154, y + 85), name, font=font(30, bold=True), fill=INK, anchor="lm")
    footer(d, dark=True)
    return im


def scene_market_4(screenshot):
    im, d = base("04 / 05")
    kicker(d, "Keep control")
    multiline(d, (72, 330), "Review original and translation side by side.", 68, bold=True, serif=True, max_width=930)
    screenshot_card(d, screenshot, (72, 690, 1008, 1585), "cover")
    footer(d)
    return im


def scene_cta(progress="05 / 05", line="Let your next pattern travel farther."):
    im, d = base(progress, dark=True)
    d.ellipse((225, 355, 855, 985), fill="#243B2B", outline="#71806A", width=5)
    d.ellipse((353, 483, 727, 857), outline="#DCE6D8", width=7)
    d.text((540, 670), "S", font=font(250, serif=True, bold=True), fill=WHITE, anchor="mm")
    multiline(d, (540, 1190), line, 66, fill=WHITE, bold=True, serif=True, max_width=900, anchor="ma")
    rounded(d, (160, 1510, 920, 1640), 65, SAGE)
    d.text((540, 1575), "START TRANSLATING  →", font=font(30, bold=True), fill=GREEN, anchor="mm")
    footer(d, dark=True)
    return im


def scene_terms_1():
    im, d = base("01 / 05")
    kicker(d, "Translation ≠ word swap")
    multiline(d, (72, 420), "Patterns have a language of their own.", 82, bold=True, serif=True, max_width=910)
    chips = ["YO", "SSK", "k2tog", "BOR", "C6F", "PM"]
    for i, value in enumerate(chips):
        angle = i * math.pi / 3
        cx = 540 + int(math.cos(angle) * 285)
        cy = 1260 + int(math.sin(angle) * 235)
        rounded(d, (cx - 105, cy - 58, cx + 105, cy + 58), 58, GREEN if i % 2 == 0 else SAGE)
        d.text((cx, cy), value, font=font(34, bold=True), fill=WHITE if i % 2 == 0 else GREEN, anchor="mm")
    footer(d)
    return im


def term_pair(d, y, source, target, label):
    rounded(d, (72, y, 1008, y + 250), 42, WHITE, "#CCD4CA", 2)
    d.text((112, y + 44), label.upper(), font=font(20, bold=True), fill=MUTED)
    d.text((112, y + 145), source, font=font(50, bold=True), fill=INK, anchor="lm")
    d.text((502, y + 145), "→", font=font(46, bold=True), fill=CORAL, anchor="mm")
    d.text((602, y + 145), target, font=font(50, bold=True), fill=GREEN, anchor="lm")


def scene_terms_2():
    im, d = base("02 / 05")
    kicker(d, "English → Spanish")
    multiline(d, (72, 340), "Abbreviations must be localized—not guessed.", 68, bold=True, serif=True, max_width=920)
    term_pair(d, 760, "k2tog", "2pjD", "knit 2 together")
    term_pair(d, 1060, "SSK", "ddD", "slip, slip, knit")
    term_pair(d, 1360, "YO", "H", "yarn over")
    footer(d)
    return im


def scene_terms_3():
    im, d = base("03 / 05", dark=True)
    kicker(d, "The numbers matter", dark=True)
    multiline(d, (72, 370), "One missing repeat can change the whole garment.", 76, fill=WHITE, bold=True, serif=True, max_width=920)
    rounded(d, (72, 840, 1008, 1250), 46, "#F7F4ED")
    d.text((120, 925), "SOURCE", font=font(21, bold=True), fill=MUTED)
    multiline(d, (120, 1000), "*K2, p2*; repeat around.", 46, bold=True, max_width=800)
    d.line((120, 1115, 960, 1115), fill="#D7DDD4", width=3)
    d.text((120, 1162), "SIZE: S (M, L)  •  18 cm", font=font(36, bold=True), fill=GREEN)
    d.text((540, 1420), "ROWS  •  REPEATS  •  SIZES  •  MEASUREMENTS", font=font(25, bold=True), fill=SAGE, anchor="mm")
    footer(d, dark=True)
    return im


def scene_terms_4(screenshot):
    im, d = base("04 / 05")
    kicker(d, "Built for patterns")
    multiline(d, (72, 330), "StitchSpeak keeps the pattern structure visible.", 68, bold=True, serif=True, max_width=930)
    screenshot_card(d, screenshot, (72, 690, 1008, 1585), "cover")
    footer(d)
    return im


def scene_check_1():
    im, d = base("01 / 05")
    kicker(d, "Save this checklist")
    multiline(d, (72, 420), "Before you publish a translated pattern…", 86, bold=True, serif=True, max_width=920)
    rounded(d, (72, 1040, 1008, 1300), 52, GREEN)
    multiline(d, (540, 1170), "Check these 3 things.", 62, fill=WHITE, bold=True, serif=True, max_width=830, anchor="ma")
    d.text((540, 1500), "01   02   03", font=font(72, bold=True), fill=MOSS, anchor="mm")
    footer(d)
    return im


def checklist_scene(n, title, body, icon):
    im, d = base(f"0{n + 1} / 05")
    kicker(d, f"Check {n} of 3")
    d.ellipse((72, 400, 292, 620), fill=GREEN)
    d.text((182, 510), icon, font=font(90, bold=True), fill=WHITE, anchor="mm")
    multiline(d, (72, 750), title, 82, bold=True, serif=True, max_width=920)
    multiline(d, (72, 1120), body, 43, fill=MUTED, max_width=900, spacing=1.22)
    rounded(d, (72, 1510, 1008, 1628), 59, SAGE)
    d.text((540, 1569), "KEEP THE DESIGNER IN THE LOOP", font=font(26, bold=True), fill=GREEN, anchor="mm")
    footer(d)
    return im


def scene_flow_1():
    im, d = base("01 / 05", dark=True)
    kicker(d, "Pattern translation", dark=True)
    multiline(d, (72, 430), "From PDF to a new language in five clear steps.", 82, fill=WHITE, bold=True, serif=True, max_width=920)
    for i in range(5):
        x = 170 + i * 185
        d.ellipse((x - 34, 1210 - 34, x + 34, 1210 + 34), fill=SAGE if i == 0 else "#46604D")
        if i < 4:
            d.line((x + 48, 1210, x + 137, 1210), fill=MOSS, width=6)
        d.text((x, 1325), str(i + 1), font=font(30, bold=True), fill=WHITE, anchor="mm")
    footer(d, dark=True)
    return im


def flow_scene(step, title, body, screenshot=None):
    im, d = base(f"0{step + 1} / 05")
    rounded(d, (72, 255, 202, 385), 40, GREEN)
    d.text((137, 320), str(step), font=font(58, bold=True), fill=WHITE, anchor="mm")
    multiline(d, (242, 255), title, 62, bold=True, serif=True, max_width=750)
    multiline(d, (72, 470), body, 38, fill=MUTED, max_width=900)
    if screenshot:
        screenshot_card(d, screenshot, (72, 745, 1008, 1585), "cover")
    else:
        labels = ["UPLOAD", "CHOOSE", "ESTIMATE", "REVIEW", "EXPORT"]
        for i, label in enumerate(labels):
            y = 760 + i * 160
            active = i == step - 1
            rounded(d, (100, y, 980, y + 116), 34, GREEN if active else WHITE, None if active else "#D0D6CE", 2)
            d.text((145, y + 58), f"0{i + 1}", font=font(24, bold=True), fill=SAGE if active else MUTED, anchor="lm")
            d.text((255, y + 58), label, font=font(32, bold=True), fill=WHITE if active else INK, anchor="lm")
            d.text((925, y + 58), "✓" if i < step else "→" if active else "", font=font(30, bold=True), fill=WHITE if active else GREEN, anchor="mm")
    footer(d)
    return im


def render_scene_video(image_path: Path, output: Path, variant: int):
    frames = int(SCENE_SECONDS * FPS)
    zoom = "min(zoom+0.00045,1.035)" if variant % 2 == 0 else "if(lte(on,1),1.035,max(1.0,zoom-0.00045))"
    x_expr = "iw/2-(iw/zoom/2)+8*sin(on/18)"
    y_expr = "ih/2-(ih/zoom/2)+6*cos(on/21)"
    vf = f"zoompan=z='{zoom}':x='{x_expr}':y='{y_expr}':d={frames}:s={W}x{H}:fps={FPS},format=yuv420p"
    subprocess.run(
        [FFMPEG, "-y", "-loop", "1", "-i", str(image_path), "-vf", vf, "-t", str(SCENE_SECONDS), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def assemble(name: str, scenes: Iterable[Image.Image], tmp: Path):
    scene_files: list[Path] = []
    clip_files: list[Path] = []
    for i, scene in enumerate(scenes):
        image_path = tmp / f"{name}-{i + 1}.png"
        clip_path = tmp / f"{name}-{i + 1}.mp4"
        scene.save(image_path, quality=96)
        render_scene_video(image_path, clip_path, i)
        scene_files.append(image_path)
        clip_files.append(clip_path)

    inputs: list[str] = []
    for clip in clip_files:
        inputs.extend(["-i", str(clip)])
    filters = []
    current = "[0:v]"
    offset = SCENE_SECONDS - FADE_SECONDS
    for i in range(1, len(clip_files)):
        out = f"[v{i}]"
        filters.append(f"{current}[{i}:v]xfade=transition=fade:duration={FADE_SECONDS}:offset={offset:.2f}{out}")
        current = out
        offset += SCENE_SECONDS - FADE_SECONDS
    final = OUT / f"{name}.mp4"
    subprocess.run(
        [FFMPEG, "-y", *inputs, "-filter_complex", ";".join(filters), "-map", current, "-an", "-c:v", "libx264", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "18", str(final)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    Image.open(scene_files[0]).convert("RGB").save(OUT / f"{name}-cover.jpg", quality=92)
    return final


def write_content_guide():
    guide = """# StitchSpeak vertical content pack

All videos are 1080×1920 MP4, silent, and caption-first. Add platform-native/trending audio at low volume if desired.

## 01 — More markets

**Post caption:** Your best-selling pattern already has a story. A new language helps it find new makers. Upload, choose a market, review the translation, and keep control of the final pattern. #knitweardesigner #crochetdesigner #patterntranslation #knittingpattern

## 02 — Pattern language

**Post caption:** Pattern translation is not a word swap. Rows, repeats, sizes, measurements, and abbreviations all carry technical meaning. That is why pattern-native terminology matters. Save this for your next international release. #knittingdesigner #crochetpattern #knittingtechniques #patternwriting

## 03 — Translation checklist

**Post caption:** Before publishing a translated pattern, check three things: terminology, numbers, and structure. The software accelerates the work; the designer still owns the final review. #patterndesign #techknitting #crochetbusiness #makerbusiness

## 04 — How it works

**Post caption:** One pattern. Five steps. Upload → choose a language → approve the estimate → review → export. A clearer way to prepare your pattern for another market. #knitweardesign #patterntranslator #creativebusiness #stitchspeak
"""
    (OUT / "CONTENT-GUIDE.md").write_text(guide)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="stitchspeak-vertical-") as tmp_name:
        tmp = Path(tmp_name)
        source = ROOT / "public" / "demos" / "pattern-translation.mp4"
        frame_modal = tmp / "modal.png"
        frame_result = tmp / "result.png"
        extract_frame(source, 8, frame_modal)
        extract_frame(source, 14, frame_result)
        modal = Image.open(frame_modal)
        result = Image.open(frame_result)

        outputs = [
            assemble("01-more-markets", [scene_market_1(), scene_market_2(modal), scene_market_3(), scene_market_4(result), scene_cta()], tmp),
            assemble("02-pattern-language", [scene_terms_1(), scene_terms_2(), scene_terms_3(), scene_terms_4(result), scene_cta(line="Translate patterns—not just words.")], tmp),
            assemble(
                "03-translation-checklist",
                [
                    scene_check_1(),
                    checklist_scene(1, "Terminology", "Are abbreviations and stitch names localized for the target market?", "Aa"),
                    checklist_scene(2, "Numbers", "Do stitch counts, repeats, sizes, and measurements match the source exactly?", "123"),
                    checklist_scene(3, "Structure", "Are charts, tables, headings, and instruction order still easy to follow?", "≡"),
                    scene_cta(line="Review with confidence. Publish with care."),
                ],
                tmp,
            ),
            assemble(
                "04-how-it-works",
                [
                    scene_flow_1(),
                    flow_scene(1, "Upload", "Start with the PDF, DOCX, TXT, or RTF you already own.", modal),
                    flow_scene(2, "Choose + estimate", "Pick the target language and see the credit cost before you begin."),
                    flow_scene(3, "Translate + review", "Compare the original and translated pattern in one workspace.", result),
                    scene_cta(line="Upload. Translate. Review. Export."),
                ],
                tmp,
            ),
        ]
        write_content_guide()
        for output in outputs:
            print(output)


if __name__ == "__main__":
    main()
