'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  patchNotificationSettings,
  sendMockNotification,
  type NotificationChannel,
  type NotificationItem,
  type NotificationSettings,
} from '@/features/notifications/notifications.api';
import styles from './page.module.css';

const channels: Array<{ value: NotificationChannel; label: string }> = [
  { value: 'internal', label: 'Interna' },
  { value: 'whatsapp_future', label: 'WhatsApp futuro' },
  { value: 'email_future', label: 'Email futuro' },
  { value: 'push_future', label: 'Push futuro' },
];

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [title, setTitle] = useState('Teste operacional');
  const [message, setMessage] = useState('Notificacao local gerada no DEV.');
  const [channel, setChannel] = useState<NotificationChannel>('internal');

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [notifications, config] = await Promise.all([listNotifications({ limit: 80 }), getNotificationSettings()]);
      setItems(notifications.items);
      setSettings(config.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar notificacoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSendMock(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await sendMockNotification({ title, message, channel });
      setNotice('Notificacao mock enviada.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar notificacao.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSetting(key: keyof NotificationSettings) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchNotificationSettings({ [key]: !settings[key] });
      setSettings(updated.settings);
      setNotice('Configuracao atualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar configuracao.');
    } finally {
      setSaving(false);
    }
  }

  async function markRead(id: string) {
    setError(null);
    try {
      await markNotificationRead(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true, readAt: new Date().toISOString() } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar como lida.');
    }
  }

  if (loading) {
    return <LoadingState label="Carregando notificacoes..." />;
  }

  return (
    <main className={styles.page}>
      <PageHeader
        title="Notificacoes"
        subtitle="Eventos internos e canais futuros em modo local/mock."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <section className={styles.kpis}>
        <Metric title="Total" value={items.length} />
        <Metric title="Nao lidas" value={unread} />
        <Metric title="Canais mock" value={channels.length} />
        <Metric title="Provider" value="local" />
      </section>

      <section className={styles.twoColumns}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Configurar canais</span>
            <strong>Ativacao operacional</strong>
          </div>
          <div className={styles.toggleGrid}>
            {channels.map((item) => (
              <button
                key={item.value}
                type="button"
                className={settings?.[item.value] ? styles.toggleActive : styles.toggleButton}
                onClick={() => void toggleSetting(item.value)}
                disabled={saving}
              >
                <strong>{item.label}</strong>
                <span>{settings?.[item.value] ? 'Ativo' : 'Inativo'}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Mock local</span>
            <strong>Enviar teste</strong>
          </div>
          <form className={styles.formGrid} onSubmit={onSendMock}>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titulo" />
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mensagem" />
            <Select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)}>
              {channels.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary" disabled={saving}>
              Enviar mock
            </Button>
          </form>
        </Card>
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Feed</span>
          <strong>Eventos recentes</strong>
        </div>
        {!items.length ? <EmptyState title="Sem notificacoes" description="Eventos internos aparecem aqui quando forem gerados." /> : null}
        <div className={styles.list}>
          {items.map((item) => (
            <article key={item.id} className={item.read ? styles.row : styles.rowUnread}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>
                  {item.channel} - {new Date(item.createdAt).toLocaleString('pt-BR')}
                </small>
              </div>
              <div className={styles.rowActions}>
                <Badge tone={item.read ? 'default' : 'success'}>{item.read ? 'Lida' : 'Nova'}</Badge>
                {!item.read ? <Button onClick={() => void markRead(item.id)}>Marcar lida</Button> : null}
              </div>
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </Card>
  );
}
