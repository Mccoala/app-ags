import React, { useEffect, useRef } from "react";

// ── Esfera de energia do Cérebro (WebGL) ──────────────────────────────────────
// Um núcleo de plasma dentro de uma esfera de vidro, num céu de estrelas.
// A borda se deforma e o núcleo acende conforme a voz (getLevel → 0..1).
// phase: idle | listening | thinking | speaking

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime, uLevel, uPhase, uSize, uStars, uLift;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }
vec3 pal(float t){ // índigo → violeta → magenta → âmbar
  vec3 a=vec3(.10,.04,.25), b=vec3(.49,.23,.93), c=vec3(.93,.28,.60), d=vec3(1.,.62,.25);
  return t<.33 ? mix(a,b,t/.33) : t<.66 ? mix(b,c,(t-.33)/.33) : mix(c,d,(t-.66)/.34); }
float stars(vec2 p, float t){
  float s = 0.;
  for(int L=0; L<3; L++){
    float fl = float(L), sc = 18. + fl*22.;
    vec2 q = p * sc + vec2(t*.02*(fl+1.), -t*.013*(fl+1.));
    vec2 id = floor(q), f = fract(q) - .5;
    float r = h21(id + fl*7.1);
    if (r > .88) { vec2 o = vec2(h21(id+1.3), h21(id+2.7)) - .5; float d = length(f - o*.7);
      float tw = .55 + .45*sin(t*(1.5+r*3.) + r*40.);
      s += smoothstep(.06 - fl*.012, 0., d) * tw * (1. - fl*.25); }
  }
  return s; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes) / min(uRes.x, uRes.y);
  uv.y -= uLift;
  float t = uTime, lv = uLevel;
  float think = step(1.5, uPhase) * step(uPhase, 2.5), listen = step(.5, uPhase) * step(uPhase, 1.5);
  // céu profundo: nebulosa bem leve + estrelas
  vec3 col = vec3(.006,.003,.018);
  float neb = fbm(uv*1.3 + vec2(t*.012, -t*.008));
  col += mix(vec3(.18,.05,.35), vec3(.35,.05,.25), neb) * pow(neb, 4.) * .45;
  col += vec3(.85,.82,1.) * stars(uv, t) * uStars;
  // esfera
  float R = .2 * uSize * (1. + .08*lv + .015*sin(t*1.3));
  float a = atan(uv.y, uv.x), r = length(uv);
  vec2 dir = vec2(cos(a), sin(a));
  float spin = t * (.22 + think*1.4);
  float wob = noise(dir*1.4 + vec2(spin*.8, -spin*.6))*.65 + noise(dir*2.8 - vec2(spin*1.3))*.35 - .5;
  float wave = sin(a*3. + t*2.3)*.5 + sin(a*5. - t*3.1)*.3 + sin(a*8. + t*4.7)*.2;
  float edge = R * (1. + (wob*.2 + wave*.07) * (.08 + 1.25*lv));
  float d = r - edge;
  // halo fino em volta
  col += vec3(.55,.2,.95) * exp(-max(d,0.)*(14. - 6.*lv)) * (.28 + .5*lv);
  col += vec3(.95,.3,.6) * exp(-max(d,0.)*(30. - 10.*lv)) * (.18 + .45*lv);
  float rays = pow(noise(vec2(a*6., t*.4)), 3.);
  col += vec3(.8,.4,1.) * exp(-max(d,0.)*6.) * rays * (.08 + .35*lv);
  // ondas quando está ouvindo
  float ring = sin((r - t*.2)*46.) * .5 + .5;
  col += vec3(.75,.45,1.) * listen * smoothstep(.0,.2, d) * exp(-d*6.) * pow(ring, 22.) * .6;
  // anel orbitando quando está pensando
  float orb = abs(r - R*1.42 - .008*sin(a*6.+t*3.));
  col += vec3(.9,.5,1.) * think * exp(-orb*140.) * (.35 + .65*pow(.5 + .5*sin(a*3. - t*5.), 3.));
  if (d < 0.) {
    float k = clamp(r/edge, 0., 1.);
    float z = sqrt(1. - k*k);
    vec3 n = normalize(vec3(uv/edge, z*1.2));
    // vidro escuro com filamentos de plasma por dentro
    vec2 q = uv/edge * 1.5;
    float c = cos(spin), s = sin(spin); q = mat2(c,-s,s,c) * q;
    vec2 w = vec2(fbm(q*1.1 + t*.22), fbm(q*1.3 - t*.18 + 3.1));
    float pl = fbm(q*1.7 + w*(1.4 + 2.6*lv) + t*.15);
    float fil = pow(1. - abs(pl*2. - 1.), 7. - 3.*lv);            // fios finos de energia
    float fil2 = pow(1. - abs(fbm(q*3.1 - w*1.2 - t*.2)*2. - 1.), 10.);
    float core = exp(-k*k*(4.5 - 2.*lv));
    vec3 body = mix(vec3(.03,.01,.08), vec3(.12,.03,.25), z) ;
    body += mix(vec3(.55,.2,1.), vec3(1.,.35,.65), pl) * fil * (.55 + 1.1*lv);
    body += vec3(1.,.6,.3) * fil2 * (.15 + .7*lv) * core;
    body += vec3(1.,.75,.95) * pow(core, 4.) * (.12 + .9*lv);
    // reflexo e borda de vidro
    float fres = pow(1. - z, 3.);
    vec3 L = normalize(vec3(-.5,.6,.65));
    float spec = pow(max(dot(reflect(-L, n), vec3(0,0,1)), 0.), 60.);
    body += vec3(.95,.9,1.) * spec * .55;
    body += mix(vec3(.45,.25,1.), vec3(1.,.35,.7), .5 + .5*sin(a*1.5 + t*.7)) * fres * (.55 + .6*lv);
    float aa = smoothstep(0., -.004, d);
    col = mix(col, body, aa);
  }
  // linha de luz na borda
  col += mix(vec3(.7,.5,1.), vec3(1.,.5,.8), .5 + .5*sin(a*2. - t)) * exp(-abs(d)*260.) * (.5 + .6*lv);
  col *= 1. - .45*dot(uv,uv);
  col = col / (1. + col*.6);
  gl_FragColor = vec4(pow(col, vec3(.92)), 1.);
}`;

export default function SpaceOrb({ phase = "idle", getLevel = () => 0, size = 1, stars = true, lift = 0, className = "" }) {
  const ref = useRef(null);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const levelRef = useRef(getLevel); levelRef.current = getLevel;

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(pr, n);
    const uRes = U("uRes"), uTime = U("uTime"), uLevel = U("uLevel"), uPhase = U("uPhase"), uSize = U("uSize"), uStars = U("uStars"), uLift = U("uLift");
    const PH = { idle: 0, listening: 1, thinking: 2, speaking: 3 };
    let raf = 0, lvl = 0, last = performance.now(), t0 = last;
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      gl.viewport(0, 0, cv.width, cv.height);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const ph = phaseRef.current, t = (now - t0) / 1000;
      const target = ph === "speaking" ? levelRef.current() : ph === "thinking" ? 0.22 + 0.08 * Math.sin(t * 4) : ph === "listening" ? 0.1 + 0.05 * Math.sin(t * 2.6) : 0.04;
      lvl += (target - lvl) * Math.min(1, dt * (target > lvl ? 16 : 6)); // sobe rápido, desce suave
      gl.uniform2f(uRes, cv.width, cv.height); gl.uniform1f(uTime, t); gl.uniform1f(uLevel, lvl);
      gl.uniform1f(uPhase, PH[ph] ?? 0); gl.uniform1f(uSize, size); gl.uniform1f(uStars, stars ? 1 : 0); gl.uniform1f(uLift, lift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { } };
  }, [size, stars, lift]);

  return <canvas ref={ref} className={className} style={{ width: "100%", height: "100%", display: "block" }} />;
}
