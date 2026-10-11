const FONT = 'Inter, sans-serif'

function wavePath(ox, amp, phase) {
  const points = []
  for (let y = -20; y <= 740; y += 20) {
    points.push((ox + amp * Math.sin(y / 85 + phase)).toFixed(1) + ',' + y)
  }
  return 'M' + points.join(' L') + ' L800,740 L800,-20 Z'
}

function ribbonPath(base, amp, phase) {
  const points = []
  for (let x = 0; x <= 800; x += 20) {
    points.push(x + ',' + (base + amp * Math.sin(x / 110 + phase)).toFixed(1))
  }
  return 'M0,740 L' + points.join(' L') + ' L800,740 Z'
}

function Hex({ cx, cy, r }) {
  cx = Number(cx)
  cy = Number(cy)
  r = Number(r)
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6
    points.push((cx + r * Math.cos(angle)).toFixed(1) + ',' + (cy + r * Math.sin(angle)).toFixed(1))
  }
  return <polygon points={points.join(' ')} fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
}

function Bottle({ x, y, s = 1, cap }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#shadow)">
      <rect x="-26" y="-40" width="52" height="28" rx="5" fill={cap} />
      {[-18, -11, -4, 3, 10, 17].map((lx) => (
        <line key={lx} x1={lx} x2={lx} y1="-37" y2="-15" stroke="#000" strokeOpacity=".2" strokeWidth="1.6" />
      ))}
      <path d="M-34 -10 L-28 -14 H28 L34 -10 V92 Q34 100 26 100 H-26 Q-34 100 -34 92 Z" fill="#e9f0fa" stroke="#fff" strokeOpacity=".8" />
      <rect x="-34" y="26" width="68" height="52" fill="#fff" />
      <rect x="-34" y="26" width="68" height="14" fill="#1d4ed8" />
      <text x="0" y="36.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily={FONT}>Mindray</text>
      <rect x="-26" y="48" width="52" height="3" rx="1.5" fill="#93b4e8" />
      <rect x="-26" y="56" width="38" height="3" rx="1.5" fill="#cbd5e1" />
      <rect x="-26" y="64" width="46" height="3" rx="1.5" fill="#cbd5e1" />
      <rect x="-30" y="-6" width="5" height="92" rx="2.5" fill="#fff" opacity=".7" />
    </g>
  )
}

function Box({ x, y, wl, wr, h, top, left, right, leftArt, rightArt }) {
  const k = 0.866
  const R = [wr * k, wr * 0.5]
  const L = [-wl * k, wl * 0.5]
  const F = [R[0] + L[0], R[1] + L[1]]
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#shadow)">
      <polygon points={`${L} ${F} ${F[0]},${F[1] + h} ${L[0]},${L[1] + h}`} fill={left} />
      <polygon points={`${F} ${R} ${R[0]},${R[1] + h} ${F[0]},${F[1] + h}`} fill={right} />
      <polygon points={`0,0 ${R} ${F} ${L}`} fill={top} />
      <g transform={`matrix(.866 .5 0 1 ${L[0]} ${L[1]})`}>{leftArt}</g>
      <g transform={`matrix(.866 -.5 0 1 ${F[0]} ${F[1]})`}>{rightArt}</g>
    </g>
  )
}

function Face({ w, h, band, text, sub, fontSize = 13 }) {
  return (
    <>
      <rect x="0" y={h * 0.28} width={w} height={h * 0.3} fill={band} />
      <text x={w / 2} y={h * 0.28 + h * 0.2} textAnchor="middle" fontSize={fontSize} fontWeight="800" fill="#fff" fontFamily={FONT}>{text}</text>
      {sub && <text x={w / 2} y={h * 0.82} textAnchor="middle" fontSize="8" fontWeight="700" fill="#475569" fontFamily={FONT}>{sub}</text>}
    </>
  )
}

