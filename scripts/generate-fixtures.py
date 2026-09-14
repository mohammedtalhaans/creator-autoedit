#!/usr/bin/env python3
"""Development-only original synthetic fixture generator.
Requires Python + numpy + Pillow + cairosvg, and local espeak/ffmpeg executables.
None of these tools, or any FFmpeg executable, ships with the web application.
The demo is explicitly an illustrated/synthetic clip, not phone-camera QA footage.
"""
from pathlib import Path
import io, json, math, re, shutil, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw
import cairosvg
ROOT = Path(__file__).resolve().parents[1]
RATE, FPS, W, H = 48000, 24, 640, 360
PHRASES = [
    ("Your best ideas deserve to be heard.", 1.45),
    ("Not buried under a long, awkward pause.", 1.9),
    ("Keep the words that matter. Make a little room.", 1.35),
    ("One take. A clearer voice. Ready to share.", .6),
]
for command in ('espeak', 'ffmpeg'):
    if not shutil.which(command): raise SystemExit(f'Missing {command}; install this development tool first.')
(ROOT/'public/demo').mkdir(parents=True, exist_ok=True)
(ROOT/'tests/fixtures').mkdir(parents=True, exist_ok=True)
# This SVG is original project artwork, also used in the CSS/SVG landing illustration.
scene = ROOT/'scripts/demo-scene.svg'
if not scene.exists():
    component = (ROOT/'src/components/HeroMachine.tsx').read_text()
    svg = re.search(r'<svg className="hero-subject".*?</svg>', component).group(0)
    for a,b in [('className','class'),('stopColor','stop-color'),('strokeWidth','stroke-width'),('fillRule','fill-rule')]: svg=svg.replace(a,b)
    svg=svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    scene.write_text(svg)
subject = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=scene.read_bytes(), output_width=408, output_height=360))).convert('RGB')
with tempfile.TemporaryDirectory() as directory:
    tmp=Path(directory); chunks=[np.zeros(round(.35*RATE),dtype=np.float32)]; intervals=[]; at=.35
    for i,(text,gap) in enumerate(PHRASES):
        wav=tmp/f'{i}.wav'
        subprocess.run(['espeak','-v','en-us','-s','165','-p','43','-a','115','-w',str(wav),text],check=True)
        with wave.open(str(wav),'rb') as r:
            samples=np.frombuffer(r.readframes(r.getnframes()),dtype='<i2').astype(np.float32)/32768
            rate=r.getframerate()
        pcm=np.interp(np.arange(round(len(samples)*RATE/rate))*rate/RATE,np.arange(len(samples)),samples).astype(np.float32)*.65
        intervals.append({'text':text,'start':at,'end':at+len(pcm)/RATE})
        chunks.extend([pcm,np.zeros(round(gap*RATE),dtype=np.float32)]);at+=len(pcm)/RATE+gap
    audio=np.concatenate(chunks);duration=math.ceil(len(audio)/RATE*FPS)/FPS
    audio=np.pad(audio,(0,round(duration*RATE)-len(audio)))
    rng=np.random.default_rng(3117);t=np.arange(len(audio))/RATE
    audio+=(rng.normal(0,.0018,len(audio))+.0009*np.sin(2*np.pi*60*t)).astype(np.float32)
    audio=np.clip(audio,-.95,.95)
    audio_file=tmp/'voice.wav'
    with wave.open(str(audio_file),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((audio*32767).astype('<i2').tobytes())
    path=ROOT/'public/demo/one-take.mp4'
    process=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(audio_file),'-c:v','libx264','-preset','fast','-crf','25','-profile:v','baseline','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',str(path)],stdin=subprocess.PIPE)
    for n in range(round(duration*FPS)):
        seconds=n/FPS;level=float(np.sqrt(np.mean(audio[round(seconds*RATE):round((seconds+.04)*RATE)]**2)))
        im=Image.new('RGB',(W,H),(20,25,23));x=116+round(9*math.sin(seconds*.4));im.paste(subject,(x,0))
        draw=ImageDraw.Draw(im)
        if level>.016:
            # Deliberately stylized lip motion, not a photorealistic or real-person likeness.
            cx=x+210;cy=167
            draw.ellipse((cx-10,cy-2,cx+12,cy+min(10,3+level*50)),fill=(62,61,53))
        draw.line((34,0,34,H),fill=(29,35,31));draw.line((606,0,606,H),fill=(29,35,31))
        process.stdin.write(im.tobytes())
    process.stdin.close()
    if process.wait()!=0:raise SystemExit('Fixture video encoding failed.')
    meta={'kind':'original illustration with synthetic speech','duration':duration,'width':W,'height':H,'fps':FPS,'phrases':intervals,'license':'MIT (original project artwork and text)','generator':'scripts/generate-fixtures.py','not_phone_qa':True}
    (ROOT/'tests/fixtures/demo-manifest.json').write_text(json.dumps(meta,indent=2)+'\n')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-t','6','-c:v','libx264','-profile:v','baseline','-crf','26','-c:a','aac','-movflags','+faststart',str(ROOT/'tests/fixtures/tiny.mp4')],check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-t','2','-an','-c:v','copy','-movflags','+faststart',str(ROOT/'tests/fixtures/no-audio.mp4')],check=True)
    print(f'Original synthetic demo: {duration:.2f}s, {path.stat().st_size/1024:.1f} KiB')
