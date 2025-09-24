import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let knowledge = {};
let scene, camera, renderer, mixer, avatar, clock;
let speakingInterval = null;
let isSpeaking = false;
let initialized = false;

fetch("/knowledge.json")
  .then(r => r.json())
  .then(data => { knowledge = data; })
  .catch(() => console.warn("Nessun knowledge.json trovato, continuo senza."));

function init() {
  if (initialized) return;
  initialized = true;

  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#e6f2ff");

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
  loader.load(
    "/Avatar_v5.glb",
    (gltf) => {
      console.log("Animazioni disponibili:", gltf.animations.map(a => a.name));

      avatar = gltf.scene;
      scene.add(avatar);

      // Calcolo bounding box aggiornato
      const box3 = new THREE.Box3().setFromObject(avatar);
      const size = new THREE.Vector3();
      box3.getSize(size);
      const center = new THREE.Vector3();
      box3.getCenter(center);

      // Centra il modello
      avatar.position.sub(center);

      // Adatta la camera
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.3;

      camera.position.set(0, size.y * 0.5, cameraZ);
      camera.lookAt(0, size.y * 0.5, 0);

      // Mixer animazioni
      mixer = new THREE.AnimationMixer(avatar);
      if (gltf.animations.length > 0) {
        mixer.clipAction(gltf.animations[0]).play();
      }

      console.log("✅ Modello caricato, ruotato e centrato!");
    },
    undefined,
    (error) => console.error("❌ Errore nel caricamento del modello:", error)
  );

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (!clock) return;

  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (avatar) {
    const t = clock.elapsedTime;
    const head = avatar.getObjectByName("Wolf3D_Head");

    if (!isSpeaking) {
      avatar.position.y = Math.sin(t * 1.2) * 0.02;
      if (head) {
        head.rotation.x = Math.sin(t * 0.7) * 0.02;
        head.rotation.y = Math.sin(t * 0.9) * 0.015;
      }
    } else {
      avatar.rotation.y = Math.sin(t * 2) * 0.1;
      avatar.rotation.x = Math.sin(t * 1.5) * 0.05;
      if (head) {
        head.rotation.x = Math.sin(t * 3) * 0.07;
        head.rotation.y = Math.sin(t * 2.2) * 0.05;
      }
      const spine = avatar.getObjectByName("Spine");
      if (spine) spine.rotation.z = Math.sin(t * 1.8) * 0.05;
    }
  }

  renderer?.render(scene, camera);
}

// --- Chatbot & voice functions ---

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
        "Authorization": `Bearer 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`
        //"Authorization": `Bearer ${process.env.GROQ_API_KEY}`
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
    parla(risposta);
  } catch (err) {
    console.error(err);
    addMessage("🤖", "Errore nel collegamento all'API gratuita");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("userInput");
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // bottone STOP
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
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();

  isSpeaking = false;

  clearInterval(speakingInterval);
  speakingInterval = null;

  const head = avatar?.getObjectByName("Wolf3D_Head");

  if (head && head.morphTargetDictionary) {
    const mouthOpenIndex = head.morphTargetDictionary.mouthOpen;
    const mouthSmileIndex = head.morphTargetDictionary.mouthSmile;
    if (mouthOpenIndex !== undefined) head.morphTargetInfluences[mouthOpenIndex] = 0;
    if (mouthSmileIndex !== undefined) head.morphTargetInfluences[mouthSmileIndex] = 0;
  }

  console.log("⏹️ Parlato interrotto manualmente.");
}

function parla(testo) {
  const synth = window.speechSynthesis;
  const voce = new SpeechSynthesisUtterance(testo);
  voce.lang = "it-IT";

  // Cerca la mesh con morph targets
  const head = avatar.getObjectByName("Mesh002"); // <-- controlla col traverse
  console.log("Head trovato:", head);

  if (!head || !head.morphTargetDictionary) {
    console.warn("❌ Nessun morph target trovato");
    synth.speak(voce);
    return;
  }
  console.log("✅ Morph targets trovati:", head.morphTargetDictionary);

  const phonemes = ["aa", "O", "E", "I", "U", "FF", "CH", "SS", "nn", "RR", "PP"];

  voce.onstart = () => {
    isSpeaking = true;

    speakingInterval = setInterval(() => {
      // reset tutti i fonemi
      phonemes.forEach(p => {
        const idx = head.morphTargetDictionary[p];
        if (idx !== undefined) head.morphTargetInfluences[idx] = 0;
      });

      // attiva uno random
      const randomPhoneme = phonemes[Math.floor(Math.random() * phonemes.length)];
      const idx = head.morphTargetDictionary[randomPhoneme];
      if (idx !== undefined) {
        head.morphTargetInfluences[idx] = Math.random();
      }
    }, 120);
  };

  voce.onend = () => stopSpeaking();

  synth.speak(voce);
}



// --- Riconoscimento vocale ---
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

  recognition.onerror = (err) =>
    console.error("❌ Errore riconoscimento:", err);

  recognition.onend = () => {
    voiceBtn.style.background = "#0078ff";
  };
} else {
  console.warn("⚠️ Riconoscimento vocale non supportato.");
  if (voiceBtn) voiceBtn.disabled = true;
}

window.sendMessage = sendMessage;
window.init = init;
