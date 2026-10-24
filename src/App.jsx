import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, BookOpen, Feather, Image as ImageIcon, Music, Mic, Video,
  FileText, FolderHeart, Wand2, Play, Pause, Download, RefreshCw,
  Plus, Trash2, Check, AlertCircle, ChevronRight, Upload, Eye,
  Printer, Edit3, Save, Copy, Search, Filter, Layers, Volume2,
  UserCheck, Palette, Sliders, HelpCircle, CheckCircle2, Film,
  Smile, Heart, Star, Sun, Cloud, Share2, ArrowLeft, Loader2, X
} from 'lucide-react';

// ==========================================
// CẤU HÌNH API & TIỆN ÍCH HỖ TRỢ AI THỰC TẾ
// ==========================================
// Hàm gọi API có cơ chế thử lại (Exponential Backoff)
async function fetchWithRetry(url, options, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
}

// 1. Gọi Gemini tạo văn bản có cấu trúc JSON hoặc tự do
async function generateAIText(prompt, systemInstruction = "", jsonSchema = null) {
  const url = "/api/gemini";
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
  };
  if (jsonSchema) {
    payload.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
    };
  }
  const data = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-3-flash-preview", payload }),
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Không nhận được phản hồi từ AI.");
  return jsonSchema ? JSON.parse(text) : text;
}

// 2. Gọi Gemini 3.1 Flash Image tạo tranh đồng nhất nhân vật (hỗ trợ truyền ảnh mẫu base64 tham chiếu)
async function generateAIImage(prompt, aspectRatio = "16:9", referenceImageUrl = null) {
  const url = "/api/gemini";
  const parts = [{ text: prompt }];

  if (referenceImageUrl && referenceImageUrl.startsWith("data:image")) {
    const [header, base64Data] = referenceImageUrl.split(",");
    const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
    parts.push({
      inlineData: {
        mimeType,
        data: base64Data,
      },
    });
  }

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  };

  const data = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-3.1-flash-image", payload }),
  });

  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Không tạo được hình ảnh từ AI.");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

// 3. Chuyển đổi PCM16 sang WAV để phát và tải file âm thanh TTS thực tế
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function pcmToWav(pcm16, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm16.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm16.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }
  return new Blob([view], { type: "audio/wav" });
}

// 4. Gọi Gemini TTS tạo giọng đọc tiếng Việt truyền cảm (Đơn giọng hoặc Phân vai)
async function generateAITTS(text, voiceName = "Aoede", isMultiSpeaker = false) {
  const url = "/api/gemini";

  let speechConfig = {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  };

  if (isMultiSpeaker) {
    speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          { speaker: "Người dẫn chuyện", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          { speaker: "Nhân vật", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
        ],
      },
    };
  }

  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig,
    },
    model: "gemini-2.5-flash-preview-tts",
  };

  const data = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-2.5-flash-preview-tts", payload }),
  });

  const part = data?.candidates?.[0]?.content?.parts?.[0];
  const audioData = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || "audio/L16;rate=24000";

  if (!audioData) throw new Error("Không tạo được giọng đọc từ AI.");
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  const pcmBuffer = base64ToArrayBuffer(audioData);
  const pcm16 = new Int16Array(pcmBuffer);
  const wavBlob = pcmToWav(pcm16, sampleRate);
  return URL.createObjectURL(wavBlob);
}

// 5. Bộ tổng hợp giai điệu thiếu nhi thực tế (Web Audio Synthesizer xuất file WAV thật)
async function synthesizeChildrenMelodyWav(tempoBpm = 115, style = "Vui tươi", durationSec = 16) {
  const sampleRate = 44100;
  const totalSamples = sampleRate * durationSec;
  const pcm16 = new Int16Array(totalSamples);

  // Thang âm ngũ cung / trưởng vui tươi cho thiếu nhi (tần số Hz)
  const happyScale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
  const lullabyScale = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25];
  const scale = style.includes("Dịu dàng") || style.includes("Ru") ? lullabyScale : happyScale;

  const beatDuration = 60 / tempoBpm;
  const melodyPattern = [0, 2, 4, 5, 4, 2, 3, 1, 0, 4, 5, 6, 5, 4, 2, 0];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / (beatDuration / 2));
    const noteTime = t % (beatDuration / 2);
    const freq = scale[melodyPattern[beatIndex % melodyPattern.length]];

    // Âm sắc Music Box / Marimba ấm áp cho trẻ mầm non
    const envelope = Math.exp(-noteTime * 6.5);
    const fundamental = Math.sin(2 * Math.PI * freq * t);
    const harmonic2 = 0.35 * Math.sin(2 * Math.PI * freq * 2 * t);
    const harmonic3 = 0.15 * Math.sin(2 * Math.PI * freq * 3 * t);

    // Đệm hợp âm nền nhẹ
    const bassFreq = scale[0] / 2;
    const bassEnv = Math.exp(-(t % (beatDuration * 2)) * 2.5);
    const bass = 0.25 * Math.sin(2 * Math.PI * bassFreq * t) * bassEnv;

    const signal = (fundamental + harmonic2 + harmonic3) * envelope * 0.45 + bass;
    pcm16[i] = Math.max(-1, Math.min(1, signal)) * 32767;
  }

  const wavBlob = pcmToWav(pcm16, sampleRate);
  return URL.createObjectURL(wavBlob);
}

// ==========================================
// DỮ LIỆU MẪU KHỞI TẠO (DEMO TRỰC QUAN NGAY KHI MỞ APP)
// ==========================================
const INITIAL_SAMPLE_PROJECTS = [
  {
    id: "proj-sample-1",
    title: "Bộ học liệu: Gà Tơ Đi Học",
    topic: "Trường mầm non & Động vật",
    ageGroup: "4–5 tuổi",
    schoolYear: "2026–2027",
    style: "Hoạt hình 3D dễ thương",
    createdAt: "24/10/2026",
    poem: {
      title: "Gà Tơ Đi Học",
      ageGroup: "4–5 tuổi",
      genre: "Thơ 4 chữ",
      stanzas: [
        "Ông mặt trời thức\nTỏa nắng vàng tươi\nGà Tơ rạng rỡ\nĐeo cặp đến trường.",
        "Gặp cô Gà Mái\nKhoanh tay chào thưa\nCùng bạn Vịt Trắng\nMúa hát say sưa.",
        "Học bao điều tốt\nBiết lễ phép ngoan\nChiều về líu lo\nKhoe mẹ bông hồng."
      ],
      questions: [
        "Buổi sáng Gà Tơ chuẩn bị đi đâu hả các con?",
        "Khi gặp cô giáo Gà Mái, bạn Gà Tơ đã làm gì?",
        "Đến trường bạn Gà Tơ được chơi và học cùng ai?",
        "Các con đi học có ngoan và lễ phép giống bạn Gà Tơ không?"
      ],
      activities: [
        "Đọc thơ kết hợp cử chỉ điệu bộ: Làm động tác gà vỗ cánh, khoanh tay chào cô.",
        "Trò chơi 'Tiếng gáy của ai': Trẻ đoán giọng bạn và đọc tiếp câu thơ.",
        "Hoạt động tô màu chiếc cặp sách xinh xắn của bạn Gà Tơ."
      ],
      illustrationUrl: ""
    },
    story: {
      title: "Buổi Học Đầu Tiên Của Gà Tơ",
      ageGroup: "4–5 tuổi",
      moralLesson: "Đi học mầm non rất vui, có cô giáo yêu thương và nhiều bạn bè tốt. Trẻ biết lễ phép chào hỏi và chia sẻ đồ chơi cùng bạn.",
      puppetScript: "Sử dụng rối tay Gà Tơ (lông vàng, đeo ba lô đỏ) và Vịt Bông (lông trắng, mũ xanh). Giáo viên dựng sân khấu mô hình lớp học Nắng Mai. Khi Gà Tơ rụt rè nấp sau cánh gà, giáo viên mời các bé trong lớp cùng vỗ tay gọi 'Bạn Gà Tơ ơi, vào lớp chơi cùng chúng mình nhé!' để tăng tính tương tác.",
      questions: [
        "Vì sao lúc mới đến cổng trường bạn Gà Tơ lại rụt rè?",
        "Ai đã ra đón và dắt tay Gà Tơ vào lớp?",
        "Bạn Vịt Bông đã rủ Gà Tơ chơi trò chơi gì?",
        "Sau buổi học đầu tiên, Gà Tơ cảm thấy thế nào?"
      ],
      scenes: [
        {
          sceneNumber: 1,
          title: "Trước cổng trường Mầm non Nắng Mai",
          setting: "Cổng trường mầm non rực rỡ hoa hướng dương, nắng sớm vàng ấm áp",
          narration: "Sáng mùa thu trong trẻo, Gà Tơ diện chiếc áo yếm xanh da trời và đeo chiếc ba lô nhỏ màu đỏ bước tới cổng trường Mầm non Nắng Mai. Lần đầu đi học, Gà Tơ hơi hồi hộp nên cứ nắm chặt cánh mẹ.",
          dialogue: "Gà Tơ: Mẹ ơi, con hơi sợ, trong lớp có bạn nào chơi với con không ạ?",
          imagePrompt: "Cute 3D Pixar style illustration, a little fluffy yellow chick wearing light blue overalls and a small red backpack standing shyly at a colorful kindergarten gate with sunflowers, warm morning sunlight, soft pastel colors",
          imageUrl: "",
          duration: 6
        },
        {
          sceneNumber: 2,
          title: "Cô giáo dịu dàng đón bé",
          setting: "Hiên lớp học trang trí chong chóng nhiều màu sắc",
          narration: "Cô giáo Thỏ Trắng bước ra với nụ cười hiền hậu, nhẹ nhàng xoa đầu Gà Tơ. Gà Tơ nhớ lời mẹ dặn, liền khoanh hai cánh nhỏ lễ phép chào cô.",
          dialogue: "Gà Tơ: Con chào cô giáo ạ! Cô Thỏ Trắng: Cô chào Gà Tơ ngoan nhé, vào lớp cùng các bạn nào con!",
          imagePrompt: "Cute 3D Pixar style illustration, a little fluffy yellow chick wearing light blue overalls and a small red backpack bowing politely to a gentle white rabbit teacher wearing pink glasses at kindergarten entrance, pastel colors",
          imageUrl: "",
          duration: 6
        },
        {
          sceneNumber: 3,
          title: "Niềm vui bên bạn mới",
          setting: "Trong lớp học mầm non ấm cúng với thảm chơi và khối gỗ màu sắc",
          narration: "Trong lớp, bạn Vịt Bông chạy lại tặng Gà Tơ một khối gỗ màu vàng. Hai bạn cùng nhau xếp ngôi nhà cao tầng và cười vang khắp lớp. Gà Tơ nhận ra đi học thật là vui!",
          dialogue: "Vịt Bông: Gà Tơ ơi, mình cùng xếp ngôi nhà thật đẹp nhé!",
          imagePrompt: "Cute 3D Pixar style illustration, the same little fluffy yellow chick in light blue overalls with red backpack playing wooden blocks happily with a cute white duckling wearing a mint cap inside a bright kindergarten classroom",
          imageUrl: "",
          duration: 6
        }
      ]
    },
    characters: [
      {
        id: "char-1",
        name: "Gà Tơ",
        species: "Gà con lông vàng mượt",
        faceDetails: "Mắt tròn đen láy long lanh, mỏ nhỏ màu cam nhạt, hai má hồng phúng phính",
        bodyDetails: "Thân hình tròn trịa nhỏ nhắn, lông vàng kem mềm mại, đôi cánh ngắn dễ thương",
        outfit: "Mặc áo yếm vải jean màu xanh da trời pastel, đeo ba lô nhỏ màu đỏ có hình ngôi sao vàng",
        personality: "Ngoan ngoãn, lễ phép, ban đầu hơi rụt rè nhưng rất hòa đồng và giàu tình cảm",
        age: "4 tuổi",
        style: "Hoạt hình 3D dễ thương",
        colorPalette: "Vàng kem (#FDE68A), Xanh da trời (#93C5FD), Đỏ hồng (#FCA5A5)",
        referenceImageUrl: "",
        approved: true
      }
    ],
    song: {
      title: "Bé Gà Tơ Tới Lớp",
      ageGroup: "4–5 tuổi",
      style: "Vui tươi, rộn ràng",
      tempo: 120,
      instruments: "Đàn Piano, Chuông gió (Glockenspiel), Trống lắc tay Tambourine",
      structure: {
        intro: "(Nhạc dạo rộn ràng tiếng chuông gió ngân vang: Đồ Mi Sol Đố - Sol Mi Đồ)",
        verse1: "Nắng sớm lên rồi kìa bạn ơi\nGà Tơ nhanh chân bước tới trường\nÁo yếm xinh cùng chiếc cặp hồng\nKhoanh tay chào cô, tạm biệt mẹ yêu.",
        chorus: "Chíp chíp chíp, vui quá đi thôi!\nTrường mầm non có bao bạn hiền\nCùng múa ca, cùng xếp ngôi nhà\nMỗi ngày đến lớp là một ngày vui!",
        ending: "Mỗi ngày đến lớp... bé thật là ngoan! (Vỗ tay 3 cái: Bộp - Bộp - Bộp)"
      },
      movements: [
        "Câu Mở đầu: Hai tay đưa lên cao vẫy nhẹ như tia nắng ban mai.",
        "Điệp khúc 'Chíp chíp chíp': Hai tay gập vào vai làm cánh gà vẫy nhịp nhàng, nhún chân theo nhịp 2/4.",
        "Câu Kết: Khoanh tay trước ngực cúi chào tươi cười."
      ],
      sunoPrompt: "Children Vietnamese cheerful nursery rhyme song, upbeat 120 BPM, cute glockenspiel, acoustic guitar and piano, clear warm female kindergarten teacher vocal singing Vietnamese lyrics, joyful and innocent atmosphere",
      audioUrl: ""
    },
    lessonPlan: {
      title: "Giáo án Làm quen Văn học: Truyện 'Buổi Học Đầu Tiên Của Gà Tơ'",
      ageGroup: "4–5 tuổi",
      objectives: {
        knowledge: "Trẻ nhớ tên truyện 'Buổi Học Đầu Tiên Của Gà Tơ', nhớ tên các nhân vật (Gà Tơ, cô giáo Thỏ Trắng, bạn Vịt Bông) và hiểu nội dung câu chuyện.",
        skills: "Trẻ trả lời trọn câu các câu hỏi đàm thoại rõ ràng, mạch lạc. Phát triển ngôn ngữ biểu cảm khi tập nói lời thoại lễ phép của nhân vật.",
        attitude: "Trẻ yêu thích đến trường mầm non, biết lễ phép chào cô, chào bố mẹ và đoàn kết chia sẻ đồ chơi với bạn bè."
      },
      preparation: {
        teacher: "Bộ tranh minh họa đồng nhất 3D trên màn hình tương tác, rối tay nhân vật Gà Tơ - Vịt Bông, nhạc bài hát 'Bé Gà Tơ Tới Lớp', giọng đọc AI phân vai.",
        children: "Tâm thế vui vẻ, mũ đội đầu hình Gà Tơ và Vịt Bông cho hoạt động đóng kịch."
      },
      procedure: [
        {
          step: "Hoạt động 1: Gây hứng thú (3–4 phút)",
          content: "Cô và trẻ cùng vận động theo nhạc bài hát 'Bé Gà Tơ Tới Lớp'. Cô xuất hiện rối tay bạn Gà Tơ chào các bé và dẫn dắt vào câu chuyện."
        },
        {
          step: "Hoạt động 2: Kể chuyện & Đàm thoại (12–15 phút)",
          content: "- Lần 1: Cô kể diễn cảm kết hợp cử chỉ điệu bộ.\n- Lần 2: Kể chuyện kết hợp trình chiếu bộ tranh minh họa đồng nhất và giọng đọc AI phân vai trên màn hình.\n- Đàm thoại gợi mở theo 4 câu hỏi tương tác kết hợp giáo dục lễ giáo."
        },
        {
          step: "Hoạt động 3: Trò chơi & Đóng kịch trải nghiệm STEAM (7–8 phút)",
          content: "- Trò chơi 'Bé khéo tay xây trường': Trẻ chia nhóm dùng khối gỗ/cốc giấy xếp cổng trường Mầm non Nắng Mai cho bạn Gà Tơ (tích hợp STEAM).\n- Đóng kịch tương tác: Trẻ đội mũ nhân vật tập nói lời chào lễ phép và lời rủ bạn cùng chơi."
        }
      ],
      steamExtension: "Góc STEAM: Cho trẻ tạo hình bạn Gà Tơ từ bông gòn màu vàng, giấy màu và lõi giấy vệ sinh tái chế; ứng dụng AI trình chiếu sản phẩm của trẻ."
    }
  }
];

