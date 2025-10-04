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
  loader.load(
    "/Avatar_v5.glb",
    (gltf) => {
      console.log("Animazioni disponibili:", gltf.animations.map(a => a.name));

      avatar = gltf.scene;
      scene.add(avatar);

      avatar.traverse((child) => {
        if (child.isMesh && child.morphTargetDictionary) {
          console.log("🧠 Morph targets per", child.name, ":", Object.keys(child.morphTargetDictionary));
        }
      });

      const box3 = new THREE.Box3().setFromObject(avatar);
      const size = new THREE.Vector3();
      box3.getSize(size);
      const center = new THREE.Vector3();
      box3.getCenter(center);

      avatar.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.3;

      camera.position.set(0, size.y * 0.5, cameraZ);
      camera.lookAt(0, size.y * 0.5, 0);

      mixer = new THREE.AnimationMixer(avatar);
      if (gltf.animations.length > 0) mixer.clipAction(gltf.animations[0]).play();

      console.log("✅ Modello caricato e centrato!");
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
    const head = avatar.getObjectByName("Wolf3D_Head") || avatar.getObjectByName("Mesh002");

    if (!isSpeaking) {
      avatar.position.y = Math.sin(t * 1.2) * 0.02;
      if (head) {
        head.rotation.x = Math.sin(t * 0.7) * 0.02;
        head.rotation.y = Math.sin(t * 0.9) * 0.015;
      }
    } else {
      avatar.rotation.y = Math.sin(t * 2) * 0.1;
      avatar.rotation.x = Math.sin(t * 1.5) * 0.05;
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
    // const res = await fetch("http://localhost:3000/speak", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ text: testo })
    // });

    const data = {
      "audio": "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",
      "marks": [
        {
          "time": 6,
          "type": "word",
          "start": 0,
          "end": 4,
          "value": "ciao"
        },
        {
          "time": 6,
          "type": "viseme",
          "value": "S"
        },
        {
          "time": 108,
          "type": "viseme",
          "value": "a"
        },
        {
          "time": 259,
          "type": "word",
          "start": 5,
          "end": 9,
          "value": "come"
        },
        {
          "time": 259,
          "type": "viseme",
          "value": "k"
        },
        {
          "time": 371,
          "type": "viseme",
          "value": "E"
        },
        {
          "time": 418,
          "type": "viseme",
          "value": "p"
        },
        {
          "time": 483,
          "type": "word",
          "start": 10,
          "end": 14,
          "value": "stai"
        },
        {
          "time": 483,
          "type": "viseme",
          "value": "s"
        },
        {
          "time": 605,
          "type": "viseme",
          "value": "t"
        },
        {
          "time": 654,
          "type": "viseme",
          "value": "a"
        },
        {
          "time": 794,
          "type": "viseme",
          "value": "i"
        },
        {
          "time": 1105,
          "type": "viseme",
          "value": "sil"
        }
      ]
    }//await res.json();
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
    "p": "PP", "f": "FF", "th": "TH", "t": "DD", "S": "SS", "k": "kk", "n": "nn", "r": "RR",
    "a": "aa", "e": "E", "i": "I", "o": "O", "u": "U", "sil": "mouthClose"
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

  const resetMouth = () => {
    faceMeshes.forEach(mesh => {
      for (let key in mesh.morphTargetDictionary) {
        const idx = mesh.morphTargetDictionary[key];
        if (idx !== undefined) mesh.morphTargetInfluences[idx] = 0;
      }
    });
  };

  let lastIndex = 0;
  resetMouth();

  const animateVisemes = () => {
    if (!audio.paused && lastIndex < marks.length) {
      const currentTime = audio.currentTime * 1000;
      const next = marks[lastIndex];

      if (currentTime >= next.time) {
        resetMouth();

        if (next.type === "viseme" && visemeMap[next.value]) {
          const morphName = visemeMap[next.value];

          faceMeshes.forEach(mesh => {
            const idx = mesh.morphTargetDictionary[morphName];
            if (idx !== undefined) {
              mesh.morphTargetInfluences[idx] = 1.0;
              setTimeout(() => mesh.morphTargetInfluences[idx] = 0, 100);
            }
          });
        }
        lastIndex++;
      }

      requestAnimationFrame(animateVisemes);
    } else {
      resetMouth();
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
