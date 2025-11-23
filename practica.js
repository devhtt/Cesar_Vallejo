// Datos: imágenes disponibles
const IMAGES = Array.from({length:15},(_,i)=>({
  src: (i+1)+'.jpg',
  name: 'Señal ' + (i+1)
}));

const startBtn = document.getElementById('startBtn');
const game = document.getElementById('game');
const questionImg = document.getElementById('questionImg');
const optionsContainer = document.getElementById('optionsContainer');
const timerBar = document.getElementById('timerBar');
const timeText = document.getElementById('timeText');
const roundEl = document.getElementById('round');
const correctEl = document.getElementById('correct');
const wrongEl = document.getElementById('wrong');
const feedback = document.getElementById('feedback');
const endResult = document.getElementById('endResult');

let time = 30;            // segundos iniciales
const MAX_TIME = 180;     // 3 minutos
const ROUNDS_TOTAL = 10;

let round = 0, correct = 0, wrong = 0;
let timerInterval = null;
let currentOptions = []; // array de 3 objetos
let currentAnswerIndex = 0;

function formatTime(s){
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}

function updateTimerUI(){
  const pct = Math.max(0, Math.min(100, (time / MAX_TIME) * 100));
  if (timerBar) timerBar.style.width = pct + '%';
  if (timeText) timeText.textContent = formatTime(time);
  if(time <= 0){
    endGame();
  }
}

function startTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    time = Math.max(0, time - 1);
    updateTimerUI();
  },1000);
}

function stopTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function nextRound(){
  round++;
  if (roundEl) roundEl.textContent = round;
  if (feedback) feedback.textContent = '';
  // fin por rondas
  if(round > ROUNDS_TOTAL){
    endGame();
    return;
  }
  // elegir 3 opciones distintas
  const pool = shuffle(IMAGES.slice());
  currentOptions = pool.slice(0,3);
  currentAnswerIndex = Math.floor(Math.random()*3);
  // Pregunta: mostramos la imagen objetivo arriba
  const question = currentOptions[currentAnswerIndex];
  if (questionImg) {
    questionImg.src = question.src;
    questionImg.alt = question.name;
  }

  if (optionsContainer) {
    // mostrar opciones (imágenes)
    optionsContainer.innerHTML = '';
    currentOptions.forEach((opt, idx)=>{
      const img = document.createElement('img');
      img.src = opt.src;
      img.alt = opt.name;
      img.className = 'opt';
      img.dataset.idx = idx;
      img.addEventListener('click', onChoose);
      optionsContainer.appendChild(img);
    });
  }
}

function onChoose(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if (optionsContainer) {
    // bloquear clics hasta siguiente ronda
    Array.from(optionsContainer.querySelectorAll('img')).forEach(i=>i.style.pointerEvents='none');
  }
  if(idx === currentAnswerIndex){
    correct++;
    if (correctEl) correctEl.textContent = correct;
    if (feedback) { feedback.textContent = '¡Correcto!'; feedback.style.color = '#1b7f2a'; }
    time = Math.min(MAX_TIME, time + 30);
  } else {
    wrong++;
    if (wrongEl) wrongEl.textContent = wrong;
    const correctName = currentOptions[currentAnswerIndex].name;
    if (feedback) { feedback.textContent = 'Respuesta incorrecta. La correcta era: ' + correctName; feedback.style.color = '#b32222'; }
    time = Math.max(0, time - 30);
  }
  updateTimerUI();

  const imgs = optionsContainer ? optionsContainer.querySelectorAll('img') : [];
  imgs.forEach((img, i)=>{
    if (img) img.style.borderColor = (i === currentAnswerIndex) ? '#2dc26b' : '#ddd';
    if(i === idx && i !== currentAnswerIndex && img) img.style.borderColor = '#ff5252';
  });

  // pequeña pausa y siguiente ronda
  setTimeout(()=>{
    if (optionsContainer) {
      // reset borders/pointer
      Array.from(optionsContainer.querySelectorAll('img')).forEach(i=>{
        i.style.borderColor = 'transparent';
        i.style.pointerEvents = '';
      });
    }
    // si el tiempo llegó a 0, terminar
    if(time <= 0){
      endGame();
    } else {
      nextRound();
    }
  }, 900);
}

function endGame(){
  stopTimer();
  if (game) game.classList.add('hidden');
  if (endResult) endResult.classList.remove('hidden');
  // mensaje según rendimiento
  const total = correct + wrong;
  let msg = '';
  if(correct >= 8) msg = 'Eres increíble.';
  else if(correct >= 4) msg = 'Puedes mejorar.';
  else msg = 'Falta mucho que aprender.';
  if (endResult) {
    endResult.innerHTML = `
      <h2>Juego terminado</h2>
      <p>Rondas jugadas: ${Math.min(round- (round>ROUNDS_TOTAL?1:0), ROUNDS_TOTAL)}</p>
      <p>Buenos: <strong>${correct}</strong> — Malos: <strong>${wrong}</strong></p>
      <p style="margin-top:8px;font-weight:700">${msg}</p>
      <div style="margin-top:12px">
        <button id="retry" class="btn">Jugar otra vez</button>
        <a href="seleccion.html" style="margin-left:8px;text-decoration:none"><button class="btn" style="background:#777">Volver</button></a>
      </div>
    `;
    const retryBtn = document.getElementById('retry');
    if (retryBtn) retryBtn.addEventListener('click', ()=>location.reload());
  }
}

// nueva función de inicio reutilizable
function startGame(){
  round = 0; correct = 0; wrong = 0;
  time = 30;
  if (roundEl) roundEl.textContent = round;
  if (correctEl) correctEl.textContent = correct;
  if (wrongEl) wrongEl.textContent = wrong;
  if (startBtn) startBtn.disabled = true;
  if (game) game.classList.remove('hidden');
  if (endResult) endResult.classList.add('hidden');
  updateTimerUI();
  startTimer();
  nextRound();
}

// Exponer startGame globalmente para que el botón del menú lo invoque
window.startGame = startGame;

// si existe el botón lo usamos, pero NO iniciar automáticamente al cargar
if (startBtn) {
  startBtn.addEventListener('click', startGame);
}

// si se navega directamente, mostrar tiempo inicial
updateTimerUI();
