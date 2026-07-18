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

  const backgroundImage = new Image();
  backgroundImage.src = window.GAME_ASSETS?.background || './assets/background/stadium_bg.png';
  const ballImage = new Image();
  ballImage.src = window.GAME_ASSETS?.baseball || './assets/balls/baseball.png';

  let W = innerWidth;
  let H = innerHeight;
  let DPR = Math.min(devicePixelRatio || 1, 2);
  let state = 'menu';
  let balls = 0;
  let strikes = 0;
  let dragging = false;
  let pointer = [];
  let pitch = null;
  let flash = '';
  let flashUntil = 0;
  let lastTime = performance.now();

  function resize() {
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function ballHome() {
    return { x: W / 2, y: H * 0.82, r: Math.max(42, Math.min(W, H) * 0.068) };
  }

  function zone() {
    // 포수가 포함된 배경 이미지의 위치에 맞춘 작은 스트라이크존.
    const w = Math.min(W * 0.095, 68);
    const h = Math.min(H * 0.055, 58);
    return { x: W / 2 - w / 2, y: H * 0.43, w, h };
  }

  function resetGame() {
    balls = 0;
    strikes = 0;
    pitch = null;
    pointer = [];
    dragging = false;
    state = 'ready';
    result.classList.add('hidden');
    message.classList.add('hidden');
    updateCount();
    pitchInfo.textContent = '공의 좌우를 긁으면 반대 방향으로 휩니다';
  }

  function updateCount() {
    countEl.textContent = `B ${balls} · S ${strikes}`;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'ready') return;
    const p = getPos(e);
    const b = ballHome();
    if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.75) {
      dragging = true;
      pointer = [p];
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    pointer.push(getPos(e));
    if (pointer.length > 30) pointer.shift();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging || state !== 'ready') return;
    dragging = false;
    pointer.push(getPos(e));
    throwPitch();
  });

  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    pointer = [];
  });

  function throwPitch() {
    if (pointer.length < 2) return;
    const a = pointer[0];
    const b = pointer[pointer.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(55, b.t - a.t);
    const swipeSpeed = dist / dt;
    const home = ballHome();

    if (dy > -30 || dist < 38) {
      flashMessage('스와이프가 너무 짧습니다');
      pointer = [];
      return;
    }

    const power = clamp(swipeSpeed / 1.18, 0, 1.4);
    const horizontalAim = clamp(dx / Math.max(75, W * 0.21), -1.25, 1.25);
    const contactOffset = clamp((a.x - home.x) / (home.r * 0.7), -1.2, 1.2);
    const mid = pointer[Math.floor(pointer.length * 0.45)] || a;
    const gestureBend = (b.x - mid.x) / Math.max(65, W * 0.18);
    const curve = clamp(-contactOffset * (0.52 + power * 0.46) + gestureBend * 0.55, -1.25, 1.25);

    const z = zone();
    const targetX = z.x + z.w / 2 + horizontalAim * z.w * 1.8 + curve * z.w * 0.62;
    const targetY = z.y + z.h * (3 - power * 3);

    pitch = {
      t: 0,
      duration: Math.max(410, 680 - power * 170),
      start: home,
      control1: { x: home.x + horizontalAim * W * 0.035, y: H * 0.67 },
      control2: { x: targetX - curve * W * 0.28, y: H * 0.52 },
      end: { x: targetX, y: targetY },
      power,
      curve,
      label: Math.abs(curve) < 0.12 ? '직구' : curve < 0 ? '좌 커브' : '우 커브'
    };

    state = 'pitching';
    pointer = [];
    pitchInfo.textContent = `${pitch.label} · ${Math.round(116 + power * 36)} km/h`;
  }

  function circleTouchesRect(cx, cy, r, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= r * r;
  }

  function circleFullyInsideRect(cx, cy, r, rect) {
    return cx - r >= rect.x && cx + r <= rect.x + rect.w &&
      cy - r >= rect.y && cy + r <= rect.y + rect.h;
  }

  function estimateInsideRatio(cx, cy, r, rect) {
    // 공 원 내부의 균일한 표본점을 검사해 스트라이크존과 겹친 비율을 구합니다.
    const grid = 31;
    let circlePoints = 0;
    let insidePoints = 0;
    for (let iy = 0; iy < grid; iy++) {
      const py = cy - r + ((iy + 0.5) / grid) * r * 2;
      for (let ix = 0; ix < grid; ix++) {
        const px = cx - r + ((ix + 0.5) / grid) * r * 2;
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > r * r) continue;
        circlePoints++;
        if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
          insidePoints++;
        }
      }
    }
    return circlePoints ? insidePoints / circlePoints : 0;
  }

  function resolvePitch() {
    const z = zone();
    const finalRadius = pitch.start.r * 0.18;
    const x = pitch.end.x;
    const y = pitch.end.y;
    const touches = circleTouchesRect(x, y, finalRadius, z);

    if (touches) {
      const fullyInside = circleFullyInsideRect(x, y, finalRadius, z);
      const overlap = fullyInside ? 1 : estimateInsideRatio(x, y, finalRadius, z);
      // 살짝 걸치면 10%, 완전히 들어가면 100%. 중간은 겹친 비율에 따라 선형 증가.
      const hitRate = fullyInside ? 1 : 0.1 + 0.9 * clamp(overlap, 0, 1);
      const hit = Math.random() < hitRate;

      if (hit) {
        flashMessage('안타!');
        endGame(false, '안타', '타자가 공을 받아쳤습니다.');
        return;
      }

      strikes++;
      flashMessage('헛스윙!');
      if (strikes >= 3) {
        endGame(true, '삼진 아웃!', '마지막 타자를 헛스윙 삼진으로 잡았습니다.');
        return;
      }
    } else {
      balls++;
      const tooLow = y - finalRadius > z.y + z.h;
      const tooHigh = y + finalRadius < z.y;
      flashMessage(tooLow ? '낮은 볼' : tooHigh ? '높은 볼' : '볼');
      if (balls >= 4) {
        endGame(false, '밀어내기 볼넷', '공이 스트라이크존에 전혀 닿지 않았습니다.');
        return;
      }
    }

    updateCount();
    state = 'cooldown';
    setTimeout(() => {
      if (state === 'cooldown') state = 'ready';
    }, 700);
  }

  function endGame(win, title, text) {
    state = 'ended';
    updateCount();
    setTimeout(() => {
      resultTitle.textContent = title;
      resultText.textContent = text;
      result.classList.remove('hidden');
    }, 500);
  }

  function flashMessage(text) {
    flash = text;
    flashUntil = performance.now() + 750;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cubicBezier(a, c1, c2, b, t) {
    const u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y
    };
  }

  function drawBackgroundCover() {
    ctx.clearRect(0, 0, W, H);
    if (!backgroundImage.complete || !backgroundImage.naturalWidth) {
      ctx.fillStyle = '#030813';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const iw = backgroundImage.naturalWidth;
    const ih = backgroundImage.naturalHeight;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(backgroundImage, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,.08)');
    shade.addColorStop(0.65, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.2)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBall(x, y, r, rotation = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (ballImage.complete && ballImage.naturalWidth) {
      ctx.drawImage(ballImage, -r, -r, r * 2, r * 2);
    } else {
      ctx.fillStyle = '#f3eee3';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReadyBall() {
    const b = ballHome();
    drawBall(b.x, b.y, b.r);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPointer() {
    if (!dragging || pointer.length < 2) return;
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pointer[0].x, pointer[0].y);
    for (const p of pointer.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function drawFlash() {
    if (performance.now() > flashUntil) return;
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${Math.min(42, W * 0.1)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 16;
    ctx.fillText(flash, W / 2, H * 0.22);
    ctx.shadowBlur = 0;
  }

function frame(now) {
  const dt = Math.min(40, now - lastTime);
  lastTime = now;

  drawBackgroundCover();

  // ===== 스트라이크존 테두리 표시 =====
  const z = zone();

  ctx.save();
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.restore();

  if (state === 'ready' || state === 'cooldown')
    drawReadyBall();

  drawPointer();

  if (state === 'pitching' && pitch) {
    pitch.t += dt;
    const t = Math.min(1, pitch.t / pitch.duration);
    const eased = 1 - Math.pow(1 - t, 2.15);

    for (let i = 7; i >= 1; i--) {
      const tt = Math.max(0, eased - i * 0.022);
      const tp = cubicBezier(
        pitch.start,
        pitch.control1,
        pitch.control2,
        pitch.end,
        tt
      );
      const tr = pitch.start.r * (1 - tt * 0.82) * (1 - i * 0.055);
      drawBall(
        tp.x,
        tp.y,
        tr,
        tt * 18 * pitch.curve,
        Math.max(0.035, 0.2 - i * 0.022)
      );
    }

    const p = cubicBezier(
      pitch.start,
      pitch.control1,
      pitch.control2,
      pitch.end,
      eased
    );
    const r = pitch.start.r * (1 - eased * 0.82);
    drawBall(p.x, p.y, r, eased * 18 * pitch.curve);

    if (t >= 1) resolvePitch();
  }

  drawFlash();
  requestAnimationFrame(frame);
}

  startBtn.addEventListener('click', resetGame);
  restartBtn.addEventListener('click', resetGame);
  requestAnimationFrame(frame);
})();
