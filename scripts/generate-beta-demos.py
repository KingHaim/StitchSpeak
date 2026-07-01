#!/usr/bin/env python3
"""Generate the silent, captioned MP4 walkthroughs used by the beta landing page."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "demos"
OUT.mkdir(parents=True, exist_ok=True)
FFMPEG = Path("/tmp/stitchspeak-demo-tools/node_modules/ffmpeg-static/ffmpeg")

W, H = 1280, 800
INK = "#17251b"
GREEN = "#304a35"
MOSS = "#50604a"
PALE = "#dce6da"
PAPER = "#f8f7f2"
WHITE = "#ffffff"
MUTED = "#687269"

FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def rr(draw, box, radius=22, fill=WHITE, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def text(draw, xy, value, size, fill=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)

def base(kicker, title, step):
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 76), fill=INK)
    text(d, (48, 38), "STITCHSPEAK", 18, WHITE, True, "lm")
    text(d, (W-48, 38), f"{kicker}  ·  {step}", 15, "#baccb0", True, "rm")
    text(d, (56, 126), title, 40, INK, True)
    return im, d

def browser(d, y=178, h=550):
    rr(d, (56, y, W-56, y+h), 22, WHITE, "#c9cec8", 2)
    d.rounded_rectangle((56, y, W-56, y+58), radius=22, fill="#eef2eb")
    d.rectangle((56, y+35, W-56, y+58), fill="#eef2eb")
    for i, c in enumerate(("#d17d72", "#d7ae61", "#7aa477")):
        d.ellipse((80+i*28, y+24, 94+i*28, y+38), fill=c)
    rr(d, (190, y+14, 720, y+44), 12, "#ffffff")
    text(d, (210, y+29), "stitchspeak.com", 14, MUTED, False, "lm")
    return y+58

def pill(d, box, label, active=False):
    rr(d, box, 16, GREEN if active else "#eef2eb", None)
    text(d, ((box[0]+box[2])//2, (box[1]+box[3])//2), label, 15, WHITE if active else INK, True, "mm")

def save_scene(name, idx, im):
    p = OUT / f"{name}-{idx}.png"
    im.save(p, quality=95)
    return p

def upload_scenes():
    scenes=[]
    im,d=base("UPLOAD & ESTIMATE", "Start with the pattern you already own", "01 / 04"); top=browser(d)
    rr(d,(270,top+65,1010,top+360),22,"#f8faf6","#7f8b80",3)
    text(d,(640,top+145),"PDF",30,GREEN,True,"mm")
    text(d,(640,top+205),"Drop your knitting pattern here",28,INK,True,"mm")
    text(d,(640,top+255),"PDF, DOCX, TXT, or RTF",17,MUTED,False,"mm")
    pill(d,(510,top+292,770,top+342),"Choose pattern",True)
    scenes.append(im)
    im,d=base("UPLOAD & ESTIMATE", "StitchSpeak detects the source language", "02 / 04"); top=browser(d)
    rr(d,(140,top+60,1140,top+330),18,"#f8faf6","#d0d6cf",2)
    rr(d,(185,top+105,255,top+185),14,PALE); text(d,(220,top+145),"PDF",18,GREEN,True,"mm")
    text(d,(290,top+125),"nordic-cardigan.pdf",23,INK,True)
    text(d,(290,top+165),"12 pages  ·  842 KB",16,MUTED)
    text(d,(185,top+235),"Detected language",14,MUTED,True)
    pill(d,(185,top+260,390,top+310),"Norwegian",False)
    text(d,(470,top+235),"Translate into",14,MUTED,True)
    pill(d,(470,top+260,675,top+310),"English",True)
    scenes.append(im)
    im,d=base("UPLOAD & ESTIMATE", "See the exact cost before spending", "03 / 04"); top=browser(d)
    rr(d,(230,top+52,1050,top+370),20,WHITE,"#ccd2cb",2)
    text(d,(280,top+105),"Translation estimate",28,INK,True)
    d.line((280,top+150,1000,top+150),fill="#d9ded8",width=2)
    text(d,(280,top+200),"12-page Norwegian pattern",18,MUTED)
    text(d,(1000,top+200),"8.5 credits",25,GREEN,True,"ra")
    text(d,(280,top+245),"Your balance after translation",18,MUTED)
    text(d,(1000,top+245),"16.5 credits",19,INK,True,"ra")
    pill(d,(720,top+290,1000,top+345),"Approve & translate",True)
    scenes.append(im)
    im,d=base("UPLOAD & ESTIMATE", "Nothing is charged until you approve", "04 / 04"); top=browser(d)
    rr(d,(245,top+75,1035,top+345),22,INK)
    text(d,(640,top+150),"Ready when you are",34,WHITE,True,"mm")
    text(d,(640,top+205),"Language detected  ·  estimate confirmed",18,"#cbd7c9",False,"mm")
    pill(d,(510,top+250,770,top+308),"Translate pattern",True)
    scenes.append(im)
    return scenes

def terminology_scenes():
    rows_orig=["Omg 1: *2 r, 2 vr*, gjenta ut omg.","Omg 2: Strikk m som de viser.","Fortsett til arb måler 18 cm."]
    rows_en=["Rnd 1: *K2, p2*; repeat around.","Rnd 2: Work stitches as they appear.","Continue until piece measures 18 cm."]
    scenes=[]
    for idx, (heading, translated, highlight) in enumerate([
        ("The original row structure stays visible",False,0),
        ("Knitting terms—not word-for-word guesses",True,0),
        ("Measurements and repeats stay in place",True,2),
        ("Review the original and translation together",True,-1),
    ],1):
        im,d=base("TERMINOLOGY",heading,f"{idx:02d} / 04"); top=browser(d)
        d.line((640,top+35,640,top+420),fill="#d3d9d2",width=2)
        text(d,(105,top+55),"ORIGINAL · NORWEGIAN",14,MUTED,True)
        text(d,(695,top+55),"TRANSLATION · ENGLISH",14,GREEN,True)
        for j,row in enumerate(rows_orig):
            y=top+120+j*82
            if highlight==j and idx>1: rr(d,(680,y-15,1125,y+40),10,PALE)
            text(d,(105,y),row,21,INK,j==highlight)
            text(d,(695,y),rows_en[j] if translated else "—",21,INK,translated and j==highlight)
        if idx==4:
            pill(d,(480,top+375,800,top+430),"Save to My Patterns",True)
        scenes.append(im)
    return scenes

def assistant_scenes():
    scenes=[]
    questions=[
        ("Open the assistant beside your saved pattern",None),
        ("Ask about the instruction—not the whole internet","What does ‘work stitches as they appear’ mean here?"),
        ("Get an answer grounded in this pattern","On this round, knit the knit stitches and purl the purl stitches as they face you."),
        ("Compare, clarify, then keep knitting","You can ask 3 follow-up questions free with each pattern."),
    ]
    for idx,(heading,bubble) in enumerate(questions,1):
        im,d=base("PATTERN ASSISTANT",heading,f"{idx:02d} / 04"); top=browser(d)
        rr(d,(90,top+40,715,top+440),16,"#f8faf6","#d2d8d1",2)
        text(d,(125,top+82),"nordic-cardigan.pdf",22,INK,True)
        text(d,(125,top+135),"Rnd 2: Work stitches as they appear.",20,INK)
        text(d,(125,top+190),"Continue until piece measures 18 cm.",20,INK)
        rr(d,(750,top+40,1145,top+440),16,INK)
        text(d,(785,top+82),"ASK THIS PATTERN",14,"#baccb0",True)
        if idx>=2:
            rr(d,(785,top+125,1110,top+215),14,"#dce6da")
            text(d,(810,top+150),"What does ‘work stitches as",16,INK)
            text(d,(810,top+178),"they appear’ mean here?",16,INK)
        if idx>=3:
            rr(d,(785,top+235,1110,top+360),14,"#ffffff")
            text(d,(810,top+262),"Knit the knit stitches and purl",15,INK)
            text(d,(810,top+288),"the purl stitches as they face you",15,INK)
            text(d,(810,top+314),"on this round.",15,INK)
        if idx==4:
            text(d,(947,top+405),"3 free questions included",14,"#baccb0",True,"mm")
        scenes.append(im)
    return scenes

def encode(name, scenes, seconds=6):
    paths=[save_scene(name,i+1,im) for i,im in enumerate(scenes)]
    # The concat demuxer keeps the asset generation deterministic and broadly compatible.
    concat=OUT/f"{name}.txt"
    concat.write_text("".join(f"file '{p.name}'\nduration {seconds}\n" for p in paths)+f"file '{paths[-1].name}'\n")
    subprocess.run([
        str(FFMPEG),"-y","-f","concat","-safe","0","-i",str(concat),
        "-vf","fps=24,format=yuv420p","-c:v","libx264","-profile:v","high","-movflags","+faststart",
        str(OUT/f"{name}.mp4")
    ],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    paths[-1].replace(OUT/f"{name}.jpg")
    for p in paths[:-1]: p.unlink()
    concat.unlink()

encode("upload-and-estimate", upload_scenes(), 6)
encode("terminology-translation", terminology_scenes(), 6.5)
encode("pattern-assistant", assistant_scenes(), 5.75)
print("Generated three beta demo videos in public/demos")