function CrossBand({ w, h }) {
  const crosses = []
  for (let cx = 10; cx < w; cx += 16) {
    crosses.push(<path key={cx} d={`M${cx - 3} ${h * 0.5}h6M${cx} ${h * 0.5 - 3}v6`} stroke="#fff" strokeWidth="1.6" />)
  }
  return (
    <>
      <rect x="0" y={h * 0.3} width={w} height={h * 0.4} fill="#dc2626" />
      {crosses}
    </>
  )
}

function ReagentBox({ x, y, name, w = 96, h = 62 }) {
  return (
    <Box x={x} y={y} wl={40} wr={w} h={h} top="#ffffff" left="#e6edf3" right="#ffffff"
      leftArt={<rect x="0" y="0" width="40" height={h} fill="#16a34a" opacity=".8" />}
      rightArt={
        <>
          <text x="8" y="14" fontSize="8" fontWeight="800" fill="#1d4ed8" fontFamily={FONT}>Mindray</text>
          <text x={w / 2} y={h * 0.64} textAnchor="middle" fontSize="26" fontWeight="800" fill="#15803d" fontFamily={FONT}>{name}</text>
          <rect x="0" y={h - 7} width={w} height="7" fill="#16a34a" />
        </>
      } />
  )
}

function Tube({ x, y, r = 0, s = 0.85, cap, blood }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} filter="url(#shadow)">
      <rect x="-10" y="-72" width="20" height="14" rx="3" fill={cap} />
      <path d="M-8.5 -58 H8.5 V50 a8.5 8.5 0 0 1 -17 0 Z" fill="#e8f1f8" opacity=".85" stroke="#fff" strokeOpacity=".7" />
      <path d="M-8.5 -8 H8.5 V50 a8.5 8.5 0 0 1 -17 0 Z" fill={blood} opacity=".92" />
      <rect x="-5.5" y="-54" width="2.5" height="92" rx="1.2" fill="#fff" opacity=".65" />
    </g>
  )
}

function Vial({ x, y, color, cap }) {
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#shadow)">
      <rect x="-9" y="-34" width="18" height="12" rx="3" fill={cap} />
      <path d="M-14 -22 H14 V22 a8 8 0 0 1 -8 8 H-6 a8 8 0 0 1 -8 -8 Z" fill="#eef5fb" opacity=".85" stroke="#fff" strokeOpacity=".7" />
      <path d="M-14 0 H14 V22 a8 8 0 0 1 -8 8 H-6 a8 8 0 0 1 -8 -8 Z" fill={color} opacity=".9" />
      <rect x="-10" y="-18" width="3" height="38" rx="1.5" fill="#fff" opacity=".7" />
    </g>
  )
}

