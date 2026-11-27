import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Field, FormError, IconButton, Input, Modal, PageHeader, Panel, Select, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { cx, plural } from '../lib/format';
import { GROUP_COLORS, type Group, type Vault } from '../lib/types';

/** Grupos para ordenar los recursos (VPN, NAS, AnyDesk…) */
export function GroupsView({ vault, onChanged }: { vault: Vault; onChanged: () => void }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  return (
    <>
      <PageHeader
        title="Grupos"
        meta="Agrupan los recursos de todos los clientes: VPN, NAS, AnyDesk, correos…"
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Nuevo grupo</Button>}
      />
      <Panel>
        <ul className="group-list">
          {vault.groups.map((g) => (
            <li key={g.id}>
              <span className="led-lg" style={{ background: g.color }} aria-hidden />
              <span className="name">{g.name}</span>
              <span className="muted small">{plural(g.resourceCount, 'recurso', 'recursos')}</span>
              <IconButton icon={Pencil} label={`Editar ${g.name}`} onClick={() => setEditing(g)} />
              <IconButton icon={Trash2} label={`Eliminar ${g.name}`} onClick={() => setDeleting(g)} disabled={vault.groups.length <= 1} />
            </li>
          ))}
        </ul>
      </Panel>
      {editing && <GroupModal group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {deleting && (
        <DeleteGroupModal group={deleting} groups={vault.groups} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); onChanged(); }} />
      )}
    </>
  );
}

function GroupModal({ group, onClose, onSaved }: { group: Group | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[0]);

  function save(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      if (group) await api(`/api/groups/${group.id}`, { method: 'PUT', body: { name, color } });
      else await api('/api/groups', { body: { name, color } });
      toast(group ? 'Grupo actualizado' : 'Grupo creado');
      onSaved();
    });
  }

  return (
    <Modal title={group ? 'Editar grupo' : 'Nuevo grupo'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Nombre">
          <Input required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="AnyDesk" />
        </Field>
        <div className="field">
          <span>Color del LED</span>
          <div className="swatches">
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" className={cx('swatch small', color === c && 'on')} style={{ background: c }}
                aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <FormError>{error}</FormError>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteGroupModal({ group, groups, onClose, onDone }: { group: Group; groups: Group[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const others = groups.filter((g) => g.id !== group.id);
  const [moveTo, setMoveTo] = useState(others.find((g) => g.name === 'Otro')?.id ?? others[0]?.id ?? '');

  function remove() {
    run(async () => {
      await api(`/api/groups/${group.id}${group.resourceCount ? `?moveTo=${moveTo}` : ''}`, { method: 'DELETE' });
      toast('Grupo eliminado');
      onDone();
    });
  }

  return (
    <Modal title={`Eliminar ${group.name}`} onClose={onClose}>
      <div className="stack">
        {group.resourceCount > 0 ? (
          <Field label={`Sus ${plural(group.resourceCount, 'recurso', 'recursos')} pasan al grupo`}>
            <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} options={others.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
        ) : <p>El grupo no tiene recursos.</p>}
        <FormError>{error}</FormError>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={remove}>Eliminar grupo</Button>
        </div>
      </div>
    </Modal>
  );
}
