export default function KeyboardHelp({ show, onClose, shortcuts }) {
  if (!show) return null;

  return (
    <div 
      className="keyboard-shortcuts show"
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 8 
      }}>
        <span style={{ fontWeight: 600 }}>⌨️ Phím tắt</span>
        <button 
          onClick={onClose}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#fff', 
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 14
          }}
        >
          ×
        </button>
      </div>
      
      <div style={{ display: 'grid', gap: 4 }}>
        {shortcuts.map(({ keys, desc }, i) => (
          <div key={i} style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ opacity: 0.8 }}>{desc}</span>
            <span className="kbd">{keys}</span>
          </div>
        ))}
      </div>
    </div>
  );
}