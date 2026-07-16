(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const message = document.getElementById('message');
  const result = document.getElementById('result');
  const resultTitle = document.getElementById('resultTitle');
  const resultText = document.getElementById('resultText');
  const countEl = document.getElementById('count');
  const pitchInfo = document.getElementById('pitchInfo');

  let W = innerWidth, H = innerHeight, DPR = Math.min(devicePixelRatio || 1, 2);
  let state = 'menu';
  let balls = 0, strikes = 0;
  let dragging = false;
  let pointer = [];
  let pitch = null;
  let flash = '';
  let flashUntil = 0;
  let lastTime = performance.now();

  function resize() {
    W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize); resize();

  function ballHome() { return { x: W / 2, y: H * 0.83, r: Math.max(28, Math.min(W, H) * 0.045) }; }
  function zone() {
    const w = Math.min(W * 0.28, 170), h = Math.min(H * 0.22, 190);
    return { x: W / 2 - w / 2, y: H * 0.31, w, h };
  }

  function resetGame() {
    balls = 0; strikes = 0; pitch = null; pointer = []; dragging = false;
    state = 'ready'; result.classList.add('hidden'); message.classList.add('hidden');
    updateCount(); pitchInfo.textContent = '공의 왼쪽·오른쪽을 긁으면 반대 방향으로 휩니다';
  }

  function updateCount() { countEl.textContent = `B ${balls} · S ${strikes}`; }

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'ready') return;
    const p = getPos(e), b = ballHome();
    if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.7) {
      dragging = true; pointer = [p]; canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    pointer.push(getPos(e));
    if (pointer.length > 24) pointer.shift();
  });

  canvas.addEventListener('pointerup', e => {
    if (!dragging || state !== 'ready') return;
    dragging = false; pointer.push(getPos(e));
    throwPitch();
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; pointer = []; });

  function throwPitch() {
    if (pointer.length < 2) return;
    const a = pointer[0], b = pointer[pointer.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy), dt = Math.max(70, b.t - a.t);
    const swipeSpeed = dist / dt;
    const home = ballHome();

    if (dy > -35 || dist < 45) {
      flashMessage('스와이프가 너무 짧습니다'); pointer = []; return;
    }

    const power = Math.max(0, Math.min(1.3, swipeSpeed / 1.65));
    const horizontalAim = Math.max(-1, Math.min(1, dx / Math.max(120, W * 0.35)));
    const contactOffset = Math.max(-1, Math.min(1, (a.x - home.x) / home.r));
    const curve = -contactOffset * (0.38 + power * 0.34);

    const z = zone();
    const targetX = z.x + z.w / 2 + horizontalAim * z.w * 0.9 + curve * z.w * 0.7;
    const targetY = z.y + z.h * (1.12 - power * 0.95);

    pitch = {
      t: 0, duration: 620, start: home,
      control: { x: W / 2 + curve * W * 0.18, y: H * 0.54 },
      end: { x: targetX, y: targetY }, power, curve,
      label: Math.abs(curve) < .12 ? '직구' : curve < 0 ? '좌 커브' : '우 커브'
    };
    state = 'pitching'; pointer = [];
    pitchInfo.textContent = `${pitch.label} · 구속 ${Math.round(118 + power * 34)} km/h`;
  }

  function resolvePitch() {
    const z = zone(), x = pitch.end.x, y = pitch.end.y;
    const inZone = x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
    const tooLow = y > z.y + z.h;
    const tooHigh = y < z.y;

    if (inZone) {
      const centerDist = Math.hypot((x - (z.x + z.w / 2)) / z.w, (y - (z.y + z.h / 2)) / z.h);
      const swingChance = 0.5 + pitch.power * .22 - Math.abs(pitch.curve) * .1;
      const swung = Math.random() < swingChance;
      const contactChance = Math.max(.08, .56 - Math.abs(pitch.curve) * .34 - centerDist * .2);
      if (swung && Math.random() < contactChance) {
        endGame(false, '끝내기 안타', '타자가 변화에 적응했습니다. 코스와 구종을 섞어 보세요.');
        return;
      }
      strikes++;
      flashMessage(swung ? '헛스윙!' : '스트라이크!');
      if (strikes >= 3) { endGame(true, '삼진 아웃!', '마지막 타자를 잡고 경기를 끝냈습니다.'); return; }
    } else {
      balls++;
      flashMessage(tooLow ? '원바운드 볼' : tooHigh ? '높은 볼' : '볼');
      if (balls >= 4) { endGame(false, '밀어내기 볼넷', '힘과 방향을 조금 더 안정적으로 맞춰 보세요.'); return; }
    }
    updateCount(); state = 'cooldown'; setTimeout(() => { if (state === 'cooldown') state = 'ready'; }, 650);
  }

  function endGame(win, title, text) {
    state = 'ended'; updateCount();
    setTimeout(() => {
      resultTitle.textContent = title;
      resultText.textContent = text;
      result.classList.remove('hidden');
    }, 500);
  }

  function flashMessage(text) { flash = text; flashUntil = performance.now() + 650; }

  function bezier(a, c, b, t) {
    const u = 1 - t;
    return { x: u*u*a.x + 2*u*t*c.x + t*t*b.x, y: u*u*a.y + 2*u*t*c.y + t*t*b.y };
  }

  function drawField() {
    ctx.clearRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#07130d'); sky.addColorStop(.52, '#173522'); sky.addColorStop(1, '#09100c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#102a19'; ctx.beginPath();
    ctx.moveTo(0, H * .48); ctx.quadraticCurveTo(W/2, H*.36, W, H*.48); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

    ctx.fillStyle = '#8d6b48';
    ctx.beginPath(); ctx.moveTo(W*.17, H); ctx.lineTo(W*.42, H*.48); ctx.lineTo(W*.58, H*.48); ctx.lineTo(W*.83, H); ctx.fill();

    ctx.fillStyle = '#1f4b2e';
    ctx.beginPath(); ctx.ellipse(W/2, H*.56, W*.24, H*.12, 0, 0, Math.PI*2); ctx.fill();

    drawBatter(); drawCatcher(); drawZone();
  }

  function drawZone() {
    const z = zone();
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]); ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(z.x+z.w/3,z.y); ctx.lineTo(z.x+z.w/3,z.y+z.h); ctx.moveTo(z.x+2*z.w/3,z.y); ctx.lineTo(z.x+2*z.w/3,z.y+z.h); ctx.moveTo(z.x,z.y+z.h/3); ctx.lineTo(z.x+z.w,z.y+z.h/3); ctx.moveTo(z.x,z.y+2*z.h/3); ctx.lineTo(z.x+z.w,z.y+2*z.h/3); ctx.stroke();
  }

  function drawBatter() {
    const x = W*.68, y = H*.34, s = Math.min(W,H)*.055;
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(7, s*.15); ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(x, y, s*.32, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,y+s*.35); ctx.lineTo(x-s*.08,y+s*1.4); ctx.moveTo(x-s*.05,y+s*.8); ctx.lineTo(x-s*.65,y+s*1.25); ctx.moveTo(x-s*.02,y+s*.75); ctx.lineTo(x+s*.55,y+s*1.3); ctx.moveTo(x-s*.02,y+s*.55); ctx.lineTo(x-s*.58,y+s*.18); ctx.stroke();
    ctx.strokeStyle='#c39a6b'; ctx.lineWidth=Math.max(5,s*.1); ctx.beginPath(); ctx.moveTo(x-s*.55,y+s*.18); ctx.lineTo(x-s*.9,y-s*.65); ctx.stroke();
  }

  function drawCatcher() {
    const x=W/2, y=H*.48, s=Math.min(W,H)*.045;
    ctx.fillStyle='#101417'; ctx.beginPath(); ctx.arc(x,y,s*.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#15191c'; ctx.lineWidth=Math.max(8,s*.2); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x,y+s*.3); ctx.lineTo(x,y+s*1.2); ctx.moveTo(x,y+s*.72); ctx.lineTo(x-s*.65,y+s*1.1); ctx.moveTo(x,y+s*.72); ctx.lineTo(x+s*.65,y+s*1.1); ctx.stroke();
  }

  function drawBall(x,y,r,rotation=0) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(rotation);
    ctx.fillStyle='#f4f0df'; ctx.shadowColor='#0008'; ctx.shadowBlur=12; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='#b44739'; ctx.lineWidth=Math.max(1.5,r*.08);
    ctx.beginPath(); ctx.arc(-r*.16,0,r*.62,-1.1,1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(r*.16,0,r*.62,2.04,4.24); ctx.stroke();
    ctx.restore();
  }

  function drawReadyBall() {
    const b=ballHome(); drawBall(b.x,b.y,b.r);
    ctx.strokeStyle='#ffffff44'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(b.x,b.y,b.r*1.45,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#ffffffaa'; ctx.font='600 13px system-ui'; ctx.textAlign='center'; ctx.fillText('위로 스와이프',b.x,b.y+b.r*2.05);
  }

  function drawPointer() {
    if (!dragging || pointer.length<2) return;
    ctx.strokeStyle='#ffffff99'; ctx.lineWidth=5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(pointer[0].x,pointer[0].y); for(const p of pointer.slice(1)) ctx.lineTo(p.x,p.y); ctx.stroke();
  }

  function drawFlash() {
    if (performance.now()>flashUntil) return;
    ctx.fillStyle='#fff'; ctx.font=`900 ${Math.min(42,W*.1)}px system-ui`; ctx.textAlign='center'; ctx.shadowColor='#000'; ctx.shadowBlur=16; ctx.fillText(flash,W/2,H*.22); ctx.shadowBlur=0;
  }

  function frame(now) {
    const dt=Math.min(40,now-lastTime); lastTime=now;
    drawField();
    if (state==='ready' || state==='cooldown') drawReadyBall();
    drawPointer();

    if (state==='pitching' && pitch) {
      pitch.t += dt; const t=Math.min(1,pitch.t/pitch.duration); const e=1-Math.pow(1-t,2.4); const p=bezier(pitch.start,pitch.control,pitch.end,e);
      const r=pitch.start.r*(1-e*.72); drawBall(p.x,p.y,r,e*12*pitch.curve);
      if (t>=1) resolvePitch();
    }
    drawFlash(); requestAnimationFrame(frame);
  }

  startBtn.addEventListener('click', resetGame);
  restartBtn.addEventListener('click', resetGame);
  requestAnimationFrame(frame);
})();
