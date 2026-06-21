"use client";

type CoachSplitHandleProps = {
  onResizeStart: (clientX: number) => void;
};

export function CoachSplitHandle({ onResizeStart }: CoachSplitHandleProps) {
  return (
    <button
      type="button"
      className="coach-split-handle"
      aria-label="Ajustar ancho del panel de estudio"
      aria-orientation="vertical"
      role="separator"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onResizeStart(event.clientX);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