function Cassette({ x, y, r }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`} filter="url(#shadow)">
      <rect x="-38" y="-15" width="76" height="30" rx="9" fill="#fff" />
      <rect x="-22" y="-8" width="32" height="16" rx="4" fill="#cbd5e1" />
      <rect x="-20" y="-6" width="28" height="12" rx="3" fill="#f1f5f9" />
      <rect x="-12" y="-6" width="3" height="12" fill="#dc2626" />
      <circle cx="24" cy="0" r="5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth=".8" />
      <text x="-34" y="-17.5" fontSize="6" fontWeight="800" fill="#fff" fontFamily={FONT}>Finecare</text>
    </g>
  )
}

function Bubble({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#bubble)" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" />
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.4} rx={r * 0.22} ry={r * 0.13} fill="#fff" opacity=".85" transform={`rotate(-30 ${cx - r * 0.35} ${cy - r * 0.4})`} />
      <path d={`M${cx - r * 0.6} ${cy + r * 0.45} Q${cx} ${cy + r * 0.95} ${cx + r * 0.6} ${cy + r * 0.45}`} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" />
    </g>
  )
}

function Drop({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -16 C10 -2 12 4 12 8 a12 12 0 0 1 -24 0 C-12 4 -10 -2 0 -16 Z" fill="url(#bubble)" stroke="#fff" strokeOpacity=".6" />
      <ellipse cx="-4" cy="4" rx="2.2" ry="4" fill="#fff" opacity=".8" />
    </g>
  )
}

export default function LabArt() {
  return (
    <svg
      className="absolute inset-0 h-full w-full lg:left-auto lg:right-0 lg:w-[60%]"
      viewBox="0 0 800 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0e6b73" />
          <stop offset=".55" stopColor="#123a63" />
          <stop offset="1" stopColor="#0f1f4a" />
        </linearGradient>
        <radialGradient id="glow" cx=".75" cy=".15" r=".6">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bubble" cx=".5" cy=".5" r=".5">
          <stop offset=".55" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#bfe6ff" stopOpacity=".38" />
        </radialGradient>
        <filter id="shadow" x="-30%" y="-30%" width="170%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#020617" floodOpacity=".45" />
        </filter>
        <filter id="layerShadow" x="-20%" y="-5%" width="140%" height="110%">
          <feDropShadow dx="-6" dy="3" stdDeviation="7" floodColor="#020617" floodOpacity=".4" />
        </filter>
        <filter id="blur"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>

      <path d={wavePath(70, 26, 0)} fill="#6d28d9" filter="url(#layerShadow)" />
      <path d={wavePath(105, 30, 1.2)} fill="#be123c" filter="url(#layerShadow)" />
      <path d={wavePath(140, 28, 2.4)} fill="#14305c" filter="url(#layerShadow)" />
      <path d={wavePath(178, 32, 3.6)} fill="url(#front)" filter="url(#layerShadow)" />
      <rect x="150" y="0" width="650" height="720" fill="url(#glow)" />

      <g filter="url(#blur)" fill="#fff" opacity=".1">
        <path d="M560 90 h120 v200 a16 16 0 0 1 -16 16 h-88 a16 16 0 0 1 -16 -16z" />
        <path d="M310 40 h44 v76 l62 118 a22 22 0 0 1 -19 32 h-130 a22 22 0 0 1 -19 -32 l62 -118z" />
      </g>

      <path d="M200 560 C380 600 560 380 800 430" fill="none" stroke="#be123c" strokeOpacity=".55" strokeWidth="46" strokeLinecap="round" />
      <path d="M220 120 C420 60 600 240 800 200" fill="none" stroke="#7c3aed" strokeOpacity=".5" strokeWidth="38" strokeLinecap="round" />

      <path d="M200 470 L330 470 L345 440 L362 500 L378 455 L392 470 L560 470 L575 430 L592 515 L610 470 L800 470" fill="none" stroke="#7dd3fc" strokeOpacity=".3" strokeWidth="2" />
      <Hex cx={300} cy={170} r={22} />
      <Hex cx={338} cy={192} r={22} />
      <Hex cx={338} cy={236} r={22} />
      <g stroke="#fff" strokeOpacity=".22" strokeWidth="1.5">
        <line x1="357" y1="181" x2="395" y2="160" />
        <line x1="319" y1="159" x2="300" y2="122" />
      </g>
      <g fill="#fff" fillOpacity=".3">
        <circle cx="395" cy="160" r="4" />
        <circle cx="300" cy="122" r="4" />
      </g>

      <Box x={520} y={330} wl={100} wr={100} h={110} top="#f8fafc" left="#e8eef8" right="#c3d0e6"
        leftArt={<Face w={100} h={110} band="#1d4ed8" text="M-30" sub="DILUENT" fontSize={16} />}
        rightArt={<Face w={100} h={110} band="#2563eb" text="Mindray" sub="HEMATOLOGY" fontSize={13} />} />
      <ellipse cx="500" cy="372" rx="13" ry="6.5" fill="#1e3a8a" />
      <rect x="487" y="364" width="26" height="8" fill="#1e40af" />
      <ellipse cx="500" cy="364" rx="13" ry="6.5" fill="#3b82f6" />

      <ReagentBox x={672} y={392} name="GGT" />
      <ReagentBox x={640} y={452} name="TP" />
      <ReagentBox x={704} y={452} name="AST" />

      <Bottle x={330} y={370} cap="#2563eb" />
      <Bottle x={402} y={398} s={0.95} cap="#dc2626" />
      <Bottle x={268} y={430} s={0.9} cap="#f8fafc" />

      <Tube x={560} y={190} r={-14} cap="#dc2626" blood="#b91c1c" />
      <Tube x={596} y={182} r={-5} cap="#7c3aed" blood="#c4b5fd" />
      <Tube x={632} y={180} r={4} cap="#2563eb" blood="#fde68a" />
      <Tube x={668} y={186} r={13} cap="#16a34a" blood="#fca5a5" />
      <g transform="translate(450 170) rotate(28)" filter="url(#shadow)">
        <ellipse cx="0" cy="-118" rx="9" ry="14" fill="#f8fafc" />
        <path d="M-4 -106 H4 V30 L0 62 L-4 30 Z" fill="#e8f1f8" stroke="#fff" strokeOpacity=".8" />
        <rect x="-4" y="-60" width="8" height="5" fill="#dc2626" />
        <rect x="-4" y="-48" width="8" height="5" fill="#2563eb" />
        <rect x="-1.5" y="-20" width="3" height="50" fill="#38bdf8" opacity=".8" />
      </g>

      <Box x={470} y={500} wl={70} wr={120} h={90} top="#f1f5f9" left="#8b95a5" right="#a4adbb"
        leftArt={<><rect x="0" y="30" width="70" height="14" fill="#dc2626" /><text x="35" y="22" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily={FONT}>FIA</text></>}
        rightArt={<><CrossBand w={120} h={90} /><text x="60" y="22" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily={FONT}>Finecare</text><text x="60" y="82" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily={FONT}>Rapid Quantitative Test</text></>} />

      <Box x={330} y={530} wl={70} wr={90} h={70} top="#f5f3ff" left="#6d28d9" right="#2563eb"
        leftArt={<Face w={70} h={70} band="#fff" text="" />}
        rightArt={<><rect x="0" y="24" width="90" height="22" fill="#fff" fillOpacity=".92" /><text x="45" y="39" textAnchor="middle" fontSize="12" fontWeight="800" fill="#4c1d95" fontFamily={FONT}>Immolitech</text></>} />
      <Box x={650} y={540} wl={60} wr={80} h={55} top="#eff6ff" left="#7c3aed" right="#1d4ed8"
        rightArt={<><rect x="0" y="16" width="80" height="20" fill="#fff" fillOpacity=".92" /><text x="40" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fill="#4c1d95" fontFamily={FONT}>Immolitech</text></>} />

      <Cassette x={250} y={610} r={-12} />
      <Cassette x={595} y={652} r={8} />
      <Cassette x={730} y={640} r={-20} />
      <Vial x={505} y={270} color="#f43f5e" cap="#f8fafc" />
      <Vial x={735} y={290} color="#22d3ee" cap="#1e293b" />
      <Vial x={290} y={290} color="#a78bfa" cap="#dc2626" />

      <path d={ribbonPath(690, 12, 0.5)} fill="#7c3aed" opacity=".92" />
      <path d={ribbonPath(708, 10, 2)} fill="#0e6b73" />

      <Bubble cx={300} cy={110} r={40} />
      <Bubble cx={420} cy={250} r={24} />
      <Bubble cx={705} cy={110} r={32} />
      <Bubble cx={765} cy={360} r={18} />
      <Bubble cx={240} cy={340} r={16} />
      <Bubble cx={620} cy={80} r={16} />
      <Bubble cx={360} cy={600} r={22} />
      <Drop x={480} y={110} />
      <Drop x={225} y={250} s={0.8} />
      <Drop x={560} y={470} s={0.7} />
    </svg>
  )
}
