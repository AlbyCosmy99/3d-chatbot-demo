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
  loader.load("/Avatar_v5.glb", (gltf) => {
    avatar = gltf.scene;
    scene.add(avatar);
    avatar.rotation.set(0, Math.PI, 0);
    avatar.rotation.x = 0.15;

    loadingOverlay.style.display = "none";

    // --- 🔹 Reset e forzo orientamento frontale ---

    avatar.rotateY(Math.PI);        // opzionale, se serve farlo guardare avanti

    // Centra come già fai
    const box3 = new THREE.Box3().setFromObject(avatar);
    const size = new THREE.Vector3();
    box3.getSize(size);
    const center = new THREE.Vector3();
    box3.getCenter(center);

    avatar.position.sub(center);

    // --- 🔹 Ora imposto la camera ---
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.3;

    camera.position.set(0, size.y * 0.5, cameraZ);
    camera.lookAt(0, size.y * 0.5, 0);


    mixer = new THREE.AnimationMixer(avatar);
    if (gltf.animations.length > 0) {
      mixer.clipAction(gltf.animations[0]).play();
    }

    console.log("✅ Avatar caricato e frontale!");
  }, (xhr) => {
    const progress = (xhr.loaded / xhr.total) * 100;
    loadingOverlay.textContent = `Caricamento avatar ${progress.toFixed(0)}%`;
  });


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
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  const stopBtn = document.getElementById("stopBtn");
  if (stopBtn) stopBtn.addEventListener("click", stopSpeaking);
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
