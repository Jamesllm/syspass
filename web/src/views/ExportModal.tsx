import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Checkbox, FormError, Modal, useToast } from '../components';
import { useAction } from '../hooks';
import { downloadFile } from '../lib/api';
import { cx } from '../lib/format';
import { can, type User, type Vault } from '../lib/types';
import type { ExportScope } from './VaultView';

/** Exportar a Excel: lo que se está viendo (cliente y/o grupo) o todo */
export function ExportModal({ scope, vault, user, onClose }: { scope: ExportScope; vault: Vault; user: User; onClose: () => void }) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const hasScope = !!(scope.clientId || scope.groupId);
  const [target, setTarget] = useState<'scope' | 'all'>(hasScope ? 'scope' : 'all');
  const [withPasswords, setWithPasswords] = useState(false);
  const canPasswords = can(user, 'export.passwords');

  const clientName = vault.clients.find((c) => c.id === scope.clientId)?.name;
  const groupName = vault.groups.find((g) => g.id === scope.groupId)?.name;
  const scopeLabel = [clientName, groupName].filter(Boolean).join(' · ');

  function download() {
    const body = { ...(target === 'scope' ? scope : {}), includePasswords: withPasswords };
    run(async () => {
      await downloadFile('/api/export', body, 'syspass.xlsx');
      toast('Excel descargado');
      onClose();
    });
  }

  return (
    <Modal title="Exportar a Excel" onClose={onClose}>
      <div className="stack">
        <div className="radio-list" role="radiogroup" aria-label="Qué exportar">
          {hasScope && (
            <button type="button" role="radio" aria-checked={target === 'scope'} className={cx('radio-card', target === 'scope' && 'on')} onClick={() => setTarget('scope')}>
              <strong>Lo que estoy viendo</strong>
              <span className="sec small">{scopeLabel}</span>
            </button>
          )}
          <button type="button" role="radio" aria-checked={target === 'all'} className={cx('radio-card', target === 'all' && 'on')} onClick={() => setTarget('all')}>
            <strong>Todo</strong>
            <span className="sec small">Todos los clientes y grupos a los que tienes acceso</span>
          </button>
        </div>

        {canPasswords && (
          <div className={cx('pw-export', withPasswords && 'on')}>
            <Checkbox label="Incluir las contraseñas" checked={withPasswords} onChange={(e) => setWithPasswords(e.target.checked)} />
            {withPasswords && (
              <span className="small">El archivo tendrá las contraseñas sin cifrar y la descarga queda registrada en la auditoría. Guárdalo en un lugar seguro y bórralo cuando ya no lo necesites</span>
            )}
          </div>
        )}

        <FormError>{error}</FormError>
        <div className="modal-actions">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Download} loading={busy} loadingText="Generando…" onClick={download}>Descargar Excel</Button>
        </div>
      </div>
    </Modal>
  );
}
