# Checks WCAG contrast for every theme in src/theme/themes.ts. Run: python3 scripts/check-contrast.py
import re,sys
src=open('src/theme/themes.ts').read()
def parse(c):
    c=c.strip()
    if c.startswith('#'):
        h=c[1:]; return tuple(int(h[i:i+2],16) for i in (0,2,4)),1.0
    m=re.match(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)',c)
    return (int(m[1]),int(m[2]),int(m[3])),float(m[4])
def over(fg,bg):
    (r,a),(b,_)=parse(fg),parse(bg)
    return tuple(round(r[i]*a+b[i]*(1-a)) for i in range(3))
def lum(rgb):
    def ch(v):
        v/=255; return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=map(ch,rgb); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    la,lb=lum(a),lum(b); return (max(la,lb)+0.05)/(min(la,lb)+0.05)
fail=0
for tid in 'OABCD':
    blk=re.search(r'\nconst '+tid+r': Theme = \{(.*?)\n\};',src,re.S).group(1)
    col=dict(re.findall(r"(\w+): '([^']+)'",blk))
    bg=parse(col['bg'])[0]; surf=over(col['surface'],col['bg'])
    checks=[('text','bg',4.5),('textMuted','bg',4.5),('textSubtle','bg',4.5),('textMuted','surface',4.5),('textSubtle','surface',3.0),
            ('onPrimary','primary',4.5),('onTrust','trust',4.5),('onAi','ai',4.5),('onSponsored','sponsored',4.5),('onDanger','danger',4.5),('onSecondary','secondary',4.5),
            ('primary','bg',3),('primaryText','bg',4.5),('primaryText','surface',4.5),('primaryText','surfaceAlt',4.5),('trust','bg',3),('ai','bg',3),('tabInactive','tabBar',3),('tabActive','tabBar',3),('sponsored','surface',3)]
    for a,b,need in checks:
        B=bg if b=='bg' else surf if b=='surface' else over(col[b],col['bg'])
        A=over(col[a],col['bg']) if col[a].startswith('rgba') else parse(col[a])[0]
        r=cr(A,B)
        if r<need: fail+=1; print(f"{tid} FAIL {a} on {b}: {r:.2f} < {need}")
print('failures',fail)
