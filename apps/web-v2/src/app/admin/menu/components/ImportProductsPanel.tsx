import type { ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { MenuImportPreview } from '@/features/menu/menu.api';
import styles from '../page.module.css';

export function ImportProductsPanel({
  importCsv,
  onImportCsvChange,
  importPreview,
  savingAction,
  onPreview,
  onCommit,
}: {
  importCsv: string;
  onImportCsvChange: (value: string) => void;
  importPreview: MenuImportPreview | null;
  savingAction: string | null;
  onPreview: () => void;
  onCommit: () => void;
}) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportCsvChange(reader.result);
      }
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
  };

  return (
    <Card className={styles.importPanel}>
      <h2>Importar produtos CSV</h2>
      <p>Campos: name, description, category, salePrice, deliveryPrice, promotionalPrice, isActive, availableDelivery, availablePdv, availableKiosk.</p>
      <div className={styles.importFileBox}>
        <label className={styles.filePicker}>
          Escolher arquivo CSV
          <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFileChange} />
        </label>
        <span>Selecione um arquivo para preencher o conteudo abaixo antes do preview.</span>
      </div>
      <textarea
        value={importCsv}
        onChange={(event) => onImportCsvChange(event.target.value)}
        placeholder="name,description,category,salePrice,deliveryPrice,promotionalPrice,isActive,availableDelivery,availablePdv,availableKiosk"
      />
      <div className={styles.actions}>
        <Button onClick={onPreview} disabled={savingAction === 'import-preview'}>Preview</Button>
        <Button variant="primary" onClick={onCommit} disabled={!importPreview || savingAction === 'import-commit'}>
          Confirmar importacao
        </Button>
      </div>
      {importPreview ? <ImportPreview preview={importPreview} /> : null}
    </Card>
  );
}

function ImportPreview({ preview }: { preview: MenuImportPreview }) {
  return (
    <div className={styles.importPreview}>
      <strong>{preview.validRows} validas / {preview.invalidRows} invalidas</strong>
      {preview.rows.map((row) => (
        <div key={row.line} className={row.valid ? styles.importValid : styles.importInvalid}>
          <span>Linha {row.line}: {row.raw.name || '-'}</span>
          <small>{row.valid ? 'Pronta para importar' : row.errors.join(', ')}</small>
        </div>
      ))}
    </div>
  );
}
