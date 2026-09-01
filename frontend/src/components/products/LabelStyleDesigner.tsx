import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type CustomLabelStyle,
  type LabelStyleField,
  type LabelStyleFieldType,
} from '../../lib/api';
import { confirmAction } from '../../lib/confirmAction';
import {
  buildFreeformPrintDocumentHtml,
  fieldEdgeGapsMm,
  PRINT_SAFE_FONTS,
  rotatedFieldExceedsCanvas,
  SAMPLE_FREEFORM_LABEL_ITEM,
} from '../../lib/labelStyleRender';
import { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '../ui/PageShell';

/** Designer-only zoom for the editable overlay — never used in print HTML. */
const PX_PER_MM = 4;

const FIELD_TYPE_OPTIONS: Array<{ type: LabelStyleFieldType; label: string }> = [
  { type: 'shop', label: 'Shop name' },
  { type: 'name', label: 'Product name' },
  { type: 'size', label: 'Variant' },
  { type: 'colour', label: 'Colour' },
  { type: 'price', label: 'Price' },
  { type: 'barcode', label: 'Barcode' },
  { type: 'customText', label: 'Custom text' },
];

function newFieldId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultField(type: LabelStyleFieldType, canvasW: number, canvasH: number): LabelStyleField {
  const widthMm = type === 'barcode' ? Math.min(36, canvasW - 2) : Math.min(28, canvasW - 2);
  const heightMm = type === 'barcode' ? Math.min(14, canvasH - 2) : Math.min(8, canvasH - 2);
  return {
    id: newFieldId(),
    type,
    ...(type === 'customText' ? { customText: 'Custom text' } : {}),
    xMm: 1,
    yMm: 1,
    widthMm,
    heightMm,
    fontSizePt: type === 'price' ? 11 : 8,
    fontWeight: type === 'price' || type === 'shop' ? 'bold' : 'normal',
    fontFamily: 'Arial',
    fontStyle: 'normal',
    align: 'center',
    rotationDeg: 0,
  };
}

/** Parse a number input; empty/invalid keeps `fallback`. Allows 0. */
function parseNumberInput(raw: string, fallback: number): number {
  if (raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function formatGapMm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}mm`;
}

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'resize';
      id: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
    };

export function LabelStyleDesigner({
  onClose,
  onUseAsLabelSize,
}: {
  onClose: () => void;
  /** Prefill Settings custom size form with canvas mm. */
  onUseAsLabelSize?: (dims: { widthMm: number; heightMm: number }) => void;
}) {
  const [canvasWidthMm, setCanvasWidthMm] = useState(58);
  const [canvasHeightMm, setCanvasHeightMm] = useState(40);
  const [safeMarginMm, setSafeMarginMm] = useState(2);
  const [fields, setFields] = useState<LabelStyleField[]>(() => [
    defaultField('shop', 58, 40),
    { ...defaultField('name', 58, 40), yMm: 8 },
    { ...defaultField('price', 58, 40), yMm: 16 },
    { ...defaultField('barcode', 58, 40), yMm: 24, widthMm: 54, heightMm: 14 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addType, setAddType] = useState<LabelStyleFieldType>('name');
  const [saved, setSaved] = useState<CustomLabelStyle[]>([]);
  const [editingStyleId, setEditingStyleId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [styleName, setStyleName] = useState('');
  const dragRef = useRef<DragState | null>(null);
  const canvasSizeRef = useRef({ w: canvasWidthMm, h: canvasHeightMm });
  canvasSizeRef.current = { w: canvasWidthMm, h: canvasHeightMm };

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const refresh = useCallback(() => {
    void api
      .listCustomLabelStyles()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Exact print document HTML — same bytes as the printer path for one sample label. */
  const printPreviewSrcDoc = useMemo(
    () =>
      buildFreeformPrintDocumentHtml(
        [SAMPLE_FREEFORM_LABEL_ITEM],
        { canvasWidthMm, canvasHeightMm, fields },
        1,
        0,
      ),
    [canvasWidthMm, canvasHeightMm, fields],
  );

  const rotationWarnings = useMemo(
    () =>
      fields.filter((f) => rotatedFieldExceedsCanvas(f, canvasWidthMm, canvasHeightMm)).map((f) => f.id),
    [fields, canvasWidthMm, canvasHeightMm],
  );

  const selectedGaps = useMemo(() => {
    if (!selected) return null;
    return fieldEdgeGapsMm(selected, canvasWidthMm, canvasHeightMm);
  }, [selected, canvasWidthMm, canvasHeightMm]);

  function clampField(f: LabelStyleField, canvasW: number, canvasH: number): LabelStyleField {
    const widthMm = Math.max(4, Math.min(f.widthMm, canvasW));
    const heightMm = Math.max(3, Math.min(f.heightMm, canvasH));
    // Allow 0 for x/y; clamp to keep the unrotated logical box on-canvas.
    const xMm = Math.max(0, Math.min(f.xMm, canvasW - widthMm));
    const yMm = Math.max(0, Math.min(f.yMm, canvasH - heightMm));
    return { ...f, xMm, yMm, widthMm, heightMm };
  }

  function updateSelected(patch: Partial<LabelStyleField>) {
    if (!selectedId) return;
    setFields((prev) =>
      prev.map((f) =>
        f.id === selectedId
          ? clampField({ ...f, ...patch }, canvasWidthMm, canvasHeightMm)
          : f,
      ),
    );
  }

  function addField() {
    const next = clampField(
      defaultField(addType, canvasWidthMm, canvasHeightMm),
      canvasWidthMm,
      canvasHeightMm,
    );
    setFields((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  }

  function loadStyle(style: CustomLabelStyle) {
    setEditingStyleId(style.id);
    setStyleName(style.name);
    setCanvasWidthMm(style.canvasWidthMm);
    setCanvasHeightMm(style.canvasHeightMm);
    setFields(style.fields.map((f) => ({ ...f })));
    setSelectedId(style.fields[0]?.id ?? null);
    setMessage(`Loaded “${style.name}” for editing.`);
    setError('');
  }

  function clearEditing() {
    setEditingStyleId(null);
    setStyleName('');
    setMessage('Cleared — next save creates a new style.');
  }

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      // Drag deltas are always in screen → mm, applied to unrotated xMm/yMm/width/height.
      // Rotation is visual-only and never enters this math.
      const dxMm = (event.clientX - drag.startX) / PX_PER_MM;
      const dyMm = (event.clientY - drag.startY) / PX_PER_MM;
      const { w: canvasW, h: canvasH } = canvasSizeRef.current;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== drag.id) return f;
          if (drag.kind === 'move') {
            return clampField(
              { ...f, xMm: drag.origX + dxMm, yMm: drag.origY + dyMm },
              canvasW,
              canvasH,
            );
          }
          return clampField(
            { ...f, widthMm: drag.origW + dxMm, heightMm: drag.origH + dyMm },
            canvasW,
            canvasH,
          );
        }),
      );
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  async function saveOrUpdate(asNew: boolean) {
    setError('');
    setMessage('');
    const name = styleName.trim();
    if (!name) {
      setError('Enter a style name before saving');
      return;
    }
    if (fields.length < 1) {
      setError('Add at least one field before saving');
      return;
    }
    const payload = { name, canvasWidthMm, canvasHeightMm, fields };
    setBusy(true);
    try {
      if (!asNew && editingStyleId != null) {
        await api.updateCustomLabelStyle(editingStyleId, payload);
        setMessage(`Updated style “${name}”.`);
      } else {
        const created = await api.createCustomLabelStyle(payload);
        setEditingStyleId(created.id);
        setMessage(`Saved new style “${name}”.`);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save style');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStyle(style: CustomLabelStyle) {
    const ok = await confirmAction(`Delete label style “${style.name}”?`, {
      title: 'Delete style',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteCustomLabelStyle(style.id);
      if (editingStyleId === style.id) clearEditing();
      setMessage(`Deleted “${style.name}”.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete style');
    } finally {
      setBusy(false);
    }
  }

  const canvasPxW = canvasWidthMm * PX_PER_MM;
  const canvasPxH = canvasHeightMm * PX_PER_MM;
  const marginPx = Math.max(0, safeMarginMm) * PX_PER_MM;

  const modal = (
    <div
      data-page-modal="open"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface2 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-textPrimary">Label style designer</h2>
            <p className="text-xs text-textSecondary">
              Drag fields freely. Preview iframe uses the exact print HTML.
            </p>
          </div>
          <SecondaryButton type="button" onClick={onClose}>
            Close
          </SecondaryButton>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <FieldLabel>Canvas width (mm)</FieldLabel>
                <TextInput
                  type="number"
                  min={10}
                  max={200}
                  value={String(canvasWidthMm)}
                  onChange={(e) =>
                    setCanvasWidthMm(Math.max(10, Math.min(200, parseNumberInput(e.target.value, 10))))
                  }
                />
              </div>
              <div>
                <FieldLabel>Canvas height (mm)</FieldLabel>
                <TextInput
                  type="number"
                  min={10}
                  max={200}
                  value={String(canvasHeightMm)}
                  onChange={(e) =>
                    setCanvasHeightMm(Math.max(10, Math.min(200, parseNumberInput(e.target.value, 10))))
                  }
                />
              </div>
              <div>
                <FieldLabel>Safe margin (mm)</FieldLabel>
                <TextInput
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={String(safeMarginMm)}
                  onChange={(e) =>
                    setSafeMarginMm(Math.max(0, Math.min(20, parseNumberInput(e.target.value, 2))))
                  }
                />
              </div>
              <div>
                <FieldLabel>Add field</FieldLabel>
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-surface1 px-2 py-2 text-sm"
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as LabelStyleFieldType)}
                >
                  {FIELD_TYPE_OPTIONS.map((o) => (
                    <option key={o.type} value={o.type}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <SecondaryButton type="button" onClick={addField}>
                  Add to canvas
                </SecondaryButton>
              </div>
            </div>

            <p className="text-sm text-textPrimary">
              Printable area: <strong>{canvasWidthMm}mm × {canvasHeightMm}mm</strong>
            </p>
            {onUseAsLabelSize ? (
              <SecondaryButton
                type="button"
                onClick={() => onUseAsLabelSize({ widthMm: canvasWidthMm, heightMm: canvasHeightMm })}
              >
                Use this as a label size
              </SecondaryButton>
            ) : null}

            {/* Outer padding is outside the canvas; the white rect is exact physical mm. */}
            <div className="overflow-auto rounded-lg border border-dashed border-border bg-neutral-100 p-3">
              <div
                className="relative bg-white"
                style={{
                  width: canvasPxW,
                  height: canvasPxH,
                  boxSizing: 'border-box',
                  padding: 0,
                  border: 'none',
                  margin: 0,
                }}
                onMouseDown={() => setSelectedId(null)}
              >
                {/* Safe-margin bands (guidance only) */}
                {safeMarginMm > 0 ? (
                  <>
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 bg-amber-400/20"
                      style={{ height: marginPx }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-amber-400/20"
                      style={{ height: marginPx }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 bg-amber-400/20"
                      style={{ width: marginPx }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-amber-400/20"
                      style={{ width: marginPx }}
                    />
                    <div
                      className="pointer-events-none absolute border border-dashed border-amber-600/50"
                      style={{
                        left: marginPx,
                        top: marginPx,
                        width: Math.max(0, canvasPxW - 2 * marginPx),
                        height: Math.max(0, canvasPxH - 2 * marginPx),
                      }}
                    />
                  </>
                ) : null}

                {fields.map((field) => {
                  const rot = ((field.rotationDeg ?? 0) % 360 + 360) % 360;
                  const isSelected = selectedId === field.id;
                  return (
                    <div
                      key={field.id}
                      role="button"
                      tabIndex={0}
                      /* Hit target stays unrotated — drag math uses logical box only. */
                      className={`absolute box-border cursor-move border ${
                        isSelected ? 'border-accent ring-2 ring-accent/40' : 'border-sky-400/70'
                      } bg-sky-50/30`}
                      style={{
                        left: field.xMm * PX_PER_MM,
                        top: field.yMm * PX_PER_MM,
                        width: field.widthMm * PX_PER_MM,
                        height: field.heightMm * PX_PER_MM,
                        zIndex: isSelected ? 2 : 1,
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(field.id);
                        dragRef.current = {
                          kind: 'move',
                          id: field.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: field.xMm,
                          origY: field.yMm,
                        };
                      }}
                    >
                      <div
                        className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden"
                        style={{
                          transform: rot !== 0 ? `rotate(${rot}deg)` : undefined,
                          transformOrigin: 'center center',
                        }}
                      >
                        <span className="block truncate px-0.5 text-[10px] font-semibold text-sky-900">
                          {FIELD_TYPE_OPTIONS.find((o) => o.type === field.type)?.label ?? field.type}
                        </span>
                      </div>
                      {isSelected ? (
                        <span
                          className="absolute bottom-0 right-0 z-10 h-3 w-3 cursor-se-resize bg-accent"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              kind: 'resize',
                              id: field.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origW: field.widthMm,
                              origH: field.heightMm,
                            };
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}

                {/* Live gap labels for selected field */}
                {selected && selectedGaps ? (
                  <>
                    <div
                      className="pointer-events-none absolute z-20 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white"
                      style={{
                        left: selected.xMm * PX_PER_MM + (selected.widthMm * PX_PER_MM) / 2,
                        top: Math.max(0, selected.yMm * PX_PER_MM - 14),
                        transform: 'translateX(-50%)',
                      }}
                    >
                      ↑ {formatGapMm(selectedGaps.top)}
                    </div>
                    <div
                      className="pointer-events-none absolute z-20 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white"
                      style={{
                        left: selected.xMm * PX_PER_MM + (selected.widthMm * PX_PER_MM) / 2,
                        top: Math.min(
                          canvasPxH - 14,
                          (selected.yMm + selected.heightMm) * PX_PER_MM + 2,
                        ),
                        transform: 'translateX(-50%)',
                      }}
                    >
                      ↓ {formatGapMm(selectedGaps.bottom)}
                    </div>
                    <div
                      className="pointer-events-none absolute z-20 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white"
                      style={{
                        left: Math.max(0, selected.xMm * PX_PER_MM - 2),
                        top: selected.yMm * PX_PER_MM + (selected.heightMm * PX_PER_MM) / 2,
                        transform: 'translate(-100%, -50%)',
                      }}
                    >
                      ← {formatGapMm(selectedGaps.left)}
                    </div>
                    <div
                      className="pointer-events-none absolute z-20 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white"
                      style={{
                        left: Math.min(
                          canvasPxW - 2,
                          (selected.xMm + selected.widthMm) * PX_PER_MM + 2,
                        ),
                        top: selected.yMm * PX_PER_MM + (selected.heightMm * PX_PER_MM) / 2,
                        transform: 'translateY(-50%)',
                      }}
                    >
                      → {formatGapMm(selectedGaps.right)}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-textSecondary">
                Print-accurate preview (exact print HTML)
              </p>
              <iframe
                title="Label print preview"
                srcDoc={printPreviewSrcDoc}
                className="rounded border border-border bg-white"
                style={{
                  width: `${canvasWidthMm * PX_PER_MM + 8}px`,
                  height: `${canvasHeightMm * PX_PER_MM + 8}px`,
                  border: '1px solid var(--border, #ccc)',
                }}
              />
            </div>
            {rotationWarnings.length > 0 ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Warning: {rotationWarnings.length} field(s) may extend outside the canvas after
                rotation.
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-surface1 p-3">
            <p className="text-sm font-semibold text-textPrimary">Selected field</p>
            {selected ? (
              <div className="space-y-2 text-sm">
                <p className="text-textSecondary">
                  {FIELD_TYPE_OPTIONS.find((o) => o.type === selected.type)?.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>X (mm)</FieldLabel>
                    <TextInput
                      type="number"
                      min={0}
                      step={0.1}
                      value={String(selected.xMm)}
                      onChange={(e) =>
                        updateSelected({ xMm: parseNumberInput(e.target.value, selected.xMm) })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Y (mm)</FieldLabel>
                    <TextInput
                      type="number"
                      min={0}
                      step={0.1}
                      value={String(selected.yMm)}
                      onChange={(e) =>
                        updateSelected({ yMm: parseNumberInput(e.target.value, selected.yMm) })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Width (mm)</FieldLabel>
                    <TextInput
                      type="number"
                      min={4}
                      step={0.1}
                      value={String(selected.widthMm)}
                      onChange={(e) =>
                        updateSelected({
                          widthMm: parseNumberInput(e.target.value, selected.widthMm),
                        })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel>Height (mm)</FieldLabel>
                    <TextInput
                      type="number"
                      min={3}
                      step={0.1}
                      value={String(selected.heightMm)}
                      onChange={(e) =>
                        updateSelected({
                          heightMm: parseNumberInput(e.target.value, selected.heightMm),
                        })
                      }
                    />
                  </div>
                </div>
                {selectedGaps ? (
                  <p className="text-[11px] text-textMuted">
                    Gaps — L {formatGapMm(selectedGaps.left)} · R {formatGapMm(selectedGaps.right)} ·
                    T {formatGapMm(selectedGaps.top)} · B {formatGapMm(selectedGaps.bottom)}
                  </p>
                ) : null}
                {selected.type === 'customText' ? (
                  <div>
                    <FieldLabel>Text</FieldLabel>
                    <TextInput
                      value={selected.customText ?? ''}
                      onChange={(e) => updateSelected({ customText: e.target.value })}
                    />
                  </div>
                ) : null}
                {selected.type !== 'barcode' ? (
                  <>
                    <div>
                      <FieldLabel>Font</FieldLabel>
                      <select
                        className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2 py-2 text-sm"
                        value={selected.fontFamily ?? 'Arial'}
                        onChange={(e) => updateSelected({ fontFamily: e.target.value })}
                      >
                        {PRINT_SAFE_FONTS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel>Font size (pt)</FieldLabel>
                      <TextInput
                        type="number"
                        min={6}
                        max={40}
                        value={String(selected.fontSizePt ?? 8)}
                        onChange={(e) =>
                          updateSelected({
                            fontSizePt: Math.max(
                              6,
                              Math.min(40, parseNumberInput(e.target.value, 8)),
                            ),
                          })
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(selected.fontWeight ?? 'bold') === 'bold'}
                        onChange={(e) =>
                          updateSelected({ fontWeight: e.target.checked ? 'bold' : 'normal' })
                        }
                      />
                      Bold
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(selected.fontStyle ?? 'normal') === 'italic'}
                        onChange={(e) =>
                          updateSelected({ fontStyle: e.target.checked ? 'italic' : 'normal' })
                        }
                      />
                      Italic
                    </label>
                    <div>
                      <FieldLabel>Align</FieldLabel>
                      <select
                        className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2 py-2 text-sm"
                        value={selected.align ?? 'center'}
                        onChange={(e) =>
                          updateSelected({ align: e.target.value as 'left' | 'center' | 'right' })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </>
                ) : null}
                <div>
                  <FieldLabel>Rotation (°)</FieldLabel>
                  <TextInput
                    type="number"
                    min={0}
                    max={359}
                    value={String(selected.rotationDeg ?? 0)}
                    onChange={(e) =>
                      updateSelected({
                        rotationDeg: Math.max(
                          0,
                          Math.min(359, Math.floor(parseNumberInput(e.target.value, 0))),
                        ),
                      })
                    }
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[0, 90, 180, 270].map((deg) => (
                      <SecondaryButton
                        key={deg}
                        type="button"
                        onClick={() => updateSelected({ rotationDeg: deg })}
                      >
                        {deg}°
                      </SecondaryButton>
                    ))}
                  </div>
                  {selected.type === 'barcode' ? (
                    <p className="mt-1 text-[11px] text-textMuted">
                      Non-90° barcode rotation may not scan on a thermal printer.
                    </p>
                  ) : null}
                </div>
                <SecondaryButton type="button" onClick={removeSelected}>
                  Remove field
                </SecondaryButton>
              </div>
            ) : (
              <p className="text-xs text-textMuted">Click a field on the canvas to edit it.</p>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <div>
                <FieldLabel>Style name</FieldLabel>
                <TextInput
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  placeholder="e.g. Shelf price left"
                  maxLength={80}
                />
              </div>
              {editingStyleId != null ? (
                <>
                  <PrimaryButton type="button" disabled={busy} onClick={() => void saveOrUpdate(false)}>
                    {busy ? 'Saving…' : 'Update style'}
                  </PrimaryButton>
                  <SecondaryButton type="button" disabled={busy} onClick={() => void saveOrUpdate(true)}>
                    Save as new
                  </SecondaryButton>
                  <SecondaryButton type="button" disabled={busy} onClick={clearEditing}>
                    Clear editing
                  </SecondaryButton>
                </>
              ) : (
                <PrimaryButton type="button" disabled={busy} onClick={() => void saveOrUpdate(true)}>
                  {busy ? 'Saving…' : 'Save style'}
                </PrimaryButton>
              )}
            </div>

            {error ? <p className="text-xs text-danger">{error}</p> : null}
            {message ? <p className="text-xs text-success">{message}</p> : null}

            {saved.length > 0 ? (
              <ul className="space-y-2 border-t border-border pt-3">
                {saved.map((style) => (
                  <li key={style.id} className="flex flex-col gap-1 text-sm">
                    <button
                      type="button"
                      className={`truncate text-left font-medium hover:underline ${
                        editingStyleId === style.id ? 'text-accent' : 'text-textPrimary'
                      }`}
                      onClick={() => loadStyle(style)}
                    >
                      {style.name}{' '}
                      <span className="text-xs font-normal text-textMuted">
                        ({style.canvasWidthMm}×{style.canvasHeightMm})
                      </span>
                    </button>
                    <SecondaryButton
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteStyle(style)}
                    >
                      Delete
                    </SecondaryButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
