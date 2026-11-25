import { useState, type FormEvent } from 'react';
import { Button, Confirm, Field, FormError, Input, Modal, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import type { Client } from '../lib/types';

export function ClientModal({ client, resourceCount, onClose, onSaved }: {
  client: Client | null;
  resourceCount: number;
  onClose: () => void;
  onSaved: (id?: string, deleted?: boolean) => void;
}) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [name, setName] = useState(client?.name ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [confirm, setConfirm] = useState(false);

  function save(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = client
        ? await api<{ id: string }>(`/api/clients/${client.id}`, { method: 'PUT', body: { name, notes } })
        : await api<{ id: string }>('/api/clients', { body: { name, notes } });
      toast(client ? 'Cliente actualizado' : 'Cliente creado');
      onSaved(r.id);
    });
  }

  function remove() {
    setConfirm(false);
    run(async () => {
      await api(`/api/clients/${client!.id}`, { method: 'DELETE' });
      toast('Cliente eliminado');
      onSaved(undefined, true);
    });
  }

  if (confirm && client) {
    return (
      <Confirm
        title="Eliminar cliente"
        text={<>Se eliminará <strong>{client.name}</strong> y sus {resourceCount} recurso(s) con todas sus cuentas. No se puede deshacer.</>}
        action="Eliminar cliente"
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    );
  }

  return (
    <Modal title={client ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Nombre">
          <Input required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Testcontrol" />
        </Field>
        <Field label="Notas">
          <Input maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contacto, sede, contrato…" />
        </Field>
        <FormError>{error}</FormError>
        <div className="modal-actions">
          {client && <Button variant="danger" className="push-left" onClick={() => setConfirm(true)}>Eliminar</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={busy}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
