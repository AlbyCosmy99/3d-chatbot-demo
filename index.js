import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let knowledge = {};
let scene, camera, renderer, mixer, avatar, clock;
let speakingInterval = null;
let isSpeaking = false;
let initialized = false;

let audioElement = new Audio();
let audioUnlocked = false;

document.addEventListener("click", () => {
  if (!audioUnlocked) {
    audioElement.play().catch(() => { });
    audioElement.pause();
    audioUnlocked = true;
    console.log("🔓 Audio sbloccato per iOS");
  }
}, { once: true });

fetch("/knowledge.json")
  .then(r => r.json())
  .then(data => { knowledge = data; })
  .catch(() => console.warn("Nessun knowledge.json trovato, continuo senza."));

function init() {
  if (initialized) return;
  initialized = true;

  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = null;

  const canvas = document.getElementById("scene");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(3, 10, 10);
  scene.add(dirLight);

  const loader = new GLTFLoader();
  loader.load("/Avatar_v6.glb", (gltf) => {
    avatar = gltf.scene;
    scene.add(avatar);

    console.log("🎬 Animazioni trovate:", gltf.animations.map(a => a.name));

    const armatures = [];
    avatar.traverse(obj => {
      if (obj.type === "Bone" && obj.parent && obj.parent.type === "Object3D") {
        armatures.push(obj.parent);
      }
    });
    console.log("🦴 Armature trovate:", armatures.map(a => a.name));

    const target = armatures[0] || avatar;
    mixer = new THREE.AnimationMixer(target);


    const actions = {};
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      actions[clip.name] = action;
      console.log(`🎞️ Azione pronta: ${clip.name} (${clip.duration.toFixed(2)}s)`);
    });

    avatar.userData.animations = actions;

    const firstAnim = Object.keys(actions)[0];
    if (firstAnim) {
      playAnimation(firstAnim);
    }

    console.log("Avatar caricato e animazioni pronte!");
  });

  let currentAction = null;
  function playAnimation(name, fadeDuration = 0.5) {
    if (!avatar?.userData?.animations) return;
    const action = avatar.userData.animations[name];
    if (!action) {
      console.warn(`⚠️ Animazione '${name}' non trovata.`);
      return;
    }

    if (currentAction === action) return;

    if (currentAction) currentAction.fadeOut(fadeDuration);

    action.reset().fadeIn(fadeDuration).play();
    currentAction = action;
    console.log(`▶️ Animazione attiva: ${name}`);
  }



  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (!clock) return;

  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (avatar) {
    const t = clock.elapsedTime;
    const head = avatar.getObjectByName("Wolf3D_Head") || avatar.getObjectByName("Mesh002");

    avatar.position.y = Math.sin(t * 1.2) * 0.02;
    if (head) {
      head.rotation.x = Math.sin(t * 0.7) * 0.02;
      head.rotation.y = Math.sin(t * 0.9) * 0.015;
    }
  }

  renderer?.render(scene, camera);
}

async function sendMessage() {
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  addMessage("👤", msg);
  input.value = "";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Sei un assistente virtuale 3D amichevole." },
          { role: "user", content: msg }
        ]
      })
    });

    const data = await res.json();
    const risposta = data.choices?.[0]?.message?.content || "Nessuna risposta 😕";

    addMessage("🤖", risposta);
    await parla(risposta);
  } catch (err) {
    console.error(err);
    addMessage("🤖", "Errore nel collegamento all'API");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const voiceBtn = document.getElementById("voiceBtn");
  const stopBtn = document.getElementById("stopBtn");

  let recognition = null;
  let listening = false;
  let currentAudio = null; // 🔹 serve per poter fermare l’avatar

  // 🧠 PATCH: assegno l’audio globale nel sistema TTS
  window.setCurrentAudio = (audio) => { currentAudio = audio; };

  // 💬 INVIO MESSAGGIO TESTO
  sendBtn.addEventListener("click", () => {
    const msg = input.value.trim();
    if (!msg) return;
    sendMessage();
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // 🎤 RICONOSCIMENTO VOCALE
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechAPI();
    recognition.lang = "it-IT";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      listening = true;
      voiceBtn.classList.add("recording");
      input.placeholder = "🎙️ Sto ascoltando...";
      console.log("🎤 Microfono avviato");
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      input.value = transcript;

      // Se è finale, invia il messaggio
      if (event.results[0].isFinal) {
        console.log("🗣️ Testo finale:", transcript);
        sendMessage();
      }
    };

    recognition.onerror = (err) => {
      console.error("❌ Errore riconoscimento:", err);
      listening = false;
      voiceBtn.classList.remove("recording");
      input.placeholder = "Scrivi qui...";
    };

    recognition.onend = () => {
      listening = false;
      voiceBtn.classList.remove("recording");
      input.placeholder = "Scrivi qui...";
      console.log("🛑 Microfono chiuso");
    };

    // 🔘 Bottone per attivare/disattivare microfono
    voiceBtn.addEventListener("click", () => {
      if (!listening) {
        try {
          recognition.start();
        } catch (e) {
          console.warn("⚠️ Microfono non avviabile:", e);
        }
      } else {
        recognition.stop();
      }
    });
  } else {
    console.warn("⚠️ Riconoscimento vocale non supportato.");
    voiceBtn.disabled = true;
  }

  // ⏹️ STOP: ferma parlato e microfono
  stopBtn.addEventListener("click", () => {
    console.log("⏹️ Stop premuto — fermo audio e animazioni");
    // 1️⃣ Ferma microfono
    if (recognition && listening) recognition.stop();
    listening = false;
    voiceBtn.classList.remove("recording");

    // 2️⃣ Ferma parlato avatar
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    // 3️⃣ Ferma bocca e animazioni
    stopSpeaking();
  });

  console.log("✅ Bottoni inizializzati correttamente");
});


