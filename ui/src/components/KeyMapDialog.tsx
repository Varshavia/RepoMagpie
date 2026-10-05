// The keyboard map, shown with ? (docs/ui.md §7). Esc or the close button closes it.
import { useEffect, useRef } from "react";
import { Icon } from "../icons.tsx";
import { KEY_MAP } from "../logic/keys.ts";
import { MOD } from "../platform.ts";

export function KeyMapDialog({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => before?.focus();
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="keymap-title">
        <div className="dialog-head">
          <Icon name="keyboard" size={20} />
          <h2 className="pane-title" id="keymap-title" style={{ flex: 1 }}>
            Keyboard
          </h2>
          <button ref={close} type="button" className="button ghost icon-button" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <table className="keymap">
          <tbody>
            {KEY_MAP.map((row) => (
              <tr key={row.keys}>
                <td>
                  <kbd>{row.keys.replace("Ctrl/Cmd", MOD).replace("Ctrl+Enter", `${MOD}+Enter`)}</kbd>
                </td>
                <td>{row.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
