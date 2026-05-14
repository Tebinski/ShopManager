export default function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#0a1628", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, padding:24, width:"100%", maxWidth:520, boxShadow:"0 24px 64px rgba(0,0,0,0.6)", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:13, color:"#e2e8f0", fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
