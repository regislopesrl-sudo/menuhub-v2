'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createCoupon,
  listCoupons,
  updateCoupon,
  validateCoupon,
  type Coupon,
  type CouponDiscountType,
} from '@/features/coupons/coupons.api';
import styles from './page.module.css';

const relationshipShortcuts = [
  { href: '/admin/coupons', label: 'Cupons e descontos', description: 'regras de desconto' },
  { href: '/admin/crm', label: 'Clientes', description: 'historico e perfil' },
  { href: '/admin/crm', label: 'Fidelidade', description: 'pontos e cashback' },
  { href: '/admin/reviews', label: 'Avaliacoes', description: 'nota e retorno' },
  { href: '/admin/promotions', label: 'Food marketing', description: 'campanhas' },
  { href: '/admin/customer-credit', label: 'Fiado', description: 'credito do cliente' },
];

export default function AdminCouponsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<Coupon[]>([]);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('FIXED_AMOUNT');
  const [discountValue, setDiscountValue] = useState('10');
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('0');
  const [validateCode, setValidateCode] = useState('');
  const [validateTotal, setValidateTotal] = useState('100');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await listCoupons();
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar cupons.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCoupon({
        code,
        discountType,
        discountValue: Number(discountValue),
        minimumOrderAmount: Number(minimumOrderAmount || 0),
        isActive: true,
      });
      setCode('');
      setNotice('Cupom criado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar cupom.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(coupon: Coupon) {
    setSaving(true);
    setError(null);
    try {
      await updateCoupon(coupon.id, { isActive: !coupon.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar cupom.');
    } finally {
      setSaving(false);
    }
  }

  async function onValidate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await validateCoupon({ code: validateCode, orderTotal: Number(validateTotal) });
      setNotice(`Cupom valido. Desconto: ${money(result.discountAmount)}. Total: ${money(result.totalAfterDiscount)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cupom invalido.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Carregando cupons..." />;

  return (
    <main className={styles.page}>
      <PageHeader
        title="Cupons"
        subtitle="Regras de desconto recalculadas no backend, sem duplicar cupom no mesmo pedido."
        right={<Button onClick={() => void load()}>Atualizar</Button>}
      />

      {error ? <Card className={styles.errorCard}>{error}</Card> : null}
      {notice ? <Card className={styles.noticeCard}>{notice}</Card> : null}

      <Card className={styles.commandBar}>
        {relationshipShortcuts.map((shortcut) => (
          <a key={`${shortcut.href}-${shortcut.label}`} href={shortcut.href} className={shortcut.href === '/admin/coupons' ? styles.commandActive : undefined}>
            <strong>{shortcut.label}</strong>
            <span>{shortcut.description}</span>
          </a>
        ))}
      </Card>

      <section className={styles.kpis}>
        <Metric title="Total" value={items.length} />
        <Metric title="Ativos" value={items.filter((item) => item.isActive).length} />
        <Metric title="Percentual" value={items.filter((item) => item.discountType === 'PERCENTAGE').length} />
        <Metric title="Valor fixo" value={items.filter((item) => item.discountType === 'FIXED_AMOUNT').length} />
      </section>

      <section className={styles.twoColumns}>
        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Cadastro</span>
            <strong>Novo cupom</strong>
          </div>
          <form className={styles.formGrid} onSubmit={onCreate}>
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Codigo" />
            <Select value={discountType} onChange={(event) => setDiscountType(event.target.value as CouponDiscountType)}>
              <option value="FIXED_AMOUNT">Valor fixo</option>
              <option value="PERCENTAGE">Percentual</option>
              <option value="FREE_DELIVERY">Entrega gratis</option>
            </Select>
            <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="Desconto" />
            <Input value={minimumOrderAmount} onChange={(event) => setMinimumOrderAmount(event.target.value)} placeholder="Pedido minimo" />
            <Button type="submit" variant="primary" disabled={saving}>Criar cupom</Button>
          </form>
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Validacao</span>
            <strong>Simular no backend</strong>
          </div>
          <form className={styles.formGrid} onSubmit={onValidate}>
            <Input value={validateCode} onChange={(event) => setValidateCode(event.target.value)} placeholder="Codigo" />
            <Input value={validateTotal} onChange={(event) => setValidateTotal(event.target.value)} placeholder="Total do pedido" />
            <Button type="submit" disabled={saving}>Validar</Button>
          </form>
        </Card>
      </section>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <span>Lista</span>
          <strong>Cupons cadastrados</strong>
        </div>
        {!items.length ? <EmptyState title="Sem cupons" description="Cadastre cupons para testar campanhas e descontos." /> : null}
        <div className={styles.cardsGrid}>
          {items.map((coupon) => (
            <article key={coupon.id} className={styles.itemCard}>
              <div className={styles.itemTop}>
                <strong>{coupon.code}</strong>
                <Badge tone={coupon.isActive ? 'success' : 'danger'}>{coupon.isActive ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className={styles.metaGrid}>
                <span>Tipo <b>{labelType(coupon.discountType)}</b></span>
                <span>Desconto <b>{coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : money(coupon.discountValue)}</b></span>
                <span>Minimo <b>{money(coupon.minimumOrderAmount ?? 0)}</b></span>
              </div>
              <Button onClick={() => void toggleCoupon(coupon)} disabled={saving}>{coupon.isActive ? 'Desativar' : 'Ativar'}</Button>
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

function labelType(type: CouponDiscountType) {
  if (type === 'PERCENTAGE') return 'Percentual';
  if (type === 'FREE_DELIVERY') return 'Entrega';
  return 'Valor fixo';
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