function addMessage(sender, text) {
  const div = document.createElement("div");
  div.className = sender === "👤" ? "message user" : "message bot";
  div.textContent = text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
}

function stopSpeaking() {
  isSpeaking = false;
  clearInterval(speakingInterval);
  speakingInterval = null;
  resetAllMouth();
  console.log("⏹️ Parlato interrotto manualmente.");
}

// --- 🔹 POLLY TTS + VISEME SINCRONIZZATI ---
async function parla(testo) {
  if (!avatar) return console.warn("⏳ Avatar non ancora caricato");

  try {
    const res = await fetch("https://avatar3d-polly.onrender.com/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: testo })
    });

    const data = await res.json();
    const audioBase64 = data.audio;
    const marks = data.marks;

    const audio = new Audio("data:audio/mp3;base64," + audioBase64);
    window.setCurrentAudio(audio); // 🔹 consente di fermarlo da stopBtn
    audio.play();

    syncVisemesWithAvatar(marks, audio);

  } catch (err) {
    console.error("Errore Polly:", err);
  }
}

function resetAllMouth() {
  avatar.traverse(mesh => {
    if (mesh.isMesh && mesh.morphTargetInfluences) {
      Object.keys(mesh.morphTargetDictionary).forEach(key => {
        mesh.morphTargetInfluences[mesh.morphTargetDictionary[key]] = 0;
      });
    }
  });
}

function syncVisemesWithAvatar(marks, audio) {
  const visemeMap = {
    "p": "PP", "f": "FF", "th": "TH", "t": "DD",
    "S": "SS", "k": "kk", "n": "nn", "r": "RR",
    "a": "aa", "e": "E", "i": "I", "o": "O", "u": "U",
    "sil": "mouthClose"
  };

  const faceMeshes = [];
  avatar.traverse(obj => {
    if (obj.isMesh && obj.morphTargetDictionary && Object.keys(obj.morphTargetDictionary).length > 0) {
      faceMeshes.push(obj);
    }
  });

  if (faceMeshes.length === 0) {
    console.warn("⚠️ Nessuna mesh con morph target trovata!");
    return;
  }

  const offsetMs = 60; // 🔹 leggero ritardo per sincronia audio
  let lastIndex = 0;
  let currentIntensity = 0;
  let currentViseme = null;

  const resetMouth = (decay = 0.96) => {
    faceMeshes.forEach(mesh => {
      for (let key in mesh.morphTargetDictionary) {
        const idx = mesh.morphTargetDictionary[key];
        if (idx !== undefined) {
          mesh.morphTargetInfluences[idx] *= decay;
        }
      }
    });
  };

  const animateVisemes = () => {
    if (!audio.paused && lastIndex < marks.length) {
      const currentTime = (audio.currentTime * 1000) + offsetMs;
      const next = marks[lastIndex];

      if (currentTime >= next.time) {
        if (next.type === "viseme" && visemeMap[next.value]) {
          currentViseme = visemeMap[next.value];
          currentIntensity = 0.3 + Math.random() * 0.3; // 🔹 apertura più ampia (0.3–0.6)
        } else {
          currentViseme = "mouthClose";
          currentIntensity = 0.12; // 🔹 chiusura leggera nei silenzi
        }
        lastIndex++;
      }

      resetMouth();

      if (currentViseme) {
        faceMeshes.forEach(mesh => {
          const idx = mesh.morphTargetDictionary[currentViseme];
          if (idx !== undefined) {
            mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
              mesh.morphTargetInfluences[idx],
              currentIntensity,
              0.2 // 🔹 transizione morbida anche con apertura più ampia
            );
          }
        });
      }

      requestAnimationFrame(animateVisemes);
    } else {
      const fadeOut = setInterval(() => {
        resetMouth(0.92);
      }, 30);
      setTimeout(() => clearInterval(fadeOut), 400);
    }
  };

  audio.addEventListener("play", () => {
    isSpeaking = true;
    requestAnimationFrame(animateVisemes);
  });

  audio.addEventListener("ended", () => {
    isSpeaking = false;
    resetMouth();
  });
}




// --- 🎤 RICONOSCIMENTO VOCALE (facoltativo) ---
const voiceBtn = document.getElementById("voiceBtn");

if ("webkitSpeechRecognition" in window) {
  const recognition = new webkitSpeechRecognition();
  recognition.lang = "it-IT";
  recognition.continuous = false;
  recognition.interimResults = false;

  voiceBtn.addEventListener("click", () => {
    recognition.start();
    voiceBtn.style.background = "#ff4d4d";
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("userInput").value = transcript;
    sendMessage();
  };

  recognition.onerror = (err) => console.error("❌ Errore riconoscimento:", err);
  recognition.onend = () => { voiceBtn.style.background = "#0078ff"; };
} else {
  console.warn("⚠️ Riconoscimento vocale non supportato.");
  if (voiceBtn) voiceBtn.disabled = true;
}

window.sendMessage = sendMessage;
window.init = init;
