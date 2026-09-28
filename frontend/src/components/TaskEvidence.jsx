import { useEffect } from 'react';
import { Image as ImageIcon, LoaderCircle, Paperclip, Video, X } from 'lucide-react';

export function EvidenceControls({ attachments, urls, busy, onUpload, onRemove, onPreview, taskTitle }) {
  function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onUpload(files);
  }

  return (
    <div className="evidence-controls" aria-label={`Evidence for ${taskTitle}`}>
      {attachments.map((attachment) => {
        const isVideo = attachment.type.startsWith('video/');
        const AttachmentIcon = isVideo ? Video : ImageIcon;
        return (
          <span className="evidence-chip" key={attachment.id}>
            <button className="evidence-view" type="button" title={attachment.name} aria-label={`View ${isVideo ? 'video' : 'image'} ${attachment.name}`} disabled={!urls[attachment.id]} onClick={() => onPreview(attachment)}>
              <AttachmentIcon size={13} />
            </button>
            <button className="evidence-remove" type="button" aria-label={`Remove attachment ${attachment.name}`} onClick={() => onRemove(attachment)}><X size={12} /></button>
          </span>
        );
      })}
      <label className={`evidence-upload ${busy ? 'is-uploading' : ''}`} title="Attach an image or video">
        {busy ? <LoaderCircle size={14} className="upload-spinner" /> : <Paperclip size={14} />}
        <span className="sr-only">Add image or video to {taskTitle}</span>
        <input type="file" accept="image/*,video/*" multiple disabled={busy} onChange={handleFileChange} />
      </label>
    </div>
  );
}

export function EvidencePreview({ attachment, url, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  if (!attachment || !url) return null;
  const isVideo = attachment.type.startsWith('video/');

  return (
    <div className="evidence-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="evidence-dialog" role="dialog" aria-modal="true" aria-label={`Attachment: ${attachment.name}`}>
        <div className="evidence-dialog-header"><strong>{attachment.name}</strong><button type="button" aria-label="Close attachment preview" onClick={onClose}><X size={17} /></button></div>
        {isVideo
          ? <video className="evidence-media" src={url} controls playsInline />
          : <img className="evidence-media" src={url} alt={attachment.name} />}
      </section>
    </div>
  );
}
