import {
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_UPLOAD_TYPES,
  mediaUploadResponseSchema,
} from '@ventea/shared';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { useApi } from '@/app/services';
import { describeError, useI18n, type I18n } from '@/i18n';
import { ApiError } from '@/lib/api';

import { IconImage, IconTrash } from './icons';

const MAX_MB = Math.round(MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024);

/** Problema del archivo antes de subirlo (tipo o tamaño), ya traducido; `null` si sirve. */
export function fileProblem(file: File, t: I18n['t']): string | null {
  if (!(MEDIA_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return t('upload.badType');
  }
  if (file.size > MEDIA_MAX_UPLOAD_BYTES) return t('upload.tooBig', { max: MAX_MB });
  return null;
}

/** Error de la subida en el idioma del panel, con los casos propios de imágenes. */
function uploadError(error: unknown, i18n: I18n): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return i18n.t('upload.tooBig', { max: MAX_MB });
    if (error.status === 415) return i18n.t('upload.badType');
    if (error.status === 429) return i18n.t('upload.rateLimited');
    if (error.status === 403 && !error.kind && i18n.lang !== 'es') return i18n.t('upload.quota');
  }
  return describeError(error, i18n);
}

/**
 * Imagen de la marca (foto de producto, logo, ícono): elegir o soltar un archivo, vista previa
 * local inmediata, progreso de la subida y errores traducidos. Sube a `POST /api/staff/media` y
 * entrega la URL que devuelve la API (la API solo acepta medios propios de la marca).
 */
export function ImageUpload({
  label,
  hint,
  value,
  onChange,
  onBusyChange,
  shape = 'wide',
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** Avisa mientras sube: el formulario no debería guardarse a mitad de una subida. */
  onBusyChange?: (busy: boolean) => void;
  shape?: 'wide' | 'square';
  disabled?: boolean;
}) {
  const client = useApi();
  const i18n = useI18n();
  const { t } = i18n;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== null;

  // La vista previa local se libera al terminar o al desmontar; una subida en vuelo se cancela.
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const start = async (file: File) => {
    const problem = fileProblem(file, t);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      setPreview(URL.createObjectURL(file));
    } catch {
      // Sin vista previa local se sube igual; al terminar se ve la imagen subida.
    }
    setProgress(0);
    onBusyChange?.(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const uploaded = await client.upload('/staff/media', file, {
        schema: mediaUploadResponseSchema,
        signal: controller.signal,
        onProgress: setProgress,
      });
      onChange(uploaded.url);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(uploadError(caught, i18n));
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!controller.signal.aborted) {
        setProgress(null);
        setPreview(null);
        onBusyChange?.(false);
      }
    }
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void start(file);
    if (input.current) input.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled && !uploading) onFiles(event.dataTransfer.files);
  };

  const shown = preview ?? value;
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <div className="upload" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="field__label">
        {label}
      </span>
      <div
        className={`upload__zone upload__zone--${shape}${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {shown ? (
          <img className="upload__img" src={shown} alt={t('upload.previewAlt', { label })} />
        ) : (
          <span className="upload__empty" aria-hidden="true">
            <IconImage size={28} />
          </span>
        )}
        {uploading && (
          <div className="upload__progress">
            <progress max={100} value={percent} aria-label={t('upload.progress', { label })} />
            <span aria-hidden="true">{percent}%</span>
          </div>
        )}
      </div>
      <input
        ref={input}
        id={`${id}-file`}
        className="sr-only"
        type="file"
        accept={MEDIA_UPLOAD_TYPES.join(',')}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => onFiles(event.target.files)}
      />
      <div className="upload__actions">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={disabled || uploading}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onClick={() => input.current?.click()}
        >
          {uploading ? t('upload.uploading') : value ? t('upload.replace') : t('upload.choose')}
        </button>
        {value && !uploading && (
          <button
            type="button"
            className="btn btn--quiet btn--small btn--danger-text"
            disabled={disabled}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          >
            <IconTrash size={18} />
            {t('upload.remove')}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