export default function App() {
  // Quản lý điều hướng Tab chính
  const [activeTab, setActiveTab] = useState("home");

  // Quản lý danh sách dự án học liệu (Lưu bền vững trong phiên & đồng bộ dự án đang mở)
  const [projects, setProjects] = useState(INITIAL_SAMPLE_PROJECTS);
  const [currentProjectId, setCurrentProjectId] = useState("proj-sample-1");

  // Thông báo trạng thái toàn cục (Toast)
  const [toast, setToast] = useState(null);
  // Hộp thoại xác nhận xóa (thay thế confirm() của trình duyệt)
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null });
  // Hộp thoại hướng dẫn sử dụng
  const [showGuideModal, setShowGuideModal] = useState(false);
  // Chế độ xem trước bản in / trình chiếu
  const [printPreviewData, setPrintPreviewData] = useState(null);

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  const showNotification = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const updateCurrentProject = (updater) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id === currentProjectId) {
          return typeof updater === "function" ? updater(proj) : { ...proj, ...updater };
        }
        return proj;
      })
    );
  };

  // Danh sách các mục trên thanh điều hướng
  const navItems = [
    { id: "home", label: "Trang chủ", icon: Sparkles, color: "text-emerald-600", bg: "bg-emerald-100" },
    { id: "all-in-one", label: "Tạo Bộ Toàn Diện", icon: Wand2, color: "text-amber-600", bg: "bg-amber-100", badge: "HOT" },
    { id: "poem", label: "A. Sáng Tác Thơ", icon: Feather, color: "text-sky-600", bg: "bg-sky-100" },
    { id: "story", label: "B. Sáng Tác Truyện", icon: BookOpen, color: "text-rose-600", bg: "bg-rose-100" },
    { id: "character-art", label: "C. Tranh Đồng Nhất", icon: Palette, color: "text-purple-600", bg: "bg-purple-100", badge: "Cốt lõi" },
    { id: "song", label: "D. Sáng Tác Nhạc", icon: Music, color: "text-pink-600", bg: "bg-pink-100" },
    { id: "tts", label: "E. Giọng Đọc AI", icon: Mic, color: "text-teal-600", bg: "bg-teal-100" },
    { id: "video", label: "F. Tạo Video", icon: Video, color: "text-indigo-600", bg: "bg-indigo-100" },
    { id: "lesson", label: "G. Soạn Giáo Án", icon: FileText, color: "text-orange-600", bg: "bg-orange-100" },
    { id: "library", label: "Thư Viện Cá Nhân", icon: FolderHeart, color: "text-cyan-600", bg: "bg-cyan-100" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E6F8F3] via-[#FFF9E6] to-[#FCEEF5] text-slate-800 flex flex-col font-sans selection:bg-emerald-200 relative overflow-x-hidden">
      {/* CSS PHONG CÁCH 3D PIXAR / CLAYMORPHISM ĐỘC QUYỀN */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@600;700;800&display=swap');
        
        .font-pixar {
          font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .pixar-card {
          background: rgba(255, 255, 255, 0.94);
          border-radius: 28px;
          border: 3px solid #FFFFFF;
          box-shadow: 
            0 16px 32px -8px rgba(16, 185, 129, 0.14),
            0 6px 14px -3px rgba(0, 0, 0, 0.05),
            inset 0 -5px 10px rgba(226, 232, 240, 0.6),
            inset 0 4px 8px rgba(255, 255, 255, 0.95);
          transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pixar-card-hover:hover {
          transform: translateY(-6px) scale(1.015);
          box-shadow: 
            0 22px 38px -8px rgba(16, 185, 129, 0.22),
            0 10px 20px -5px rgba(0, 0, 0, 0.07),
            inset 0 -5px 10px rgba(209, 250, 229, 0.6),
            inset 0 4px 10px #FFFFFF;
        }
        .pixar-btn {
          border-radius: 20px;
          border-top: 2px solid rgba(255, 255, 255, 0.65);
          box-shadow: 
            0 6px 0 rgba(0, 0, 0, 0.16),
            0 10px 18px -3px rgba(0, 0, 0, 0.14),
            inset 0 3px 5px rgba(255, 255, 255, 0.55);
          transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pixar-btn:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 8px 0 rgba(0, 0, 0, 0.16),
            0 14px 22px -3px rgba(0, 0, 0, 0.18),
            inset 0 3px 6px rgba(255, 255, 255, 0.7);
        }
        .pixar-btn:active {
          transform: translateY(4px);
          box-shadow: 
            0 2px 0 rgba(0, 0, 0, 0.16),
            0 4px 8px -2px rgba(0, 0, 0, 0.12),
            inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .pixar-icon-box {
          border-radius: 22px;
          border: 2px solid rgba(255, 255, 255, 0.75);
          box-shadow: 
            0 8px 16px -4px rgba(0, 0, 0, 0.18),
            inset 0 -4px 6px rgba(0, 0, 0, 0.18),
            inset 0 4px 8px rgba(255, 255, 255, 0.75);
        }
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-9px) rotate(2deg); }
        }
        .animate-float-3d {
          animation: floatSlow 4.5s ease-in-out infinite;
        }
      `}</style>

      {/* CÁC ĐÁM MÂY & ÁNH SÁNG 3D TRANG TRÍ NỀN */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 opacity-70">
        <div className="absolute -top-12 -left-12 w-72 h-72 rounded-full bg-gradient-to-br from-emerald-200/50 to-teal-100/20 blur-2xl" />
        <div className="absolute top-1/3 -right-16 w-80 h-80 rounded-full bg-gradient-to-br from-amber-200/50 to-pink-200/30 blur-2xl" />
        <div className="absolute -bottom-16 left-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-sky-200/40 to-purple-200/30 blur-2xl" />
      </div>

      {/* THANH TIÊU ĐỀ (HEADER 3D PIXAR) */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b-4 border-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.18)] px-4 lg:px-8 py-3 font-pixar">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo Linh Vật Gà Tơ 3D Pixar & Tên ứng dụng */}
          <div
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-3.5 cursor-pointer group"
          >
            <div className="w-14 h-14 pixar-icon-box bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-400 flex items-center justify-center relative group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 64 64" className="w-11 h-11 drop-shadow-md">
                <defs>
                  <radialGradient id="chickBody3D" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#FFFBEB" />
                    <stop offset="45%" stopColor="#FDE047" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </radialGradient>
                  <linearGradient id="beak3D" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FB923C" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </linearGradient>
                </defs>
                <circle cx="28" cy="11" r="4.5" fill="#F43F5E" />
                <circle cx="34" cy="9" r="5.5" fill="#FB7185" />
                <circle cx="39" cy="12" r="4" fill="#E11D48" />
                <circle cx="32" cy="34" r="21" fill="url(#chickBody3D)" />
                <ellipse cx="19" cy="38" rx="4.2" ry="2.6" fill="#FDA4AF" opacity="0.85" />
                <ellipse cx="45" cy="38" rx="4.2" ry="2.6" fill="#FDA4AF" opacity="0.85" />
                <circle cx="24" cy="31" r="4.3" fill="#1E293B" />
                <circle cx="22.6" cy="29.5" r="1.6" fill="#FFFFFF" />
                <circle cx="25.2" cy="32.5" r="0.8" fill="#FFFFFF" />
                <circle cx="40" cy="31" r="4.3" fill="#1E293B" />
                <circle cx="38.6" cy="29.5" r="1.6" fill="#FFFFFF" />
                <circle cx="41.2" cy="32.5" r="0.8" fill="#FFFFFF" />
                <path d="M28 36 Q32 33 36 36 L32 42 Z" fill="url(#beak3D)" />
              </svg>
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-purple-600 text-white border border-white shadow">
                3D
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-2xl font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 bg-clip-text text-transparent tracking-tight">
                  MẦM NON AI STUDIO
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-amber-200 to-yellow-200 text-amber-900 border-2 border-white shadow-sm">
                  ✨ Pixar 3D Edition
                </span>
              </div>
              <p className="text-xs text-slate-600 font-bold">
                🌟 “Một ý tưởng – Vạn học liệu 3D sống động cho bé”
              </p>
            </div>
          </div>

          {/* Dự án đang làm việc & Công cụ nhanh 3D */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-white shadow-inner px-3.5 py-2 rounded-2xl">
              <FolderHeart className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-500">Dự án:</span>
              <select
                value={currentProjectId}
                onChange={(e) => {
                  setCurrentProjectId(e.target.value);
                  showNotification("Đã chuyển sang dự án được chọn!");
                }}
                className="text-xs font-extrabold text-emerald-800 bg-transparent focus:outline-none cursor-pointer max-w-[200px] truncate"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.ageGroup})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setActiveTab("all-in-one")}
              className="pixar-btn flex items-center gap-2 px-4 py-2.5 bg-gradient-to-b from-amber-400 via-orange-400 to-orange-500 text-white font-extrabold text-xs sm:text-sm"
            >
              <Wand2 className="w-4 h-4" />
              <span>Tạo Bộ Học Liệu Toàn Diện</span>
            </button>

            <button
              onClick={() => setShowGuideModal(true)}
              className="pixar-btn p-2.5 bg-gradient-to-b from-sky-400 to-blue-500 text-white"
              title="Hướng dẫn sử dụng"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Thanh điều hướng nút bấm kẹo ngọt 3D Pixar */}
        <nav className="max-w-7xl mx-auto mt-3 pt-2.5 border-t border-emerald-100/80 flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold whitespace-nowrap transition-all ${isActive
                  ? "pixar-btn bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-600 text-white scale-[1.03]"
                  : "bg-white/90 hover:bg-white text-slate-700 border-2 border-white shadow-[0_4px_0_#E2E8F0,0_6px_12px_rgba(0,0,0,0.05)] hover:-translate-y-0.5"
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : item.color}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black shadow-xs ${isActive
                      ? "bg-amber-300 text-slate-900"
                      : "bg-gradient-to-r from-rose-500 to-pink-500 text-white"
                      }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* THÔNG BÁO TOAST 3D */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pixar-card flex items-center gap-3 px-5 py-3.5 bg-white border-4 border-emerald-200 animate-bounce">
          {toast.type === "error" ? (
            <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
          )}
          <span className="text-sm font-extrabold text-slate-800">{toast.message}</span>
        </div>
      )}

      {/* NỘI DUNG CHÍNH */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 relative z-10 font-pixar">
        {activeTab === "home" && (
          <HomeDashboard
            setActiveTab={setActiveTab}
            currentProject={currentProject}
            projects={projects}
            setCurrentProjectId={setCurrentProjectId}
          />
        )}

        {activeTab === "all-in-one" && (
          <AllInOneCreator
            currentProject={currentProject}
            setProjects={setProjects}
            setCurrentProjectId={setCurrentProjectId}
            showNotification={showNotification}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "poem" && (
          <PoemCreator
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
            setPrintPreviewData={setPrintPreviewData}
          />
        )}

        {activeTab === "story" && (
          <StoryCreator
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
            setActiveTab={setActiveTab}
            setPrintPreviewData={setPrintPreviewData}
          />
        )}

        {activeTab === "character-art" && (
          <ConsistentCharacterStudio
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
            setPrintPreviewData={setPrintPreviewData}
          />
        )}

        {activeTab === "song" && (
          <SongCreator
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
          />
        )}

        {activeTab === "tts" && (
          <VoiceCreator
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
          />
        )}

        {activeTab === "video" && (
          <VideoStudio
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
          />
        )}

        {activeTab === "lesson" && (
          <LessonPlanCreator
            currentProject={currentProject}
            updateCurrentProject={updateCurrentProject}
            showNotification={showNotification}
            setPrintPreviewData={setPrintPreviewData}
          />
        )}

        {activeTab === "library" && (
          <PersonalLibrary
            projects={projects}
            setProjects={setProjects}
            currentProjectId={currentProjectId}
            setCurrentProjectId={setCurrentProjectId}
            setActiveTab={setActiveTab}
            showNotification={showNotification}
            setConfirmModal={setConfirmModal}
            setPrintPreviewData={setPrintPreviewData}
          />
        )}
      </main>

      {/* CHÂN TRANG (FOOTER) */}
      <footer className="bg-white/80 backdrop-blur-md border-t-4 border-white py-4 px-4 lg:px-8 mt-12 relative z-10 font-pixar">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 font-bold">
          <div className="flex items-center gap-2">
            <span className="font-black text-emerald-700">MẦM NON AI STUDIO (PIXAR 3D)</span>
            <span>•</span>
            <span>Trợ lý sáng tạo học liệu dành riêng cho Giáo viên Mầm non Việt Nam (3–6 tuổi)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              AI Văn bản, AI Tranh 3D Đồng nhất & Giọng đọc TTS: Đang hoạt động
            </span>
          </div>
        </div>
      </footer>

      {/* MODAL HƯỚNG DẪN SỬ DỤNG */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 font-pixar">
          <div className="pixar-card bg-white max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-slate-800">
                  Hướng Dẫn Sử Dụng Mầm Non AI Studio 3D
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-slate-600 leading-relaxed font-semibold">
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-900">
                <p className="font-black mb-1">💡 Mẹo nhanh nhất cho Cô giáo:</p>
                <p>
                  Bấm vào nút <strong>“Tạo Bộ Học Liệu Toàn Diện”</strong> trên thanh công cụ, nhập ý tưởng (ví dụ: <em>Gà Tơ đi học, 4-5 tuổi, hoạt hình 3D</em>). AI sẽ tự động sinh trọn bộ Truyện, Hồ sơ nhân vật, Tranh minh họa 3D, Bài hát và Giáo án trong cùng 1 dự án!
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-black text-slate-800">Quy trình giữ Nhân vật 3D đồng nhất qua các tranh (Mục C):</h4>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li><strong>Bước 1:</strong> Có sẵn nội dung thơ hoặc truyện chia theo từng cảnh.</li>
                  <li><strong>Bước 2:</strong> Thiết lập <em>Hồ sơ nhân vật chuẩn</em> (màu lông, mắt, mũi, trang phục, phụ kiện cố định).</li>
                  <li><strong>Bước 3:</strong> Bấm <strong>“Tạo Ảnh Mẫu Chuẩn”</strong> (hoặc tải ảnh nhân vật có sẵn từ máy lên) và bấm <strong>Duyệt mẫu</strong>.</li>
                  <li><strong>Bước 4:</strong> Khi tạo tranh cho từng cảnh, hệ thống tự động truyền <strong>Ảnh tham chiếu gốc (Base64 Reference Image)</strong> kết hợp khóa đặc điểm trang phục vào mô hình AI tạo ảnh để nhân vật giữ nguyên diện mạo xuyên suốt câu chuyện.</li>
                </ol>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="pixar-btn px-5 py-2.5 bg-gradient-to-b from-emerald-400 to-teal-600 text-white font-black text-sm"
              >
                Đã hiểu, bắt đầu sáng tạo!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 font-pixar">
          <div className="pixar-card bg-white max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-2">{confirmModal.title}</h3>
            <p className="text-sm font-semibold text-slate-600 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ open: false, title: "", message: "", onConfirm: null })}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal({ open: false, title: "", message: "", onConfirm: null });
                }}
                className="pixar-btn px-4 py-2 bg-gradient-to-b from-rose-500 to-red-600 text-white font-bold text-sm"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM TRƯỚC BẢN IN A4 / TRÌNH CHIẾU */}
      {printPreviewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto font-pixar">
          <div className="pixar-card bg-white max-w-4xl w-full p-6 md:p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  Bản trình bày chuẩn in A4 & Trình chiếu trên lớp
                </span>
                <h2 className="text-2xl font-black text-slate-800">{printPreviewData.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="pixar-btn flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-emerald-400 to-teal-600 text-white font-bold text-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>In ngay / Lưu PDF</span>
                </button>
                <button
                  onClick={() => setPrintPreviewData(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 md:p-8 rounded-2xl bg-[#FFFDF9] border-2 border-dashed border-amber-200 space-y-6">
              {printPreviewData.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// TRANG CHỦ (HOME DASHBOARD - PHONG CÁCH PIXAR 3D)
// ==========================================
function HomeDashboard({ setActiveTab, currentProject, projects, setCurrentProjectId }) {
  const featureCards = [
    {
      id: "poem",
      title: "A. AI Sáng Tác Thơ",
      desc: "Tạo thơ 4 chữ, 5 chữ, thơ đồng dao theo độ tuổi kèm câu hỏi đàm thoại & trò chơi.",
      icon: Feather,
      emoji3D: "🪶",
      gradient: "from-sky-400 via-sky-500 to-blue-600",
      lightBg: "from-sky-50 via-white to-blue-50/70 border-sky-200",
    },
    {
      id: "story",
      title: "B. AI Sáng Tác Truyện",
      desc: "Viết truyện mầm non chia theo cảnh, lời dẫn, lời thoại, kịch bản rối & đóng kịch.",
      icon: BookOpen,
      emoji3D: "📖",
      gradient: "from-rose-400 via-pink-500 to-rose-600",
      lightBg: "from-rose-50 via-white to-pink-50/70 border-rose-200",
    },
    {
      id: "character-art",
      title: "C. Bộ Tranh Đồng Nhất 3D",
      desc: "Quản lý hồ sơ nhân vật, duyệt ảnh mẫu chuẩn Pixar 3D và vẽ bộ tranh giữ nguyên ngoại hình.",
      icon: Palette,
      emoji3D: "🎨",
      gradient: "from-purple-500 via-violet-500 to-indigo-600",
      lightBg: "from-purple-50 via-white to-indigo-50/80 border-purple-300",
      highlight: "Quan trọng nhất",
    },
    {
      id: "song",
      title: "D. AI Sáng Tác Bài Hát",
      desc: "Sáng tác lời bài hát thiếu nhi mới, gợi ý vận động, tạo giai điệu nghe thử & Prompt nhạc AI.",
      icon: Music,
      emoji3D: "🎵",
      gradient: "from-pink-400 via-rose-500 to-amber-500",
      lightBg: "from-pink-50 via-white to-amber-50/70 border-pink-200",
    },
    {
      id: "tts",
      title: "E. Giọng Đọc Kể Chuyện",
      desc: "Chuyển thơ, truyện thành giọng đọc tiếng Việt ấm áp, hỗ trợ đọc phân vai nhân vật hoạt hình.",
      icon: Mic,
      emoji3D: "🎙️",
      gradient: "from-teal-400 via-emerald-500 to-teal-600",
      lightBg: "from-teal-50 via-white to-emerald-50/70 border-teal-200",
    },
    {
      id: "video",
      title: "F. AI Tạo Video Học Liệu",
      desc: "Kết hợp bộ tranh minh họa 3D, giọng kể, phụ đề tiếng Việt và xuất tệp video kể chuyện.",
      icon: Video,
      emoji3D: "🎬",
      gradient: "from-indigo-400 via-blue-500 to-violet-600",
      lightBg: "from-indigo-50 via-white to-blue-50/70 border-indigo-200",
    },
    {
      id: "lesson",
      title: "G. AI Soạn Giáo Án STEAM",
      desc: "Xây dựng giáo án lấy trẻ làm trung tâm (Kiến thức, Kỹ năng, Thái độ, STEAM) chuẩn Bộ GD&ĐT.",
      icon: FileText,
      emoji3D: "📋",
      gradient: "from-amber-400 via-orange-500 to-red-500",
      lightBg: "from-amber-50 via-white to-orange-50/70 border-amber-200",
    },
    {
      id: "library",
      title: "Thư Viện Học Liệu Cá Nhân",
      desc: "Lưu trữ dự án theo chủ đề, độ tuổi, tìm kiếm nhanh, nhân bản và xuất DOCX / Tranh in A4.",
      icon: FolderHeart,
      emoji3D: "🧸",
      gradient: "from-emerald-400 via-teal-500 to-cyan-600",
      lightBg: "from-emerald-50 via-white to-cyan-50/70 border-emerald-200",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Banner Hero 3D Pixar Sống Động */}
      <div className="pixar-card relative overflow-hidden bg-gradient-to-br from-[#DDF7EE] via-[#FFF6D6] to-[#FADCE8] p-6 md:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
          <div className="lg:col-span-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border-2 border-emerald-200 text-emerald-800 text-xs font-extrabold shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Không Gian Học Liệu Hoạt Hình 3D Pixar Dành Cho Cô & Trẻ Mầm Non</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-800 leading-tight">
              Một Ý Tưởng –{" "}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 bg-clip-text text-transparent">
                Vạn Học Liệu 3D Sáng Tạo!
              </span>
            </h2>
            <p className="text-sm sm:text-base text-slate-700 font-semibold leading-relaxed">
              Chào mừng Cô giáo đến với xưởng phim hoạt hình <strong>Mầm Non AI Studio</strong>! Tự động sáng tác thơ, truyện, vẽ bộ tranh <strong>Pixar 3D giữ nguyên nhân vật đồng nhất qua từng cảnh</strong>, tạo bài hát, giọng đọc phân vai và giáo án STEAM chỉ với 1 chạm.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3.5">
              <button
                onClick={() => setActiveTab("all-in-one")}
                className="pixar-btn flex items-center gap-2.5 px-6 py-4 bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-600 text-white font-black text-sm"
              >
                <Wand2 className="w-5 h-5" />
                <span>TẠO BỘ HỌC LIỆU TOÀN DIỆN TỪ 1 YÊU CẦU</span>
              </button>
              <button
                onClick={() => setActiveTab("character-art")}
                className="pixar-btn flex items-center gap-2 px-5 py-4 bg-gradient-to-b from-purple-500 to-indigo-600 text-white font-extrabold text-sm"
              >
                <Palette className="w-5 h-5" />
                <span>Xưởng Vẽ Tranh 3D Đồng Nhất</span>
              </button>
            </div>
          </div>

          {/* Cụm Linh Vật 3D Pixar (Gà Tơ Đi Học) */}
          <div className="lg:col-span-4 flex items-center justify-center">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 animate-float-3d flex items-center justify-center">
              <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-amber-300/60 via-emerald-200/50 to-pink-300/60 blur-xl" />
              <div className="relative pixar-card bg-gradient-to-b from-sky-100 via-amber-50 to-emerald-100 p-4 w-full h-full flex flex-col items-center justify-center text-center border-4 border-white">
                <svg viewBox="0 0 160 150" className="w-40 h-36 drop-shadow-lg">
                  <defs>
                    <radialGradient id="heroChick" cx="35%" cy="28%" r="70%">
                      <stop offset="0%" stopColor="#FEF9C3" />
                      <stop offset="55%" stopColor="#FACC15" />
                      <stop offset="100%" stopColor="#CA8A04" />
                    </radialGradient>
                    <linearGradient id="overalls3D" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60A5FA" />
                      <stop offset="100%" stopColor="#2563EB" />
                    </linearGradient>
                    <linearGradient id="bag3D" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FB7185" />
                      <stop offset="100%" stopColor="#E11D48" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="80" cy="138" rx="44" ry="8" fill="rgba(15,23,42,0.12)" />
                  <rect x="30" y="64" width="22" height="36" rx="9" fill="url(#bag3D)" />
                  <rect x="108" y="64" width="22" height="36" rx="9" fill="url(#bag3D)" />
                  <ellipse cx="80" cy="84" rx="42" ry="44" fill="url(#heroChick)" />
                  <path d="M44 90 Q80 102 116 90 L112 124 Q80 134 48 124 Z" fill="url(#overalls3D)" />
                  <circle cx="62" cy="96" r="3.5" fill="#FDE047" />
                  <circle cx="98" cy="96" r="3.5" fill="#FDE047" />
                  <ellipse cx="34" cy="82" rx="12" ry="18" transform="rotate(-25 34 82)" fill="#FACC15" />
                  <ellipse cx="126" cy="78" rx="12" ry="18" transform="rotate(30 126 78)" fill="#FACC15" />
                  <circle cx="72" cy="36" r="7" fill="#F43F5E" />
                  <circle cx="80" cy="33" r="9" fill="#FB7185" />
                  <circle cx="88" cy="36" r="7" fill="#E11D48" />
                  <circle cx="65" cy="68" r="7.5" fill="#0F172A" />
                  <circle cx="62.5" cy="65.5" r="2.8" fill="#FFFFFF" />
                  <circle cx="67.5" cy="70.5" r="1.4" fill="#FFFFFF" />
                  <circle cx="95" cy="68" r="7.5" fill="#0F172A" />
                  <circle cx="92.5" cy="65.5" r="2.8" fill="#FFFFFF" />
                  <circle cx="97.5" cy="70.5" r="1.4" fill="#FFFFFF" />
                  <ellipse cx="52" cy="77" rx="7" ry="4" fill="#FDA4AF" />
                  <ellipse cx="108" cy="77" rx="7" ry="4" fill="#FDA4AF" />
                  <path d="M73 74 Q80 70 87 74 L80 84 Z" fill="#F97316" />
                  <rect x="64" y="124" width="6" height="12" rx="3" fill="#F97316" />
                  <rect x="90" y="124" width="6" height="12" rx="3" fill="#F97316" />
                </svg>
                <span className="px-3 py-1 rounded-full bg-white text-emerald-800 text-xs font-black shadow-xs border border-emerald-200">
                  🐥 Bạn Gà Tơ 3D Đồng Nhất
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lưới 8 Thẻ Chức Năng Lớn Phong Cách Đồ Chơi 3D Pixar */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow">
              <Layers className="w-4 h-4" />
            </span>
            <span>Khám Phá Xưởng Học Liệu 3D Pixar</span>
          </h3>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
            Chạm vào thẻ 3D bất kỳ để bắt đầu
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                onClick={() => setActiveTab(card.id)}
                className={`group pixar-card pixar-card-hover relative p-5 bg-gradient-to-b ${card.lightBg} cursor-pointer flex flex-col justify-between`}
              >
                {card.highlight && (
                  <span className="absolute -top-3 right-4 px-3 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-purple-600 to-pink-600 text-white border-2 border-white shadow-md">
                    ★ {card.highlight}
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-14 h-14 pixar-icon-box bg-gradient-to-br ${card.gradient} text-white flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform`}
                    >
                      <Icon className="w-7 h-7 drop-shadow" />
                    </div>
                    <span className="text-3xl filter drop-shadow-sm group-hover:scale-125 transition-transform">
                      {card.emoji3D}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-slate-800 mb-1.5 group-hover:text-emerald-700 transition-colors">
                    {card.title}
                  </h4>
                  <p className="text-xs font-semibold text-slate-600 leading-relaxed">{card.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-200/80 flex items-center justify-between text-xs font-extrabold text-emerald-700">
                  <span>Mở xưởng sáng tạo</span>
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tóm tắt Dự Án Đang Làm Việc 3D */}
      <div className="pixar-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">
              🎈 Dự án 3D đang mở trên bàn làm việc
            </span>
            <h3 className="text-xl font-black text-slate-800">{currentProject.title}</h3>
            <p className="text-xs font-semibold text-slate-500">
              Chủ đề: <strong>{currentProject.topic}</strong> • Độ tuổi: <strong>{currentProject.ageGroup}</strong> • Phong cách: <strong>{currentProject.style}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("library")}
              className="pixar-btn px-4 py-2.5 bg-gradient-to-b from-emerald-400 to-teal-500 text-white font-extrabold text-xs"
            >
              Quản lý tất cả dự án ({projects.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. TẠO BỘ HỌC LIỆU TOÀN DIỆN TỪ 1 YÊU CẦU
// ==========================================
function AllInOneCreator({
  currentProject,
  setProjects,
  setCurrentProjectId,
  showNotification,
  setActiveTab,
}) {
  const [promptInput, setPromptInput] = useState(
    "Chủ đề: Gà Tơ đi học. Độ tuổi: 4–5 tuổi. Phong cách: Hoạt hình 3D dễ thương. Yêu cầu: nhân vật đồng nhất mặc yếm bò xanh đeo ba lô đỏ."
  );
  const [ageGroup, setAgeGroup] = useState("4–5 tuổi");
  const [artStyle, setArtStyle] = useState("Hoạt hình 3D dễ thương");
  const [selectedModules, setSelectedModules] = useState({
    poem: true,
    story: true,
    characterProfile: true,
    characterRefImage: true,
    song: true,
    lessonPlan: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState("");

  const sampleIdeas = [
    "Chủ đề: Gà Tơ đi học. Độ tuổi: 4–5 tuổi. Phong cách: Hoạt hình 3D dễ thương. Yêu cầu: nhân vật đồng nhất.",
    "Chủ đề: Thỏ Trắng biết vâng lời mẹ và rửa tay sạch sẽ. Độ tuổi: 3–4 tuổi. Phong cách: Hoạt hình 3D Pixar.",
    "Chủ đề: Bé Gấu Nâu học luật giao thông qua ngã tư đường phố. Độ tuổi: 5–6 tuổi. Phong cách: Hoạt hình 3D dễ thương.",
  ];

  const toggleModule = (key) => {
    setSelectedModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerateAll = async () => {
    if (!promptInput.trim()) {
      showNotification("Vui lòng nhập yêu cầu chủ đề học liệu!", "error");
      return;
    }
    setIsGenerating(true);
    setProgressStep("Đang dùng AI sáng tác Thơ, Truyện chia cảnh, Hồ sơ nhân vật, Bài hát & Giáo án...");

    try {
      const schema = {
        type: "OBJECT",
        properties: {
          projectTitle: { type: "STRING" },
          topic: { type: "STRING" },
          poem: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              genre: { type: "STRING" },
              stanzas: { type: "ARRAY", items: { type: "STRING" } },
              questions: { type: "ARRAY", items: { type: "STRING" } },
              activities: { type: "ARRAY", items: { type: "STRING" } },
            },
          },
          character: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              species: { type: "STRING" },
              faceDetails: { type: "STRING" },
              bodyDetails: { type: "STRING" },
              outfit: { type: "STRING" },
              personality: { type: "STRING" },
              age: { type: "STRING" },
              colorPalette: { type: "STRING" },
              englishVisualTag: {
                type: "STRING",
                description:
                  "Detailed English visual description of the character (species, fur/skin color, exact clothes and accessories) to keep 100% consistency across prompts",
              },
            },
          },
          story: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              moralLesson: { type: "STRING" },
              puppetScript: { type: "STRING" },
              questions: { type: "ARRAY", items: { type: "STRING" } },
              scenes: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    sceneNumber: { type: "INTEGER" },
                    title: { type: "STRING" },
                    setting: { type: "STRING" },
                    narration: { type: "STRING" },
                    dialogue: { type: "STRING" },
                    imagePrompt: { type: "STRING" },
                  },
                },
              },
            },
          },
          song: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              style: { type: "STRING" },
              tempo: { type: "INTEGER" },
              instruments: { type: "STRING" },
              intro: { type: "STRING" },
              verse1: { type: "STRING" },
              chorus: { type: "STRING" },
              ending: { type: "STRING" },
              movements: { type: "ARRAY", items: { type: "STRING" } },
              sunoPrompt: { type: "STRING" },
            },
          },
          lessonPlan: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              knowledge: { type: "STRING" },
              skills: { type: "STRING" },
              attitude: { type: "STRING" },
              teacherPrep: { type: "STRING" },
              childrenPrep: { type: "STRING" },
              steamExtension: { type: "STRING" },
              procedure: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    step: { type: "STRING" },
                    content: { type: "STRING" },
                  },
                },
              },
            },
          },
        },
        required: ["projectTitle", "topic", "poem", "character", "story", "song", "lessonPlan"],
      };

      const systemInstruction = `Bạn là chuyên gia giáo dục mầm non Việt Nam. Hãy sáng tạo bộ học liệu đồng bộ, ngôn ngữ trong sáng, giàu nhịp điệu, tích cực, phù hợp tâm lý trẻ ${ageGroup}. Phong cách minh họa: ${artStyle}.`;

      const aiData = await generateAIText(
        `Yêu cầu của giáo viên: "${promptInput}". Hãy tạo trọn bộ học liệu đồng bộ theo cấu trúc JSON. Lưu ý truyện chia thành 3 cảnh rõ ràng (mở đầu, diễn biến, kết thúc), mỗi cảnh có imagePrompt bằng tiếng Anh mô tả đầy đủ ngoại hình và trang phục nhân vật chính giống hệt nhau để giữ tính đồng nhất.`,
        systemInstruction,
        schema
      );

      let refImgUrl = "";
      if (selectedModules.characterRefImage && aiData.character) {
        setProgressStep(`Đang vẽ Ảnh Mẫu Chuẩn 3D cho nhân vật "${aiData.character.name}"...`);
        try {
          const charPrompt = `Cute 3D Pixar style character reference portrait, ${artStyle}, ${aiData.character.englishVisualTag || aiData.character.species}, ${aiData.character.faceDetails}, wearing ${aiData.character.outfit}, clean soft pastel background, high quality children book illustration`;
          refImgUrl = await generateAIImage(charPrompt, "1:1");
        } catch (imgErr) {
          console.warn("Bỏ qua lỗi tạo ảnh mẫu tự động:", imgErr);
        }
      }

      const newProjId = "proj-" + Date.now();
      const newProject = {
        id: newProjId,
        title: aiData.projectTitle || "Dự án Học liệu Mới",
        topic: aiData.topic || "Tổng hợp",
        ageGroup,
        schoolYear: "2026–2027",
        style: artStyle,
        createdAt: new Date().toLocaleDateString("vi-VN"),
        poem: selectedModules.poem
          ? {
            title: aiData.poem.title,
            ageGroup,
            genre: aiData.poem.genre || "Thơ 4 chữ",
            stanzas: aiData.poem.stanzas || [],
            questions: aiData.poem.questions || [],
            activities: aiData.poem.activities || [],
            illustrationUrl: "",
          }
          : null,
        characters: selectedModules.characterProfile
          ? [
            {
              id: "char-" + Date.now(),
              name: aiData.character.name,
              species: aiData.character.species,
              faceDetails: aiData.character.faceDetails,
              bodyDetails: aiData.character.bodyDetails,
              outfit: aiData.character.outfit,
              personality: aiData.character.personality,
              age: aiData.character.age || ageGroup,
              style: artStyle,
              colorPalette: aiData.character.colorPalette,
              englishVisualTag: aiData.character.englishVisualTag,
              referenceImageUrl: refImgUrl,
              approved: true,
            },
          ]
          : [],
        story: selectedModules.story
          ? {
            title: aiData.story.title,
            ageGroup,
            moralLesson: aiData.story.moralLesson,
            puppetScript: aiData.story.puppetScript,
            questions: aiData.story.questions || [],
            scenes: (aiData.story.scenes || []).map((sc, idx) => ({
              sceneNumber: idx + 1,
              title: sc.title,
              setting: sc.setting,
              narration: sc.narration,
              dialogue: sc.dialogue,
              imagePrompt: sc.imagePrompt,
              imageUrl: "",
              duration: 6,
            })),
          }
          : null,
        song: selectedModules.song
          ? {
            title: aiData.song.title,
            ageGroup,
            style: aiData.song.style || "Vui tươi",
            tempo: aiData.song.tempo || 115,
            instruments: aiData.song.instruments || "Piano, Chuông gió",
            structure: {
              intro: aiData.song.intro,
              verse1: aiData.song.verse1,
              chorus: aiData.song.chorus,
              ending: aiData.song.ending,
            },
            movements: aiData.song.movements || [],
            sunoPrompt: aiData.song.sunoPrompt,
            audioUrl: "",
          }
          : null,
        lessonPlan: selectedModules.lessonPlan
          ? {
            title: aiData.lessonPlan.title,
            ageGroup,
            objectives: {
              knowledge: aiData.lessonPlan.knowledge,
              skills: aiData.lessonPlan.skills,
              attitude: aiData.lessonPlan.attitude,
            },
            preparation: {
              teacher: aiData.lessonPlan.teacherPrep,
              children: aiData.lessonPlan.childrenPrep,
            },
            procedure: aiData.lessonPlan.procedure || [],
            steamExtension: aiData.lessonPlan.steamExtension,
          }
          : null,
      };

      setProjects((prev) => [newProject, ...prev]);
      setCurrentProjectId(newProjId);
      showNotification("Đã khởi tạo thành công trọn bộ học liệu mới!");
      setActiveTab("character-art");
    } catch (error) {
      showNotification("Có lỗi khi tạo bộ học liệu: " + error.message, "error");
    } finally {
      setIsGenerating(false);
      setProgressStep("");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pixar-card bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 pixar-icon-box bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center">
            <Wand2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
              Tính năng thông minh đột phá
            </span>
            <h2 className="text-xl md:text-2xl font-black text-slate-800">
              TẠO BỘ HỌC LIỆU TOÀN DIỆN TỪ MỘT YÊU CẦU
            </h2>
          </div>
        </div>
        <p className="text-sm text-slate-600 font-semibold mb-6">
          Chỉ cần nhập một ý tưởng ngắn gọn, AI sẽ tự động xây dựng dự án đồng bộ gồm: <strong>Bài thơ, Câu chuyện nhiều cảnh, Hồ sơ nhân vật chuẩn, Ảnh mẫu nhân vật 3D, Bài hát mới và Giáo án STEAM</strong>.
        </p>

        {/* Chọn nhanh ví dụ mẫu */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-600 mb-2">
            ✨ Chọn nhanh ý tưởng mẫu (chạm để điền tự động):
          </label>
          <div className="flex flex-wrap gap-2">
            {sampleIdeas.map((idea, i) => (
              <button
                key={i}
                onClick={() => setPromptInput(idea)}
                className="text-left text-xs font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100/70 text-slate-700 border border-amber-200 transition-colors"
              >
                {idea.slice(0, 65)}...
              </button>
            ))}
          </div>
        </div>

        {/* Ô nhập yêu cầu */}
        <div className="space-y-4 bg-white p-5 rounded-2xl border-2 border-amber-200/80">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Nội dung yêu cầu của Cô giáo:
            </label>
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ví dụ: Chủ đề: Gà Tơ đi học. Độ tuổi: 5–6 tuổi. Phong cách: hoạt hình 3D dễ thương..."
              className="w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Độ tuổi của trẻ:</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold bg-white"
              >
                <option value="3–4 tuổi">Nhà trẻ / Mẫu giáo bé (3–4 tuổi)</option>
                <option value="4–5 tuổi">Mẫu giáo nhỡ (4–5 tuổi)</option>
                <option value="5–6 tuổi">Mẫu giáo lớn (5–6 tuổi)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Phong cách bộ tranh minh họa:
              </label>
              <select
                value={artStyle}
                onChange={(e) => setArtStyle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold bg-white"
              >
                <option value="Hoạt hình 3D dễ thương">Hoạt hình 3D dễ thương (Pixar style)</option>
                <option value="Tranh truyện 2D">Tranh truyện 2D màu sắc tươi sáng</option>
                <option value="Tranh màu nước Pastel">Tranh màu nước Pastel dịu nhẹ</option>
                <option value="Cắt dán giấy nghệ thuật">Cắt dán giấy (Paper Cutout)</option>
              </select>
            </div>
          </div>

          {/* Tùy chọn những loại học liệu muốn tạo */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              Chọn các học liệu muốn tạo trong bộ dự án này:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { key: "poem", label: "Bài thơ & Câu hỏi" },
                { key: "story", label: "Truyện kể & Kịch bản cảnh" },
                { key: "characterProfile", label: "Hồ sơ nhân vật đồng nhất" },
                { key: "characterRefImage", label: "Ảnh mẫu nhân vật (AI Image)" },
                { key: "song", label: "Bài hát mới cùng chủ đề" },
                { key: "lessonPlan", label: "Giáo án gợi ý chuẩn STEAM" },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${selectedModules[item.key]
                    ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                    : "bg-slate-50 border-slate-200 text-slate-500"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModules[item.key]}
                    onChange={() => toggleModule(item.key)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerateAll}
            disabled={isGenerating}
            className="pixar-btn w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 text-white font-black text-base flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{progressStep}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>KHỞI TẠO BỘ HỌC LIỆU TOÀN DIỆN NGAY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// A. AI SÁNG TÁC THƠ MẦM NON
// ==========================================
function PoemCreator({
  currentProject,
  updateCurrentProject,
  showNotification,
  setPrintPreviewData,
}) {
  const poem = currentProject.poem || {
    title: "Chưa có bài thơ",
    ageGroup: currentProject.ageGroup || "4–5 tuổi",
    genre: "Thơ 4 chữ",
    stanzas: [],
    questions: [],
    activities: [],
    illustrationUrl: "",
  };

  const [topic, setTopic] = useState(currentProject.topic || "Trường mầm non & Động vật");
  const [ageGroup, setAgeGroup] = useState(poem.ageGroup || "4–5 tuổi");
  const [genre, setGenre] = useState(poem.genre || "Thơ 4 chữ");
  const [stanzaCount, setStanzaCount] = useState(3);
  const [eduGoal, setEduGoal] = useState("Giáo dục trẻ ngoan ngoãn, lễ phép chào hỏi cô giáo và yêu bạn bè");
  const [keywords, setKeywords] = useState("Gà Tơ, đến lớp, chào cô");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);

  const handleGeneratePoem = async (mode = "new") => {
    setIsLoading(true);
    try {
      const schema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          stanzas: { type: "ARRAY", items: { type: "STRING" } },
          questions: { type: "ARRAY", items: { type: "STRING" } },
          activities: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "stanzas", "questions", "activities"],
      };

      let prompt = `Hãy sáng tác một bài thơ mầm non cho trẻ ${ageGroup}, thể loại "${genre}", gồm ${stanzaCount} khổ thơ. Chủ đề: "${topic}". Mục tiêu giáo dục: "${eduGoal}". Từ khóa khuyến khích: "${keywords}". Ngôn ngữ trong sáng, giàu vần điệu, dễ thuộc dễ nhớ. Kèm theo 4 câu hỏi đàm thoại và 3 hoạt động trò chơi/vận động minh họa.`;
      if (mode === "shorten" && poem.stanzas.length > 0) {
        prompt = `Hãy rút gọn bài thơ "${poem.title}" sau đây cho ngắn gọn, súc tích hơn nữa cho trẻ ${ageGroup} dễ thuộc:\n${poem.stanzas.join("\n\n")}`;
      } else if (mode === "expand" && poem.stanzas.length > 0) {
        prompt = `Hãy mở rộng thêm 1-2 khổ thơ nữa cho bài thơ "${poem.title}" sau đây, giữ nguyên nhịp điệu vui tươi:\n${poem.stanzas.join("\n\n")}`;
      }

      const res = await generateAIText(
        prompt,
        "Bạn là nhà thơ thiếu nhi và chuyên gia giáo dục mầm non Việt Nam.",
        schema
      );

      updateCurrentProject((proj) => ({
        ...proj,
        poem: {
          ...proj.poem,
          title: res.title,
          ageGroup,
          genre,
          stanzas: res.stanzas || [],
          questions: res.questions || [],
          activities: res.activities || [],
        },
      }));
      showNotification("Đã sáng tác bài thơ thành công!");
    } catch (err) {
      showNotification("Lỗi khi sáng tác thơ: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePoemIllustration = async () => {
    setIsGeneratingImg(true);
    try {
      const mainChar = currentProject.characters?.[0];
      const charDesc = mainChar
        ? `${mainChar.species} named ${mainChar.name}, ${mainChar.faceDetails}, wearing ${mainChar.outfit}`
        : "cute preschool animals";
      const prompt = `Cute 3D Pixar children book illustration for preschool poem "${poem.title}", topic: ${topic}, featuring ${charDesc}, bright cheerful pastel colors, clean composition`;
      const imgUrl = await generateAIImage(prompt, "16:9", mainChar?.referenceImageUrl || null);
      updateCurrentProject((proj) => ({
        ...proj,
        poem: { ...proj.poem, illustrationUrl: imgUrl },
      }));
      showNotification("Đã vẽ tranh minh họa 3D cho bài thơ!");
    } catch (err) {
      showNotification("Lỗi tạo tranh thơ: " + err.message, "error");
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const openPrintPreview = () => {
    setPrintPreviewData({
      title: `Bài thơ: ${poem.title} (${poem.ageGroup})`,
      content: (
        <div className="text-center space-y-6">
          {poem.illustrationUrl && (
            <img
              src={poem.illustrationUrl}
              alt={poem.title}
              className="w-full max-w-xl mx-auto rounded-2xl shadow-md"
            />
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {poem.stanzas.map((st, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
                <p className="text-lg font-bold text-slate-800 whitespace-pre-line leading-relaxed">
                  {st}
                </p>
              </div>
            ))}
          </div>
        </div>
      ),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 pixar-card p-6 space-y-4 h-fit">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2.5 rounded-2xl bg-sky-100 text-sky-600">
            <Feather className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">A. AI Sáng Tác Thơ</h2>
            <p className="text-xs font-semibold text-slate-500">Thơ giàu nhịp điệu cho bé 3–6 tuổi</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề bài thơ:</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Độ tuổi:</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value="3–4 tuổi">3–4 tuổi</option>
              <option value="4–5 tuổi">4–5 tuổi</option>
              <option value="5–6 tuổi">5–6 tuổi</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Thể loại:</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value="Thơ 4 chữ">Thơ 4 chữ</option>
              <option value="Thơ 5 chữ">Thơ 5 chữ</option>
              <option value="Thơ đồng dao vần điệu">Đồng dao</option>
              <option value="Thơ kể chuyện">Thơ kể chuyện</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Số khổ thơ: {stanzaCount} khổ</label>
          <input
            type="range"
            min={2}
            max={5}
            value={stanzaCount}
            onChange={(e) => setStanzaCount(Number(e.target.value))}
            className="w-full accent-sky-600"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Mục đích giáo dục:</label>
          <textarea
            rows={2}
            value={eduGoal}
            onChange={(e) => setEduGoal(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Từ khóa bắt buộc:</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
          />
        </div>

        <button
          onClick={() => handleGeneratePoem("new")}
          disabled={isLoading}
          className="pixar-btn w-full py-3.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{isLoading ? "Đang Sáng Tác Thơ..." : "Sáng Tác Bài Thơ Mới"}</span>
        </button>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => handleGeneratePoem("shorten")}
            disabled={isLoading}
            className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
          >
            Rút gọn thơ
          </button>
          <button
            onClick={() => handleGeneratePoem("expand")}
            disabled={isLoading}
            className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
          >
            Mở rộng thêm khổ
          </button>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        <div className="pixar-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
                {poem.genre} • {poem.ageGroup}
              </span>
              <input
                type="text"
                value={poem.title}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    poem: { ...p.poem, title: e.target.value },
                  }))
                }
                className="block mt-1 text-2xl font-black text-slate-800 focus:outline-none border-b border-transparent focus:border-sky-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGeneratePoemIllustration}
                disabled={isGeneratingImg}
                className="pixar-btn flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 text-white font-bold text-xs"
              >
                {isGeneratingImg ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                <span>{isGeneratingImg ? "Đang vẽ..." : "Vẽ Tranh Thơ 3D"}</span>
              </button>
              <button
                onClick={openPrintPreview}
                className="pixar-btn flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white font-bold text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Bản In / Trình Chiếu</span>
              </button>
            </div>
          </div>

          {poem.illustrationUrl && (
            <div className="relative rounded-2xl overflow-hidden border-2 border-sky-100">
              <img
                src={poem.illustrationUrl}
                alt={poem.title}
                className="w-full max-h-72 object-cover"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {poem.stanzas.map((stanza, index) => (
              <div
                key={index}
                className="p-4 rounded-2xl bg-gradient-to-b from-sky-50/70 to-amber-50/40 border border-sky-200/80"
              >
                <div className="text-[11px] font-bold text-sky-600 uppercase mb-1.5">
                  Khổ {index + 1}
                </div>
                <textarea
                  rows={4}
                  value={stanza}
                  onChange={(e) => {
                    const updated = [...poem.stanzas];
                    updated[index] = e.target.value;
                    updateCurrentProject((p) => ({
                      ...p,
                      poem: { ...p.poem, stanzas: updated },
                    }));
                  }}
                  className="w-full bg-transparent font-bold text-slate-800 text-sm leading-relaxed focus:outline-none resize-none"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
              <h4 className="text-sm font-black text-amber-900 mb-2">
                💬 Câu hỏi đàm thoại cùng trẻ
              </h4>
              <ul className="list-decimal list-inside space-y-1.5 text-xs font-semibold text-slate-700">
                {poem.questions?.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
              <h4 className="text-sm font-black text-emerald-900 mb-2">
                🎲 Gợi ý hoạt động & Trò chơi
              </h4>
              <ul className="list-disc list-inside space-y-1.5 text-xs font-semibold text-slate-700">
                {poem.activities?.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// B. AI SÁNG TÁC TRUYỆN & KỊCH BẢN RỐI / ĐÓNG KỊCH
// ==========================================
function StoryCreator({
  currentProject,
  updateCurrentProject,
  showNotification,
  setActiveTab,
}) {
  const story = currentProject.story || {
    title: "Chưa có truyện",
    ageGroup: "4–5 tuổi",
    moralLesson: "",
    puppetScript: "",
    questions: [],
    scenes: [],
  };

  const [topic, setTopic] = useState(currentProject.topic || "Gà Tơ đi học");
  const [ageGroup, setAgeGroup] = useState(story.ageGroup || "4–5 tuổi");
  const [sceneCount, setSceneCount] = useState(story.scenes?.length || 3);
  const [setting, setSetting] = useState("Trường mầm non Nắng Mai và khu rừng mùa thu");
  const [moral, setMoral] = useState("Đi học vui vẻ, biết lễ phép chào cô và đoàn kết với bạn");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateStory = async () => {
    setIsLoading(true);
    try {
      const schema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          moralLesson: { type: "STRING" },
          puppetScript: { type: "STRING" },
          questions: { type: "ARRAY", items: { type: "STRING" } },
          scenes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                sceneNumber: { type: "INTEGER" },
                title: { type: "STRING" },
                setting: { type: "STRING" },
                narration: { type: "STRING" },
                dialogue: { type: "STRING" },
                imagePrompt: { type: "STRING" },
              },
            },
          },
        },
        required: ["title", "moralLesson", "puppetScript", "questions", "scenes"],
      };

      const mainChar = currentProject.characters?.[0];
      const charInfo = mainChar
        ? `Nhân vật chính là ${mainChar.name} (${mainChar.species}, ${mainChar.faceDetails}, mặc ${mainChar.outfit}).`
        : "";

      const prompt = `Hãy sáng tác một câu chuyện mầm non cho trẻ ${ageGroup} chia thành ${sceneCount} cảnh rõ ràng (Mở đầu, Diễn biến, Kết thúc). Chủ đề: "${topic}". Bối cảnh: "${setting}". Thông điệp giáo dục: "${moral}". ${charInfo} Yêu cầu có lời dẫn chuyện, lời thoại nhân vật dễ thương, kịch bản kể chuyện bằng rối tay hoặc đóng kịch tương tác (Mục 7), và 4 câu hỏi đàm thoại.`;

      const res = await generateAIText(
        prompt,
        "Bạn là nhà văn thiếu nhi và chuyên gia giáo dục mầm non Việt Nam.",
        schema
      );

      updateCurrentProject((proj) => ({
        ...proj,
        story: {
          title: res.title,
          ageGroup,
          moralLesson: res.moralLesson,
          puppetScript: res.puppetScript,
          questions: res.questions || [],
          scenes: (res.scenes || []).map((sc, i) => ({
            sceneNumber: i + 1,
            title: sc.title,
            setting: sc.setting,
            narration: sc.narration,
            dialogue: sc.dialogue,
            imagePrompt: sc.imagePrompt,
            imageUrl: "",
            duration: 6,
          })),
        },
      }));
      showNotification("Đã sáng tác truyện và kịch bản phân cảnh thành công!");
    } catch (err) {
      showNotification("Lỗi sáng tác truyện: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 pixar-card p-6 space-y-4 h-fit">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">B. AI Sáng Tác Truyện</h2>
            <p className="text-xs font-semibold text-slate-500">Chia cảnh, lời thoại & kịch bản rối</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề câu chuyện:</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Độ tuổi:</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value="3–4 tuổi">3–4 tuổi</option>
              <option value="4–5 tuổi">4–5 tuổi</option>
              <option value="5–6 tuổi">5–6 tuổi</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Số cảnh truyện:</label>
            <select
              value={sceneCount}
              onChange={(e) => setSceneCount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value={3}>3 cảnh (Ngắn)</option>
              <option value={4}>4 cảnh (Vừa)</option>
              <option value={5}>5 cảnh (Chi tiết)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Bối cảnh câu chuyện:</label>
          <input
            type="text"
            value={setting}
            onChange={(e) => setSetting(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Thông điệp giáo dục:</label>
          <textarea
            rows={2}
            value={moral}
            onChange={(e) => setMoral(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
          />
        </div>

        <button
          onClick={handleGenerateStory}
          disabled={isLoading}
          className="pixar-btn w-full py-3.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{isLoading ? "Đang Viết Truyện..." : "Sáng Tác Truyện & Kịch Bản"}</span>
        </button>

        <button
          onClick={() => setActiveTab("character-art")}
          className="pixar-btn w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5"
        >
          <Palette className="w-4 h-4" />
          <span>Chuyển sang Vẽ Bộ Tranh Đồng Nhất 3D</span>
        </button>
      </div>

      <div className="lg:col-span-8 space-y-5">
        <div className="pixar-card p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
              Truyện mầm non {story.ageGroup} • {story.scenes?.length || 0} phân cảnh
            </span>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{story.title}</h3>
          </div>

          <div className="space-y-4">
            {story.scenes?.map((sc, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200/80 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-rose-700 uppercase">
                    Cảnh {sc.sceneNumber}: {sc.title}
                  </span>
                  <span className="text-[11px] text-slate-500 italic">Bối cảnh: {sc.setting}</span>
                </div>
                <textarea
                  rows={2}
                  value={sc.narration}
                  onChange={(e) => {
                    const updated = [...story.scenes];
                    updated[idx] = { ...updated[idx], narration: e.target.value };
                    updateCurrentProject((p) => ({
                      ...p,
                      story: { ...p.story, scenes: updated },
                    }));
                  }}
                  className="w-full p-2 rounded-xl bg-white border border-rose-100 text-xs text-slate-700 font-semibold leading-relaxed"
                />
                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs font-bold text-amber-900">
                  🗣️ Lời thoại: {sc.dialogue}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-1.5">
            <h4 className="text-sm font-black text-purple-900">
              🎭 7. Kịch bản kể chuyện bằng rối tay / Đóng kịch tương tác
            </h4>
            <p className="text-xs font-semibold text-slate-700 leading-relaxed">{story.puppetScript}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <h4 className="text-sm font-black text-emerald-900 mb-1">🌱 Bài học giáo dục</h4>
              <p className="text-xs font-semibold text-slate-700 leading-relaxed">{story.moralLesson}</p>
            </div>
            <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
              <h4 className="text-sm font-black text-sky-900 mb-1">❓ Câu hỏi đàm thoại</h4>
              <ul className="list-decimal list-inside space-y-1 text-xs font-semibold text-slate-700">
                {story.questions?.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// C. HỆ THỐNG TẠO BỘ TRANH ĐỒNG NHẤT NHÂN VẬT 3D (CHỨC NĂNG QUAN TRỌNG NHẤT)
// ==========================================
function ConsistentCharacterStudio({
  currentProject,
  updateCurrentProject,
  showNotification,
}) {
  const characters = currentProject.characters || [];
  const mainChar = characters[0] || {
    id: "char-default",
    name: "Gà Tơ",
    species: "Gà con lông vàng mượt",
    faceDetails: "Mắt tròn đen láy long lanh, mỏ nhỏ màu cam, má hồng",
    bodyDetails: "Thân hình tròn trịa nhỏ nhắn, lông vàng kem mềm mại",
    outfit: "Mặc áo yếm vải jean màu xanh da trời pastel, đeo ba lô nhỏ màu đỏ",
    personality: "Ngoan ngoãn, lễ phép, đáng yêu",
    age: "4 tuổi",
    style: currentProject.style || "Hoạt hình 3D dễ thương",
    colorPalette: "Vàng kem, Xanh da trời pastel, Đỏ hồng",
    referenceImageUrl: "",
    approved: true,
  };

  const scenes = currentProject.story?.scenes || [];
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [bgType, setBgType] = useState("Bối cảnh đầy đủ theo câu chuyện");
  const [isGeneratingRef, setIsGeneratingRef] = useState(false);
  const [generatingSceneIndex, setGeneratingSceneIndex] = useState(null);
  const [isGeneratingAllScenes, setIsGeneratingAllScenes] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpdateCharacterField = (field, value) => {
    updateCurrentProject((proj) => {
      const existing = proj.characters?.[0] || mainChar;
      const updatedChar = { ...existing, [field]: value };
      return { ...proj, characters: [updatedChar] };
    });
  };

  // Bước 3: Tạo Ảnh Mẫu Chuẩn cho nhân vật
  const handleGenerateReferenceImage = async () => {
    setIsGeneratingRef(true);
    try {
      const prompt = `Character design reference sheet portrait, ${mainChar.style}, cute Pixar 3D character ${mainChar.species} named ${mainChar.name}, face details: ${mainChar.faceDetails}, body: ${mainChar.bodyDetails}, wearing exact outfit: ${mainChar.outfit}, color palette: ${mainChar.colorPalette}, clean studio background, ultra sharp 3D render`;
      const imgUrl = await generateAIImage(prompt, "1:1");
      handleUpdateCharacterField("referenceImageUrl", imgUrl);
      handleUpdateCharacterField("approved", true);
      showNotification(`Đã tạo Ảnh Mẫu Chuẩn 3D cho nhân vật ${mainChar.name}!`);
    } catch (err) {
      showNotification("Lỗi tạo ảnh mẫu nhân vật: " + err.message, "error");
    } finally {
      setIsGeneratingRef(false);
    }
  };

  // Cho phép tải ảnh tham chiếu từ máy lên
  const handleUploadReferenceImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleUpdateCharacterField("referenceImageUrl", reader.result);
      handleUpdateCharacterField("approved", true);
      showNotification("Đã tải ảnh mẫu tham chiếu nhân vật lên thành công!");
    };
    reader.readAsDataURL(file);
  };

  // Bước 4 & 6: Tạo hoặc Tạo lại từng tranh cảnh truyện (Truyền ảnh gốc tham chiếu + Khóa DNA nhân vật)
  const handleGenerateSingleSceneImage = async (sceneIdx) => {
    const sc = scenes[sceneIdx];
    if (!sc) return;
    setGeneratingSceneIndex(sceneIdx);
    try {
      const bgInstruction =
        bgType === "Nền trắng tách biệt (để cắt dán)"
          ? "isolated on pure white background"
          : `in setting: ${sc.setting}`;

      const fullConsistentPrompt = `${mainChar.style}, Cute 3D Pixar illustration. MUST KEEP EXACT SAME CHARACTER APPEARANCE AS REFERENCE IMAGE: ${mainChar.species} named ${mainChar.name}, ${mainChar.faceDetails}, ${mainChar.bodyDetails}, ALWAYS wearing ${mainChar.outfit}. Scene ${sc.sceneNumber} action: ${sc.narration} (${sc.imagePrompt || ""}), ${bgInstruction}, color palette: ${mainChar.colorPalette}, consistent lighting and proportions.`;

      const imgUrl = await generateAIImage(
        fullConsistentPrompt,
        aspectRatio,
        mainChar.referenceImageUrl || null
      );

      updateCurrentProject((proj) => {
        const updatedScenes = [...(proj.story?.scenes || [])];
        updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], imageUrl: imgUrl };
        return {
          ...proj,
          story: { ...proj.story, scenes: updatedScenes },
        };
      });
      showNotification(`Đã vẽ xong Cảnh ${sc.sceneNumber} giữ nguyên nhân vật ${mainChar.name}!`);
    } catch (err) {
      showNotification(`Lỗi vẽ Cảnh ${sc.sceneNumber}: ` + err.message, "error");
    } finally {
      setGeneratingSceneIndex(null);
    }
  };

  // Vẽ đồng loạt toàn bộ các cảnh
  const handleGenerateAllStoryScenes = async () => {
    if (scenes.length === 0) return;
    setIsGeneratingAllScenes(true);
    for (let i = 0; i < scenes.length; i++) {
      await handleGenerateSingleSceneImage(i);
    }
    setIsGeneratingAllScenes(false);
    showNotification("Đã hoàn thiện trọn bộ tranh minh họa đồng nhất nhân vật!");
  };

  return (
    <div className="space-y-6">
      {/* BƯỚC 2 & BƯỚC 3: HỒ SƠ NHÂN VẬT CHUẨN & ẢNH MẪU THAM CHIẾU */}
      <div className="pixar-card p-6 bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 pixar-icon-box bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-purple-700">
                Chức năng cốt lõi • Giữ nguyên diện mạo & trang phục xuyên suốt
              </span>
              <h2 className="text-xl font-black text-slate-800">
                C. HỒ SƠ NHÂN VẬT CHUẨN & ẢNH MẪU THAM CHIẾU 3D (BƯỚC 2 & 3)
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold bg-white"
            >
              <option value="16:9">Khung ngang 16:9 (Trình chiếu TV)</option>
              <option value="1:1">Khung vuông 1:1 (Thẻ tranh)</option>
              <option value="3:4">Khung dọc 3:4 (In sách truyện A4)</option>
            </select>
            <select
              value={bgType}
              onChange={(e) => setBgType(e.target.value)}
              className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold bg-white"
            >
              <option value="Bối cảnh đầy đủ theo câu chuyện">Bối cảnh đầy đủ</option>
              <option value="Nền trắng tách biệt (để cắt dán)">Nền trắng (In cắt rời)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Cột thông số DNA ngoại hình nhân vật */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-bold text-slate-600">1. Tên nhân vật:</label>
              <input
                type="text"
                value={mainChar.name}
                onChange={(e) => handleUpdateCharacterField("name", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">2. Loài / Đặc điểm nhận dạng:</label>
              <input
                type="text"
                value={mainChar.species}
                onChange={(e) => handleUpdateCharacterField("species", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">3. Khuôn mặt, mắt, mũi, miệng:</label>
              <input
                type="text"
                value={mainChar.faceDetails}
                onChange={(e) => handleUpdateCharacterField("faceDetails", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">4. Màu sắc & Hình dáng cơ thể:</label>
              <input
                type="text"
                value={mainChar.bodyDetails}
                onChange={(e) => handleUpdateCharacterField("bodyDetails", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-purple-800">
                5. Trang phục & Phụ kiện cố định (Khóa xuyên suốt các cảnh):
              </label>
              <input
                type="text"
                value={mainChar.outfit}
                onChange={(e) => handleUpdateCharacterField("outfit", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border-2 border-purple-300 bg-purple-50/40 text-xs font-bold text-purple-950"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">6. Phong cách minh họa:</label>
              <select
                value={mainChar.style}
                onChange={(e) => handleUpdateCharacterField("style", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
              >
                <option value="Hoạt hình 3D dễ thương">Hoạt hình 3D dễ thương (Pixar 3D)</option>
                <option value="Tranh truyện 2D">Tranh truyện 2D tươi sáng</option>
                <option value="Tranh màu nước Pastel">Tranh màu nước Pastel</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">7. Bảng màu chủ đạo:</label>
              <input
                type="text"
                value={mainChar.colorPalette}
                onChange={(e) => handleUpdateCharacterField("colorPalette", e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
              />
            </div>
          </div>

          {/* Cột Ảnh Mẫu Chuẩn (Bước 3) */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-3xl bg-white border-2 border-purple-200 shadow-inner space-y-3">
            <span className="text-xs font-black text-purple-800 uppercase">
              Bước 3: Ảnh Mẫu Nhân Vật Chuẩn
            </span>
            <div className="w-44 h-44 rounded-2xl bg-purple-50 border-2 border-dashed border-purple-300 flex items-center justify-center overflow-hidden relative">
              {mainChar.referenceImageUrl ? (
                <img
                  src={mainChar.referenceImageUrl}
                  alt={mainChar.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-3 space-y-1">
                  <UserCheck className="w-8 h-8 text-purple-400 mx-auto" />
                  <p className="text-[11px] font-semibold text-slate-500">
                    Bấm “Tạo Ảnh Mẫu 3D” hoặc tải ảnh lên để làm gốc tham chiếu
                  </p>
                </div>
              )}
              {isGeneratingRef && (
                <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white p-2 text-center">
                  <Loader2 className="w-7 h-7 animate-spin mb-1 text-amber-300" />
                  <span className="text-[11px] font-bold">Đang vẽ mẫu 3D...</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
              <button
                onClick={handleGenerateReferenceImage}
                disabled={isGeneratingRef}
                className="pixar-btn flex-1 py-2 px-3 bg-gradient-to-b from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tạo Ảnh Mẫu 3D</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải ảnh</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadReferenceImage}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* BƯỚC 4, 5, 6: DANH SÁCH TRANH THEO TỪNG CẢNH CÂU CHUYỆN */}
      <div className="pixar-card p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">
              Bước 4, 5 & 6: Bộ Tranh Minh Họa Theo Trình Tự Các Cảnh ({scenes.length} cảnh)
            </h3>
            <p className="text-xs text-slate-500">
              Cô giáo có thể bấm tạo toàn bộ bộ tranh hoặc bấm <strong>“Vẽ lại cảnh này”</strong> cho từng tranh riêng lẻ mà không làm mất các tranh khác.
            </p>
          </div>

          <button
            onClick={handleGenerateAllStoryScenes}
            disabled={isGeneratingAllScenes || generatingSceneIndex !== null}
            className="pixar-btn px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {isGeneratingAllScenes ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang vẽ lần lượt các cảnh...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>VẼ ĐỒNG LOẠT TOÀN BỘ {scenes.length} CẢNH</span>
              </>
            )}
          </button>
        </div>

        {/* Lưu ý kiểm tra tính nhất quán */}
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Cơ chế đảm bảo nhân vật đồng nhất:</strong> Hệ thống tự động đính kèm <em>Ảnh mẫu chuẩn của {mainChar.name}</em> cùng khóa trang phục (<em>{mainChar.outfit}</em>) vào từng cảnh. Nếu một cảnh bất kỳ có chi tiết nhỏ chưa ưng ý, cô chỉ cần sửa nhẹ mô tả cảnh và bấm <strong>“Tạo lại tranh cảnh này”</strong>.
          </div>
        </div>

        {/* Lưới hiển thị các cảnh theo thứ tự */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {scenes.map((sc, idx) => {
            const isThisGenerating = generatingSceneIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="relative bg-slate-100 aspect-video flex items-center justify-center overflow-hidden border-b border-slate-200">
                    <span className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-lg bg-slate-900/75 text-white text-xs font-extrabold">
                      Cảnh {sc.sceneNumber}: {sc.title}
                    </span>
                    {sc.imageUrl ? (
                      <img
                        src={sc.imageUrl}
                        alt={sc.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4 space-y-2">
                        <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-xs text-slate-500">Chưa có tranh Cảnh {sc.sceneNumber}</p>
                      </div>
                    )}
                    {isThisGenerating && (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-2 text-amber-300" />
                        <span className="text-xs font-bold">
                          Đang vẽ Cảnh {sc.sceneNumber} theo mẫu nhân vật {mainChar.name}...
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    <p className="text-xs text-slate-700 line-clamp-3 leading-relaxed">
                      {sc.narration}
                    </p>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        Bối cảnh / Hành động trong tranh:
                      </label>
                      <input
                        type="text"
                        value={sc.setting}
                        onChange={(e) => {
                          const updated = [...scenes];
                          updated[idx] = { ...updated[idx], setting: e.target.value };
                          updateCurrentProject((proj) => ({
                            ...proj,
                            story: { ...proj.story, scenes: updated },
                          }));
                        }}
                        className="w-full mt-0.5 p-1.5 rounded-lg bg-white border border-slate-200 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleGenerateSingleSceneImage(idx)}
                    disabled={isThisGenerating}
                    className="pixar-btn flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isThisGenerating ? "animate-spin" : ""}`} />
                    <span>{sc.imageUrl ? "Tạo lại tranh này" : "Vẽ tranh cảnh này"}</span>
                  </button>
                  {sc.imageUrl && (
                    <a
                      href={sc.imageUrl}
                      download={`Canh-${sc.sceneNumber}-${mainChar.name}.png`}
                      className="p-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                      title="Tải tranh chất lượng cao"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// D. AI SÁNG TÁC BÀI HÁT MẦM NON
// ==========================================
function SongCreator({ currentProject, updateCurrentProject, showNotification }) {
  const song = currentProject.song || {
    title: "",
    ageGroup: currentProject.ageGroup || "4–5 tuổi",
    style: "Vui tươi, nhí nhảnh",
    tempo: 120,
    instruments: "Đàn Piano, Chuông gió, Trống lắc tay",
    structure: { intro: "", verse1: "", chorus: "", ending: "" },
    movements: [],
    sunoPrompt: "",
    audioUrl: "",
  };

  const [topic, setTopic] = useState(currentProject.topic || "Gà Tơ đi học vui");
  const [ageGroup, setAgeGroup] = useState(song.ageGroup || "4–5 tuổi");
  const [musicStyle, setMusicStyle] = useState(song.style || "Vui tươi, nhí nhảnh");
  const [eduGoal, setEduGoal] = useState("Trẻ yêu thích vận động theo nhạc, thuộc lời ca trong sáng");
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Sáng tác lời bài hát nguyên bản bằng AI
  const handleGenerateSongLyrics = async () => {
    setIsLoadingLyrics(true);
    try {
      const schema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          tempo: { type: "INTEGER" },
          instruments: { type: "STRING" },
          intro: { type: "STRING" },
          verse1: { type: "STRING" },
          chorus: { type: "STRING" },
          ending: { type: "STRING" },
          movements: { type: "ARRAY", items: { type: "STRING" } },
          sunoPrompt: { type: "STRING" },
        },
        required: [
          "title",
          "tempo",
          "instruments",
          "intro",
          "verse1",
          "chorus",
          "ending",
          "movements",
          "sunoPrompt",
        ],
      };

      const prompt = `Sáng tác một bài hát thiếu nhi MỚI NGUYÊN BẢN (tuyệt đối không sao chép bài hát có bản quyền) cho trẻ mầm non ${ageGroup}, chủ đề "${topic}", phong cách âm nhạc "${musicStyle}", mục tiêu giáo dục "${eduGoal}". Có cấu trúc Mở đầu, Khổ 1, Điệp khúc và Kết thúc rõ ràng, gợi ý động tác vận động minh họa và Prompt tiếng Anh chuẩn để tạo nhạc AI.`;

      const res = await generateAIText(
        prompt,
        "Bạn là nhạc sĩ sáng tác nhạc thiếu nhi mầm non Việt Nam.",
        schema
      );

      updateCurrentProject((proj) => ({
        ...proj,
        song: {
          title: res.title,
          ageGroup,
          style: musicStyle,
          tempo: res.tempo || 115,
          instruments: res.instruments,
          structure: {
            intro: res.intro,
            verse1: res.verse1,
            chorus: res.chorus,
            ending: res.ending,
          },
          movements: res.movements || [],
          sunoPrompt: res.sunoPrompt,
          audioUrl: proj.song?.audioUrl || "",
        },
      }));
      showNotification("Đã sáng tác lời bài hát mới thành công!");
    } catch (err) {
      showNotification("Lỗi sáng tác bài hát: " + err.message, "error");
    } finally {
      setIsLoadingLyrics(false);
    }
  };

  // Tạo tệp âm thanh thực tế (Giai điệu thiếu nhi WAV hoặc Hát/Đọc nhịp điệu bằng TTS)
  const handleGenerateRealMelodyAudio = async (mode = "melody") => {
    setIsGeneratingAudio(true);
    try {
      let url = "";
      if (mode === "melody") {
        url = await synthesizeChildrenMelodyWav(song.tempo || 115, song.style, 16);
      } else {
        const singText = `Hãy ngân nga đọc nhịp điệu vui tươi bài hát thiếu nhi ${song.title}: ${song.structure.verse1}. ${song.structure.chorus}`;
        url = await generateAITTS(singText, "Leda", false);
      }
      updateCurrentProject((proj) => ({
        ...proj,
        song: { ...proj.song, audioUrl: url, audioType: mode },
      }));
      showNotification("Đã tạo tệp âm thanh WAV thực tế! Cô có thể bấm Nghe thử hoặc Tải về.");
    } catch (err) {
      showNotification("Lỗi tạo âm thanh: " + err.message, "error");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Cột trái: Thiết lập bài hát */}
      <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-pink-100 shadow-sm space-y-4 h-fit">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2.5 rounded-2xl bg-pink-100 text-pink-600">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">D. AI Sáng Tác Bài Hát</h2>
            <p className="text-xs text-slate-500">Lời ca nguyên bản, giai điệu & vận động</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đề bài hát:</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Độ tuổi:</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value="3–4 tuổi">3–4 tuổi</option>
              <option value="4–5 tuổi">4–5 tuổi</option>
              <option value="5–6 tuổi">5–6 tuổi</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Phong cách nhạc:</label>
            <select
              value={musicStyle}
              onChange={(e) => setMusicStyle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50"
            >
              <option value="Vui tươi, rộn ràng">Vui tươi, rộn ràng</option>
              <option value="Dịu dàng, hát ru">Dịu dàng, tình cảm</option>
              <option value="Hành khúc nhí nhảnh">Hành khúc tập thể dục</option>
              <option value="Đồng dao dân gian">Âm hưởng đồng dao</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Mục tiêu giáo dục:</label>
          <textarea
            rows={2}
            value={eduGoal}
            onChange={(e) => setEduGoal(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
          />
        </div>

        <button
          onClick={handleGenerateSongLyrics}
          disabled={isLoadingLyrics}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isLoadingLyrics ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{isLoadingLyrics ? "Đang Sáng Tác Lời Ca..." : "1. Sáng Tác Lời Bài Hát Mới"}</span>
        </button>

        <div className="pt-3 border-t border-slate-100 space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            2. Xuất tệp âm thanh thực tế (WAV):
          </label>
          <button
            onClick={() => handleGenerateRealMelodyAudio("melody")}
            disabled={isGeneratingAudio}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-60"
          >
            {isGeneratingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            <span>Tạo Giai Điệu Nhạc Nền Thiếu Nhi (WAV)</span>
          </button>
          <button
            onClick={() => handleGenerateRealMelodyAudio("vocal")}
            disabled={isGeneratingAudio}
            className="w-full py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Mic className="w-4 h-4" />
            <span>Tạo Giọng Đọc Nhịp Điệu Lời Ca (AI TTS)</span>
          </button>
        </div>
      </div>

      {/* Cột phải: Hiển thị Lời bài hát, Động tác vận động & Trình phát nhạc */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white rounded-3xl p-6 border border-pink-100 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-pink-100 text-pink-700">
                Bài hát nguyên bản • Nhịp độ {song.tempo} BPM • {song.instruments}
              </span>
              <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{song.title}</h3>
            </div>
          </div>

          {/* Phân biệt rõ Lời bài hát do AI tạo và Tệp âm thanh thực tế */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-50 to-amber-50 border border-pink-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-pink-600" />
                  <span>Trình Phát Âm Thanh Thực Tế</span>
                </h4>
                <p className="text-xs text-slate-600">
                  {song.audioUrl
                    ? "✅ Đã tạo tệp âm thanh WAV thực tế. Cô có thể nghe thử và tải xuống máy."
                    : "⚠️ Hiện mới có Lời bài hát do AI sáng tác. Hãy bấm nút 'Tạo Giai Điệu Nhạc Nền' bên trái để tạo tệp âm thanh thực tế."}
                </p>
              </div>
              {song.audioUrl && (
                <a
                  href={song.audioUrl}
                  download={`Nhac-${song.title}.wav`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Tệp Âm Thanh (.WAV)</span>
                </a>
              )}
            </div>
            {song.audioUrl && (
              <audio controls src={song.audioUrl} className="w-full mt-3 h-10" />
            )}
          </div>

          {/* Cấu trúc lời bài hát */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold text-pink-600 uppercase">Đoạn mở đầu (Intro):</span>
                <p className="text-xs text-slate-700 mt-1">{song.structure?.intro}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-pink-50/50 border border-pink-100">
                <span className="text-[11px] font-bold text-pink-600 uppercase">Khổ 1 (Verse):</span>
                <p className="text-sm font-semibold text-slate-800 whitespace-pre-line mt-1">
                  {song.structure?.verse1}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200">
                <span className="text-[11px] font-bold text-amber-700 uppercase">Điệp khúc (Chorus):</span>
                <p className="text-sm font-extrabold text-slate-800 whitespace-pre-line mt-1">
                  {song.structure?.chorus}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-700 uppercase">Đoạn kết (Ending):</span>
                <p className="text-xs font-semibold text-slate-700 mt-1">{song.structure?.ending}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200">
                <h4 className="text-sm font-extrabold text-sky-900 mb-2">
                  💃 5. Gợi ý động tác vận động minh họa cho bé
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-700">
                  {song.movements?.map((mv, i) => (
                    <li key={i} className="leading-relaxed">
                      {mv}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase">
                    7. Prompt Tạo Nhạc Có Lời (Dành cho Suno / Udio AI)
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(song.sunoPrompt || "");
                      showNotification("Đã sao chép Prompt tạo nhạc!");
                    }}
                    className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> Sao chép
                  </button>
                </div>
                <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 font-mono">
                  {song.sunoPrompt}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// E. AI TẠO GIỌNG ĐỌC TIẾNG VIỆT (TTS & ĐỌC PHÂN VAI)
// ==========================================
function VoiceCreator({ currentProject, updateCurrentProject, showNotification }) {
  const scenes = currentProject.story?.scenes || [];
  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [readingSpeed, setReadingSpeed] = useState("Vừa phải, truyền cảm");
  const [rolePlayMode, setRolePlayMode] = useState(true);
  const [customText, setCustomText] = useState(
    currentProject.poem?.stanzas?.join("\n\n") || "Sáng mùa thu trong trẻo, Gà Tơ diện chiếc áo yếm xanh..."
  );
  const [customAudioUrl, setCustomAudioUrl] = useState("");
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [generatingSceneIdx, setGeneratingSceneIdx] = useState(null);

  const voices = [
    { id: "Aoede", label: "Cô Mai (Giọng Nữ dịu dàng, kể chuyện mầm non)" },
    { id: "Leda", label: "Bé Bông (Giọng Nữ trẻ trung, trong trẻo)" },
    { id: "Puck", label: "Bạn Tí (Giọng Nam hoạt bát, đóng vai nhân vật)" },
    { id: "Charon", label: "Thầy Minh (Giọng Nam trầm ấm, truyền cảm)" },
  ];

  // Tạo giọng đọc cho văn bản / bài thơ tùy chọn
  const handleGenerateCustomVoice = async () => {
    if (!customText.trim()) return;
    setIsGeneratingCustom(true);
    try {
      const prompt = `Hãy đọc diễn cảm bằng tiếng Việt với tốc độ "${readingSpeed}" dành cho trẻ mầm non:\n${customText}`;
      const wavUrl = await generateAITTS(prompt, selectedVoice, false);
      setCustomAudioUrl(wavUrl);
      showNotification("Đã tạo giọng đọc tiếng Việt thành công!");
    } catch (err) {
      showNotification("Lỗi tạo giọng đọc: " + err.message, "error");
    } finally {
      setIsGeneratingCustom(false);
    }
  };

  // Tạo giọng đọc đồng bộ từng cảnh truyện (Hỗ trợ đọc phân vai Người dẫn chuyện & Nhân vật)
  const handleGenerateSceneVoice = async (idx) => {
    const sc = scenes[idx];
    if (!sc) return;
    setGeneratingSceneIdx(idx);
    try {
      let ttsPrompt = "";
      if (rolePlayMode && sc.dialogue) {
        ttsPrompt = `TTS the following Vietnamese preschool story conversation between Người dẫn chuyện and Nhân vật:\nNgười dẫn chuyện: ${sc.narration}\nNhân vật: ${sc.dialogue}`;
      } else {
        ttsPrompt = `Hãy đọc kể chuyện truyền cảm cho trẻ mầm non (${readingSpeed}): ${sc.narration} ${sc.dialogue || ""}`;
      }

      const wavUrl = await generateAITTS(ttsPrompt, selectedVoice, rolePlayMode && Boolean(sc.dialogue));

      updateCurrentProject((proj) => {
        const updatedScenes = [...(proj.story?.scenes || [])];
        updatedScenes[idx] = { ...updatedScenes[idx], audioUrl: wavUrl };
        return { ...proj, story: { ...proj.story, scenes: updatedScenes } };
      });
      showNotification(`Đã tạo giọng đọc cho Cảnh ${sc.sceneNumber}!`);
    } catch (err) {
      showNotification("Lỗi tạo giọng đọc cảnh: " + err.message, "error");
    } finally {
      setGeneratingSceneIdx(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Cột trái: Thiết lập giọng đọc */}
      <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-teal-100 shadow-sm space-y-4 h-fit">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2.5 rounded-2xl bg-teal-100 text-teal-600">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">E. AI Tạo Giọng Đọc</h2>
            <p className="text-xs text-slate-500">Giọng kể tiếng Việt ấm áp & Đọc phân vai</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Chọn giọng đọc AI:</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold bg-slate-50"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tốc độ đọc & Ngắt nghỉ:</label>
          <select
            value={readingSpeed}
            onChange={(e) => setReadingSpeed(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs bg-slate-50"
          >
            <option value="Chậm rãi, ngắt nghỉ rõ cho bé 3-4 tuổi">Chậm rãi, rõ chữ (Trẻ 3–4 tuổi)</option>
            <option value="Vừa phải, truyền cảm">Vừa phải, truyền cảm (Trẻ 4–5 tuổi)</option>
            <option value="Sôi nổi, giàu tiết tấu">Sôi nổi, hào hứng (Trẻ 5–6 tuổi)</option>
          </select>
        </div>

        <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-teal-50 border border-teal-200 cursor-pointer">
          <input
            type="checkbox"
            checked={rolePlayMode}
            onChange={(e) => setRolePlayMode(e.target.checked)}
            className="rounded text-teal-600"
          />
          <div className="text-xs">
            <span className="font-bold text-teal-900 block">Chế độ đọc truyện phân vai (Multi-Speaker)</span>
            <span className="text-teal-700">Tự động tách giọng Người dẫn chuyện (Nữ) & Nhân vật (Hoạt hình)</span>
          </div>
        </label>

        <div className="pt-2 border-t border-slate-100 space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Đọc thử Bài thơ hoặc Đoạn văn bất kỳ:
          </label>
          <textarea
            rows={4}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-xs"
          />
          <button
            onClick={handleGenerateCustomVoice}
            disabled={isGeneratingCustom}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isGeneratingCustom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            <span>{isGeneratingCustom ? "Đang Tạo Giọng Đọc..." : "Chuyển Văn Bản Thành Giọng Đọc"}</span>
          </button>

          {customAudioUrl && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 mt-2">
              <audio controls src={customAudioUrl} className="w-full h-9" />
              <a
                href={customAudioUrl}
                download="Giong-doc-tho-mam-non.wav"
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
              >
                <Download className="w-3.5 h-3.5" /> Tải tệp âm thanh (.WAV)
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Cột phải: Đồng bộ giọng kể với từng cảnh minh họa */}
      <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-teal-100 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-lg font-extrabold text-slate-800">
            Đồng Bộ Giọng Kể Theo Từng Cảnh Truyện ({scenes.length} cảnh)
          </h3>
          <p className="text-xs text-slate-500">
            Giọng đọc của từng cảnh sẽ tự động ghép vào <strong>Mục F. Tạo Video Kể Chuyện</strong>
          </p>
        </div>

        <div className="space-y-3">
          {scenes.map((sc, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 flex-1">
                <span className="text-xs font-extrabold text-teal-700">
                  Cảnh {sc.sceneNumber}: {sc.title}
                </span>
                <p className="text-xs text-slate-700">{sc.narration}</p>
                {sc.dialogue && (
                  <p className="text-xs font-semibold text-emerald-700 italic">“{sc.dialogue}”</p>
                )}
                {sc.audioUrl && (
                  <audio controls src={sc.audioUrl} className="w-full max-w-md h-8 mt-2" />
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleGenerateSceneVoice(idx)}
                  disabled={generatingSceneIdx === idx}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
                >
                  {generatingSceneIdx === idx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                  <span>{sc.audioUrl ? "Tạo lại giọng" : "Tạo giọng cảnh này"}</span>
                </button>
                {sc.audioUrl && (
                  <a
                    href={sc.audioUrl}
                    download={`Giong-ke-canh-${sc.sceneNumber}.wav`}
                    className="p-2 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    title="Tải tệp âm thanh"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// F. AI TẠO VIDEO TỪ HỌC LIỆU (DỰNG & XUẤT VIDEO THỰC TẾ TRÊN TRÌNH DUYỆT)
// ==========================================
function VideoStudio({ currentProject, updateCurrentProject, showNotification }) {
  const scenes = currentProject.story?.scenes || [];
  const [videoRatio, setVideoRatio] = useState("16:9");
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [currentPlayIdx, setCurrentPlayIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportedVideoUrl, setExportedVideoUrl] = useState("");

  const canvasRef = useRef(null);
  const audioPlayerRef = useRef(null);

  // Vẽ khung hình hiện tại lên Canvas (Kết hợp Tranh minh họa + Phụ đề tiếng Việt + Tiêu đề)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = videoRatio === "16:9" ? 960 : 540;
    const height = videoRatio === "16:9" ? 540 : 960;
    canvas.width = width;
    canvas.height = height;

    const activeScene = scenes[currentPlayIdx] || scenes[0];

    const drawFrame = (imgObj = null) => {
      // Nền gradient pastel
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#E0F2FE");
      grad.addColorStop(0.5, "#FEF3C7");
      grad.addColorStop(1, "#FCE7F3");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      if (imgObj) {
        ctx.drawImage(imgObj, 0, 0, width, height);
      } else {
        // Minh họa mặc định khi cảnh chưa vẽ tranh
        ctx.fillStyle = "#0F766E";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(currentProject.story?.title || "Mầm Non AI Studio", width / 2, height / 2 - 30);
        ctx.fillStyle = "#475569";
        ctx.font = "20px sans-serif";
        ctx.fillText(
          `Cảnh ${activeScene?.sceneNumber || 1}: ${activeScene?.title || ""}`,
          width / 2,
          height / 2 + 15
        );
      }

      // Nhãn cảnh góc trên
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      ctx.beginPath();
      ctx.roundRect(24, 24, 320, 42, 12);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `Cảnh ${activeScene?.sceneNumber || 1}: ${(activeScene?.title || "").slice(0, 26)}`,
        40,
        51
      );

      // Phụ đề tiếng Việt phía dưới
      if (showSubtitles && activeScene) {
        const boxHeight = 120;
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.beginPath();
        ctx.roundRect(24, height - boxHeight - 20, width - 48, boxHeight, 18);
        ctx.fill();

        ctx.fillStyle = "#FEF08A";
        ctx.font = "bold 19px sans-serif";
        ctx.textAlign = "center";
        const fullSub = `${activeScene.narration} ${activeScene.dialogue ? `“${activeScene.dialogue}”` : ""}`;
        const line1 = fullSub.slice(0, 75);
        const line2 = fullSub.slice(75, 150);
        const line3 = fullSub.slice(150, 225);
        ctx.fillText(line1, width / 2, height - boxHeight + 18);
        if (line2) ctx.fillText(line2, width / 2, height - boxHeight + 48);
        if (line3) ctx.fillText(line3 + (fullSub.length > 225 ? "..." : ""), width / 2, height - boxHeight + 78);
      }
    };

    if (activeScene?.imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => drawFrame(img);
      img.src = activeScene.imageUrl;
    } else {
      drawFrame(null);
    }
  }, [currentPlayIdx, scenes, videoRatio, showSubtitles, currentProject]);

  // Chế độ phát xem trước tự động chuyển cảnh
  useEffect(() => {
    if (!isPlaying || scenes.length === 0) return;
    const activeScene = scenes[currentPlayIdx];
    const durationMs = (activeScene?.duration || 6) * 1000;

    if (activeScene?.audioUrl && audioPlayerRef.current) {
      audioPlayerRef.current.src = activeScene.audioUrl;
      audioPlayerRef.current.play().catch(() => { });
    }

    const timer = setTimeout(() => {
      if (currentPlayIdx < scenes.length - 1) {
        setCurrentPlayIdx((prev) => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentPlayIdx(0);
      }
    }, durationMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentPlayIdx, scenes]);

  // Kết xuất tệp Video thực tế từ Canvas bằng MediaRecorder
  const handleExportRealVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || scenes.length === 0) return;
    setIsExportingVideo(true);
    setExportedVideoUrl("");

    try {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setExportedVideoUrl(url);
        setIsExportingVideo(false);
        showNotification("Đã kết xuất thành công tệp Video kể chuyện! Cô có thể tải về máy.");
      };

      recorder.start();
      setIsPlaying(true);

      for (let i = 0; i < scenes.length; i++) {
        setCurrentPlayIdx(i);
        await new Promise((r) => setTimeout(r, 2500));
      }

      setIsPlaying(false);
      recorder.stop();
    } catch (err) {
      setIsExportingVideo(false);
      showNotification("Trình duyệt không hỗ trợ ghi video trực tiếp: " + err.message, "error");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Cột trái: Thiết lập cảnh & Thời lượng */}
      <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-indigo-100 shadow-sm space-y-4 h-fit">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2.5 rounded-2xl bg-indigo-100 text-indigo-600">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-800">F. AI Tạo Video Từ Học Liệu</h2>
            <p className="text-xs text-slate-500">Ghép tranh, giọng kể, nhạc nền & phụ đề</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tỷ lệ khung hình:</label>
            <select
              value={videoRatio}
              onChange={(e) => setVideoRatio(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold bg-slate-50"
            >
              <option value="16:9">Ngang 16:9 (Tivi / Máy chiếu)</option>
              <option value="9:16">Dọc 9:16 (Điện thoại / TikTok)</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900 cursor-pointer w-full">
              <input
                type="checkbox"
                checked={showSubtitles}
                onChange={(e) => setShowSubtitles(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span>Hiển thị phụ đề tiếng Việt</span>
            </label>
          </div>
        </div>

        {/* Sắp xếp thứ tự cảnh và chỉnh thời lượng */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Danh sách các cảnh & Thời lượng hiển thị:
          </label>
          {scenes.map((sc, idx) => (
            <div
              key={idx}
              onClick={() => setCurrentPlayIdx(idx)}
              className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${currentPlayIdx === idx
                ? "bg-indigo-50 border-indigo-400 font-bold"
                : "bg-slate-50 border-slate-200"
                }`}
            >
              <div className="truncate">
                <span className="text-indigo-700">Cảnh {sc.sceneNumber}:</span> {sc.title}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={3}
                  max={20}
                  value={sc.duration || 6}
                  onChange={(e) => {
                    const updated = [...scenes];
                    updated[idx] = { ...updated[idx], duration: Number(e.target.value) };
                    updateCurrentProject((proj) => ({
                      ...proj,
                      story: { ...proj.story, scenes: updated },
                    }));
                  }}
                  className="w-12 p-1 rounded border border-slate-300 text-center text-xs"
                />
                <span className="text-[11px] text-slate-500">giây</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleExportRealVideo}
          disabled={isExportingVideo}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isExportingVideo ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang Dựng & Ghi Video Thực Tế...</span>
            </>
          ) : (
            <>
              <Film className="w-4 h-4" />
              <span>Kết Xuất Tệp Video Kể Chuyện</span>
            </>
          )}
        </button>

        {exportedVideoUrl && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
            <p className="text-xs font-bold text-emerald-800">
              ✅ Video đã dựng xong! Cô có thể tải tệp về máy tính / điện thoại:
            </p>
            <a
              href={exportedVideoUrl}
              download={`Video-${currentProject.story?.title || "MamNon"}.webm`}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Tải Video Về Máy</span>
            </a>
          </div>
        )}
      </div>

      {/* Cột phải: Màn hình Xem Trước Video Canvas */}
      <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-indigo-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-800">
            Màn Hình Xem Trước Video Kể Chuyện
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? "Tạm dừng" : "Phát xem trước"}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-3 flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`rounded-xl shadow-lg ${videoRatio === "16:9" ? "w-full aspect-video" : "w-64 aspect-[9/16]"
              }`}
          />
          <audio ref={audioPlayerRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// G. AI HỖ TRỢ SOẠN GIÁO ÁN MẦM NON (LẤY TRẺ LÀM TRUNG TÂM & STEAM)
// ==========================================
function LessonPlanCreator({
  currentProject,
  updateCurrentProject,
  showNotification,
  setPrintPreviewData,
}) {
  const lesson = currentProject.lessonPlan || {
    title: "",
    ageGroup: currentProject.ageGroup || "4–5 tuổi",
    objectives: { knowledge: "", skills: "", attitude: "" },
    preparation: { teacher: "", children: "" },
    procedure: [],
    steamExtension: "",
  };

  const [activityType, setActivityType] = useState("Làm quen Văn học (Dạy trẻ kể chuyện / đọc thơ)");
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateLessonPlan = async () => {
    setIsLoading(true);
    try {
      const schema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          knowledge: { type: "STRING" },
          skills: { type: "STRING" },
          attitude: { type: "STRING" },
          teacherPrep: { type: "STRING" },
          childrenPrep: { type: "STRING" },
          steamExtension: { type: "STRING" },
          procedure: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                step: { type: "STRING" },
                content: { type: "STRING" },
              },
            },
          },
        },
        required: [
          "title",
          "knowledge",
          "skills",
          "attitude",
          "teacherPrep",
          "childrenPrep",
          "steamExtension",
          "procedure",
        ],
      };

      const prompt = `Hãy soạn một Giáo án mầm non chuẩn chương trình Giáo dục Mầm non của Bộ GD&ĐT Việt Nam theo hướng lấy trẻ làm trung tâm. Lĩnh vực: "${activityType}". Độ tuổi: ${currentProject.ageGroup}. Dựa trên học liệu trong dự án: Bài thơ "${currentProject.poem?.title || ""}", Truyện "${currentProject.story?.title || ""}", Bài hát "${currentProject.song?.title || ""}". Có đầy đủ: 1. Mục đích yêu cầu (Kiến thức, Kỹ năng, Thái độ), 2. Chuẩn bị của cô và trẻ, 3. Tiến trình tổ chức hoạt động (Gây hứng thú, Hoạt động trọng tâm, Trò chơi củng cố từ dễ đến khó), 4. Gợi ý ứng dụng AI, STEAM và trải nghiệm thực tế.`;

      const res = await generateAIText(
        prompt,
        "Bạn là chuyên viên phương pháp giáo dục mầm non cấp cao tại Việt Nam.",
        schema
      );

      updateCurrentProject((proj) => ({
        ...proj,
        lessonPlan: {
          title: res.title,
          ageGroup: proj.ageGroup,
          objectives: {
            knowledge: res.knowledge,
            skills: res.skills,
            attitude: res.attitude,
          },
          preparation: {
            teacher: res.teacherPrep,
            children: res.childrenPrep,
          },
          procedure: res.procedure || [],
          steamExtension: res.steamExtension,
        },
      }));
      showNotification("Đã soạn xong Giáo án chuẩn lấy trẻ làm trung tâm!");
    } catch (err) {
      showNotification("Lỗi soạn giáo án: " + err.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Xuất giáo án sang tệp Word (.doc) thực tế để giáo viên chỉnh sửa & nộp bài
  const handleExportDocx = () => {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${lesson.title}</title></head>
      <body style="font-family: 'Times New Roman', serif; line-height: 1.5;">
        <h2 style="text-align:center;">GIÁO ÁN TỔ CHỨC HOẠT ĐỘNG HỌC</h2>
        <h3 style="text-align:center;">${lesson.title}</h3>
        <p style="text-align:center;"><strong>Độ tuổi:</strong> ${lesson.ageGroup} | <strong>Chủ đề:</strong> ${currentProject.topic}</p>
        <h4>I. MỤC ĐÍCH - YÊU CẦU</h4>
        <p><strong>1. Kiến thức:</strong> ${lesson.objectives?.knowledge}</p>
        <p><strong>2. Kỹ năng:</strong> ${lesson.objectives?.skills}</p>
        <p><strong>3. Thái độ:</strong> ${lesson.objectives?.attitude}</p>
        <h4>II. CHUẨN BỊ</h4>
        <p><strong>1. Đồ dùng của cô:</strong> ${lesson.preparation?.teacher}</p>
        <p><strong>2. Đồ dùng của trẻ:</strong> ${lesson.preparation?.children}</p>
        <h4>III. TIẾN TRÌNH TỔ CHỨC HOẠT ĐỘNG</h4>
        ${(lesson.procedure || [])
        .map((p) => `<p><strong>${p.step}:</strong><br/>${p.content.replace(/\n/g, "<br/>")}</p>`)
        .join("")}
        <h4>IV. HOẠT ĐỘNG MỞ RỘNG STEAM & ỨNG DỤNG AI</h4>
        <p>${lesson.steamExtension}</p>
      </body></html>
    `;
    const blob = new Blob(["\ufeff", htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Giao-An-${currentProject.title}.doc`;
    link.click();
    showNotification("Đã tải xuống tệp Giáo án Word (.DOC)!");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-amber-100 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800">
                G. AI Hỗ Trợ Soạn Giáo Án Lấy Trẻ Làm Trung Tâm
              </h2>
              <p className="text-xs text-slate-500">
                Tự động kết nối Thơ, Truyện, Tranh và Bài hát trong dự án thành giáo án hoàn chỉnh
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-slate-50"
            >
              <option value="Làm quen Văn học (Kể chuyện / Đọc thơ)">Lĩnh vực: Làm quen Văn học</option>
              <option value="Phát triển Ngôn ngữ & Đóng kịch tương tác">Lĩnh vực: Phát triển Ngôn ngữ</option>
              <option value="Giáo dục Âm nhạc & Vận động">Lĩnh vực: Giáo dục Âm nhạc</option>
              <option value="Khám phá Khoa học & Trải nghiệm STEAM">Lĩnh vực: Khám phá STEAM</option>
              <option value="Phát triển Tình cảm - Kỹ năng xã hội">Lĩnh vực: Tình cảm – Kỹ năng xã hội</option>
            </select>

            <button
              onClick={handleGenerateLessonPlan}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isLoading ? "AI Đang Soạn Giáo Án..." : "Soạn Giáo Án Tự Động"}</span>
            </button>

            <button
              onClick={handleExportDocx}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Word (.DOC)</span>
            </button>
          </div>
        </div>

        {/* Nội dung giáo án cho phép giáo viên chỉnh sửa trực tiếp */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Tên đề tài giáo án:</label>
            <input
              type="text"
              value={lesson.title}
              onChange={(e) =>
                updateCurrentProject((p) => ({
                  ...p,
                  lessonPlan: { ...p.lessonPlan, title: e.target.value },
                }))
              }
              className="w-full mt-1 p-3 rounded-xl border border-amber-200 bg-amber-50/40 text-base font-extrabold text-slate-800"
            />
          </div>

          {/* I. Mục tiêu 3 mặt */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-200 space-y-1">
              <label className="text-xs font-extrabold text-sky-800">1. Kiến thức:</label>
              <textarea
                rows={3}
                value={lesson.objectives?.knowledge}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    lessonPlan: {
                      ...p.lessonPlan,
                      objectives: { ...p.lessonPlan.objectives, knowledge: e.target.value },
                    },
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-sky-100 text-xs leading-relaxed"
              />
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-1">
              <label className="text-xs font-extrabold text-emerald-800">2. Kỹ năng:</label>
              <textarea
                rows={3}
                value={lesson.objectives?.skills}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    lessonPlan: {
                      ...p.lessonPlan,
                      objectives: { ...p.lessonPlan.objectives, skills: e.target.value },
                    },
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-emerald-100 text-xs leading-relaxed"
              />
            </div>
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-1">
              <label className="text-xs font-extrabold text-rose-800">3. Thái độ:</label>
              <textarea
                rows={3}
                value={lesson.objectives?.attitude}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    lessonPlan: {
                      ...p.lessonPlan,
                      objectives: { ...p.lessonPlan.objectives, attitude: e.target.value },
                    },
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-rose-100 text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* II. Chuẩn bị */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-xs font-extrabold text-slate-700">Chuẩn bị của Giáo viên:</label>
              <textarea
                rows={2}
                value={lesson.preparation?.teacher}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    lessonPlan: {
                      ...p.lessonPlan,
                      preparation: { ...p.lessonPlan.preparation, teacher: e.target.value },
                    },
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-slate-200 text-xs"
              />
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-xs font-extrabold text-slate-700">Chuẩn bị của Trẻ:</label>
              <textarea
                rows={2}
                value={lesson.preparation?.children}
                onChange={(e) =>
                  updateCurrentProject((p) => ({
                    ...p,
                    lessonPlan: {
                      ...p.lessonPlan,
                      preparation: { ...p.lessonPlan.preparation, children: e.target.value },
                    },
                  }))
                }
                className="w-full p-2 rounded-xl bg-white border border-slate-200 text-xs"
              />
            </div>
          </div>

          {/* III. Tiến trình hoạt động */}
          <div className="space-y-3">
            <h4 className="text-sm font-extrabold text-slate-800">
              Tiến Trình Tổ Chức Hoạt Động (Có thể sửa trực tiếp):
            </h4>
            {lesson.procedure?.map((item, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200 space-y-1.5">
                <input
                  type="text"
                  value={item.step}
                  onChange={(e) => {
                    const updated = [...lesson.procedure];
                    updated[idx] = { ...updated[idx], step: e.target.value };
                    updateCurrentProject((p) => ({
                      ...p,
                      lessonPlan: { ...p.lessonPlan, procedure: updated },
                    }));
                  }}
                  className="font-extrabold text-xs text-amber-900 bg-transparent w-full"
                />
                <textarea
                  rows={3}
                  value={item.content}
                  onChange={(e) => {
                    const updated = [...lesson.procedure];
                    updated[idx] = { ...updated[idx], content: e.target.value };
                    updateCurrentProject((p) => ({
                      ...p,
                      lessonPlan: { ...p.lessonPlan, procedure: updated },
                    }));
                  }}
                  className="w-full p-2.5 rounded-xl bg-white border border-amber-100 text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>

          {/* IV. Mở rộng STEAM & AI */}
          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
            <label className="text-xs font-extrabold text-purple-900">
              💡 Gợi ý ứng dụng AI, STEAM & Hoạt động góc lấy trẻ làm trung tâm:
            </label>
            <textarea
              rows={2}
              value={lesson.steamExtension}
              onChange={(e) =>
                updateCurrentProject((p) => ({
                  ...p,
                  lessonPlan: { ...p.lessonPlan, steamExtension: e.target.value },
                }))
              }
              className="w-full p-2 rounded-xl bg-white border border-purple-100 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. THƯ VIỆN HỌC LIỆU CÁ NHÂN
// ==========================================
function PersonalLibrary({
  projects,
  setProjects,
  currentProjectId,
  setCurrentProjectId,
  setActiveTab,
  showNotification,
  setConfirmModal,
  setPrintPreviewData,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAge, setFilterAge] = useState("ALL");

  const filteredProjects = projects.filter((p) => {
    const matchSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchAge = filterAge === "ALL" || p.ageGroup === filterAge;
    return matchSearch && matchAge;
  });

  const handleDuplicateProject = (proj) => {
    const copyId = "proj-" + Date.now();
    const duplicated = {
      ...JSON.parse(JSON.stringify(proj)),
      id: copyId,
      title: `${proj.title} (Bản sao)`,
      createdAt: new Date().toLocaleDateString("vi-VN"),
    };
    setProjects((prev) => [duplicated, ...prev]);
    showNotification(`Đã nhân bản dự án "${proj.title}"!`);
  };

  const handleDeleteProject = (proj) => {
    if (projects.length <= 1) {
      showNotification("Cần giữ lại ít nhất 1 dự án trong thư viện!", "error");
      return;
    }
    setConfirmModal({
      open: true,
      title: "Xác nhận xóa dự án học liệu",
      message: `Cô có chắc chắn muốn xóa dự án "${proj.title}" không? Thao tác này không thể hoàn tác.`,
      onConfirm: () => {
        const remaining = projects.filter((p) => p.id !== proj.id);
        setProjects(remaining);
        if (currentProjectId === proj.id) {
          setCurrentProjectId(remaining[0].id);
        }
        showNotification("Đã xóa dự án khỏi thư viện.");
      },
    });
  };

  // Tải trọn bộ hồ sơ dự án dưới dạng tệp Word tổng hợp (.DOC)
  const handleDownloadFullProjectBundle = (proj) => {
    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${proj.title}</title></head>
      <body style="font-family: 'Times New Roman', serif; line-height: 1.5;">
        <h1 style="color:#047857; text-align:center;">HỒ SƠ BỘ HỌC LIỆU MẦM NON AI STUDIO</h1>
        <h2 style="text-align:center;">${proj.title} (${proj.ageGroup})</h2>
        <hr/>
        <h3>1. BÀI THƠ: ${proj.poem?.title || ""}</h3>
        <pre style="font-family: 'Times New Roman', serif; font-size: 14pt;">${(proj.poem?.stanzas || []).join("\n\n")}</pre>
        <h3>2. TRUYỆN KỂ: ${proj.story?.title || ""}</h3>
        ${(proj.story?.scenes || [])
        .map((s) => `<p><strong>Cảnh ${s.sceneNumber} (${s.title}):</strong> ${s.narration}<br/><em>${s.dialogue || ""}</em></p>`)
        .join("")}
        <h3>3. HỒ SƠ NHÂN VẬT ĐỒNG NHẤT</h3>
        ${(proj.characters || [])
        .map((c) => `<p><strong>${c.name} (${c.species}):</strong> ${c.faceDetails}. Trang phục: ${c.outfit}</p>`)
        .join("")}
        <h3>4. BÀI HÁT MỚI: ${proj.song?.title || ""}</h3>
        <p>${proj.song?.structure?.verse1 || ""}<br/><strong>Điệp khúc:</strong> ${proj.song?.structure?.chorus || ""}</p>
        <h3>5. GIÁO ÁN: ${proj.lessonPlan?.title || ""}</h3>
        <p><strong>Kiến thức:</strong> ${proj.lessonPlan?.objectives?.knowledge || ""}</p>
        <p><strong>Kỹ năng:</strong> ${proj.lessonPlan?.objectives?.skills || ""}</p>
        <p><strong>Thái độ:</strong> ${proj.lessonPlan?.objectives?.attitude || ""}</p>
      </body></html>
    `;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Tron-Bo-Hoc-Lieu-${proj.title}.doc`;
    a.click();
    showNotification("Đã xuất trọn bộ hồ sơ học liệu ra tệp Word (.DOC)!");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-100 text-cyan-700">
              <FolderHeart className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800">
                Thư Viện Học Liệu Cá Nhân ({projects.length} dự án)
              </h2>
              <p className="text-xs text-slate-500">
                Quản lý dự án theo chủ đề, độ tuổi, năm học; mở lại chỉnh sửa, sao chép hoặc tải xuống
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab("all-in-one")}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Dự Án Học Liệu Mới</span>
          </button>
        </div>

        {/* Thanh tìm kiếm & lọc */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm dự án theo tên bài thơ, truyện, chủ đề..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs"
            />
          </div>
          <select
            value={filterAge}
            onChange={(e) => setFilterAge(e.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-bold bg-slate-50"
          >
            <option value="ALL">Tất cả độ tuổi (3–6 tuổi)</option>
            <option value="3–4 tuổi">3–4 tuổi</option>
            <option value="4–5 tuổi">4–5 tuổi</option>
            <option value="5–6 tuổi">5–6 tuổi</option>
          </select>
        </div>

        {/* Danh sách thẻ dự án */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((proj) => {
            const isCurrent = proj.id === currentProjectId;
            return (
              <div
                key={proj.id}
                className={`rounded-3xl p-5 border transition-all flex flex-col justify-between ${isCurrent
                  ? "bg-emerald-50/50 border-emerald-400 shadow-md"
                  : "bg-slate-50/60 border-slate-200 hover:bg-white"
                  }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          {proj.ageGroup}
                        </span>
                        <span className="text-xs text-slate-400">Năm học {proj.schoolYear}</span>
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-800 mt-1">{proj.title}</h3>
                      <p className="text-xs text-slate-500">
                        Chủ đề: <strong>{proj.topic}</strong> • Phong cách: {proj.style}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold">
                        Đang mở
                      </span>
                    )}
                  </div>

                  {/* Các thành phần có trong dự án */}
                  <div className="flex flex-wrap gap-1.5 my-3">
                    {proj.poem && (
                      <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-800 text-[11px] font-semibold">
                        Thơ: {proj.poem.title}
                      </span>
                    )}
                    {proj.story && (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 text-[11px] font-semibold">
                        Truyện ({proj.story.scenes?.length || 0} cảnh)
                      </span>
                    )}
                    {proj.characters?.length > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-800 text-[11px] font-semibold">
                        Nhân vật: {proj.characters[0].name}
                      </span>
                    )}
                    {proj.song && (
                      <span className="px-2 py-0.5 rounded-lg bg-pink-100 text-pink-800 text-[11px] font-semibold">
                        Bài hát: {proj.song.title}
                      </span>
                    )}
                    {proj.lessonPlan && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-semibold">
                        Giáo án STEAM
                      </span>
                    )}
                  </div>
                </div>

                {/* Các nút thao tác dự án */}
                <div className="pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCurrentProjectId(proj.id);
                        setActiveTab("home");
                        showNotification(`Đã mở dự án "${proj.title}"!`);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                    >
                      Mở & Chỉnh sửa
                    </button>
                    <button
                      onClick={() => handleDownloadFullProjectBundle(proj)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải trọn bộ (.DOC)</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDuplicateProject(proj)}
                      className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                      title="Sao chép dự án tạo phiên bản mới"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProject(proj)}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200"
                      title="Xóa dự án"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
