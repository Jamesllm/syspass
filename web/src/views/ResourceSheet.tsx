import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Confirm, Field, FieldRow, FormError, IconButton, Input, PasswordInput, Select, Sheet, TextArea, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { newId } from '../lib/format';
import { TYPES, type Client, type Resource, type ResourceType } from '../lib/types';

interface AccDraft {
  key: string;
  id?: string;
  role: string;
  username: string;
  password: string;
  hasPassword: boolean;
  notes: string;
}

const ROLE_SUGGESTIONS = ['Administrador', 'Soporte', 'Root', 'Usuario', 'Invitado', 'Gerencia', 'Sistemas'];
const TYPE_OPTIONS = TYPES.map((t) => ({ value: t.id, label: t.label }));
const blankAcc = (): AccDraft => ({ key: newId(), role: '', username: '', password: '', hasPassword: false, notes: '' });

export function ResourceSheet({ resource, clients, defaultClientId, onClose, onSaved }: {
  resource: Resource | null;
  clients: Client[];
  defaultClientId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [clientId, setClientId] = useState(resource?.clientId ?? defaultClientId ?? clients[0]?.id ?? '');
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'servidor');
  const [name, setName] = useState(resource?.name ?? '');
  const [host, setHost] = useState(resource?.host ?? '');
  const [notes, setNotes] = useState(resource?.notes ?? '');
  const [accounts, setAccounts] = useState<AccDraft[]>(
    resource?.accounts.length
      ? resource.accounts.map((a) => ({ key: a.id, id: a.id, role: a.role, username: a.username, password: '', hasPassword: a.hasPassword, notes: a.notes }))
      : [blankAcc()],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (key: string, patch: Partial<AccDraft>) => setAccounts((l) => l.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      clientId, type, name, host, notes,
      accounts: accounts.map((a) => ({
        id: a.id, role: a.role, username: a.username, notes: a.notes,
        // vacío en una cuenta existente = conservar la contraseña guardada
        ...(a.password || !a.id ? { password: a.password } : {}),
      })),
    };
    run(async () => {
      if (resource) await api(`/api/resources/${resource.id}`, { method: 'PUT', body });
      else await api('/api/resources', { body });
      toast(resource ? 'Cambios guardados' : 'Recurso creado');
      onSaved();
    });
  }

  function remove() {
    setConfirmDelete(false);
    run(async () => {
      await api(`/api/resources/${resource!.id}`, { method: 'DELETE' });
      toast('Recurso eliminado');
      onSaved();
    });
  }

  return (
    <Sheet
      title={resource ? 'Editar recurso' : 'Nuevo recurso'}
      onClose={onClose}
      footer={
        <>
          {resource && <IconButton icon={Trash2} label="Eliminar recurso" className="danger" onClick={() => setConfirmDelete(true)} />}
          <span className="grow" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="resource-form" variant="primary" loading={busy} loadingText="Guardando…">Guardar</Button>
        </>
      }
    >
      <form id="resource-form" className="sheet-body" onSubmit={save}>
        <FieldRow>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as ResourceType)} options={TYPE_OPTIONS} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Nombre">
            <Input required maxLength={120} placeholder="NAS principal" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="IP, URL o ID">
            <Input mono maxLength={255} placeholder="192.168.10.197" inputMode="url" autoCapitalize="off" autoCorrect="off"
              value={host} onChange={(e) => setHost(e.target.value)} />
          </Field>
        </FieldRow>
        <Field label="Notas">
          <TextArea rows={2} maxLength={4000} placeholder="Ubicación, puerto, a quién llamar…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="section-title">
          <h3>Cuentas</h3>
          <Button size="sm" icon={Plus} onClick={() => setAccounts((l) => [...l, blankAcc()])}>Cuenta</Button>
        </div>

        <datalist id="role-suggestions">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
        {accounts.map((a, idx) => (
          <div className="acc-edit" key={a.key}>
            <div className="acc-edit-head">
              <span>Cuenta {idx + 1}</span>
              <IconButton icon={Trash2} label="Quitar cuenta" onClick={() => setAccounts((l) => l.filter((x) => x.key !== a.key))} />
            </div>
            <FieldRow>
              <Field label="Rol">
                <Input list="role-suggestions" maxLength={60} placeholder="Administrador" value={a.role} onChange={(e) => update(a.key, { role: e.target.value })} />
              </Field>
              <Field label="Usuario o correo">
                <Input maxLength={200} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  value={a.username} onChange={(e) => update(a.key, { username: e.target.value })} />
              </Field>
            </FieldRow>
            <Field label={a.hasPassword ? 'Nueva contraseña' : 'Contraseña'}>
              <PasswordInput
                generator
                showMeter
                autoComplete="new-password"
                maxLength={500}
                placeholder={a.hasPassword ? 'Vacía = conservar la actual' : ''}
                value={a.password}
                onChange={(v) => update(a.key, { password: v })}
              />
            </Field>
            <Field label="Nota">
              <Input maxLength={1000} placeholder="Opcional" value={a.notes} onChange={(e) => update(a.key, { notes: e.target.value })} />
            </Field>
          </div>
        ))}
        <FormError>{error}</FormError>
      </form>
      {confirmDelete && resource && (
        <Confirm
          title="Eliminar recurso"
          text={<>Se eliminará <strong>{resource.name}</strong> con sus {resource.accounts.length} cuenta(s). No se puede deshacer.</>}
          action="Eliminar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </Sheet>
  );
}
