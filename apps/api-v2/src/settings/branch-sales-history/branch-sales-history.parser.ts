import { BadRequestException } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

export type SalesHistoryNormalizedRow = {
  saleDate: string;
  orderNumber: string | null;
  externalOrderId: string | null;
  channel: string;
  grossAmount: number;
  netAmount: number;
  discountAmount: number;
  deliveryFee: number;
  serviceFee: number;
  paymentMethod: string;
  status: string;
  branchName: string | null;
  operatorName: string | null;
  waiterName: string | null;
  customerName: string | null;
  itemsCount: number | null;
  canceledReason: string | null;
  tableNumber: string | null;
  tabNumber: string | null;
  notes: string | null;
  productId: string | null;
  productSku: string | null;
  productName: string | null;
  itemQuantity: number | null;
  itemUnitPrice: number | null;
  itemTotal: number | null;
  itemNotes: string | null;
};

export type SalesHistoryParsedRow = {
  lineNumber: number;
  raw: Record<string, string>;
  normalized: SalesHistoryNormalizedRow | null;
  messages: string[];
  valid: boolean;
};

export type SalesHistoryParsedFile = {
  delimiter: string;
  columns: string[];
  rows: SalesHistoryParsedRow[];
  validRows: number;
  invalidRows: number;
  summary: {
    periodStart: string | null;
    periodEnd: string | null;
    grossAmount: number;
    netAmount: number;
    channels: Record<string, number>;
    statuses: Record<string, number>;
    paymentMethods: Record<string, number>;
  };
};

const REQUIRED_COLUMNS = [
  'sale_date',
  'order_number',
  'channel',
  'gross_amount',
  'net_amount',
  'payment_method',
  'status',
];

const CHANNELS = new Set(['PDV', 'DELIVERY', 'KIOSK', 'WAITER_APP', 'TABLE', 'TAKEOUT', 'ADMIN', 'OTHER']);
const STATUSES = new Set(['COMPLETED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED']);
const PAYMENT_METHODS = new Set(['DINHEIRO', 'PIX', 'CARTAO', 'MULTIPLO', 'MOCK', 'OUTRO']);

const HEADER_ALIASES: Record<string, string> = {
  data: 'sale_date',
  data_venda: 'sale_date',
  data_do_pedido: 'sale_date',
  sale_date: 'sale_date',
  venda_em: 'sale_date',
  pedido: 'order_number',
  numero_pedido: 'order_number',
  numero_do_pedido: 'order_number',
  order_number: 'order_number',
  comanda_pedido: 'order_number',
  canal: 'channel',
  channel: 'channel',
  origem: 'channel',
  valor_bruto: 'gross_amount',
  bruto: 'gross_amount',
  gross_amount: 'gross_amount',
  subtotal: 'gross_amount',
  valor_liquido: 'net_amount',
  liquido: 'net_amount',
  net_amount: 'net_amount',
  total: 'net_amount',
  forma_pagamento: 'payment_method',
  pagamento: 'payment_method',
  payment_method: 'payment_method',
  metodo_pagamento: 'payment_method',
  status: 'status',
  situacao: 'status',
  filial: 'branch_name',
  loja: 'branch_name',
  branch_name: 'branch_name',
  operador: 'operator_name',
  operador_nome: 'operator_name',
  operator_name: 'operator_name',
  garcom: 'waiter_name',
  waiter_name: 'waiter_name',
  cliente: 'customer_name',
  customer_name: 'customer_name',
  qtd_itens: 'items_count',
  itens: 'items_count',
  items_count: 'items_count',
  desconto: 'discount_amount',
  discount_amount: 'discount_amount',
  taxa_entrega: 'delivery_fee',
  delivery_fee: 'delivery_fee',
  taxa_servico: 'service_fee',
  service_fee: 'service_fee',
  motivo_cancelamento: 'canceled_reason',
  canceled_reason: 'canceled_reason',
  id_externo: 'external_order_id',
  external_order_id: 'external_order_id',
  mesa: 'table_number',
  table_number: 'table_number',
  comanda: 'tab_number',
  tab_number: 'tab_number',
  observacao: 'notes',
  notes: 'notes',
  produto_id: 'product_id',
  product_id: 'product_id',
  id_produto: 'product_id',
  sku_produto: 'product_sku',
  product_sku: 'product_sku',
  codigo_produto: 'product_sku',
  pdv_code: 'product_sku',
  codigo_pdv: 'product_sku',
  produto: 'product_name',
  nome_produto: 'product_name',
  product_name: 'product_name',
  item_produto: 'product_name',
  quantidade_produto: 'item_quantity',
  item_quantity: 'item_quantity',
  qtd_produto: 'item_quantity',
  quantidade_item: 'item_quantity',
  preco_unitario: 'item_unit_price',
  valor_unitario: 'item_unit_price',
  item_unit_price: 'item_unit_price',
  unit_price: 'item_unit_price',
  total_item: 'item_total',
  valor_item: 'item_total',
  item_total: 'item_total',
  observacao_item: 'item_notes',
  item_notes: 'item_notes',
};

const CHANNEL_ALIASES: Record<string, string> = {
  BALCAO: 'PDV',
  BALCÃO: 'PDV',
  COUNTER: 'PDV',
  CAIXA: 'PDV',
  APP: 'DELIVERY',
  ENTREGA: 'DELIVERY',
  IFOOD: 'DELIVERY',
  TOTEM: 'KIOSK',
  KIOSK: 'KIOSK',
  GARCOM: 'WAITER_APP',
  GARÇOM: 'WAITER_APP',
  MESA: 'TABLE',
  RETIRADA: 'TAKEOUT',
  ADMIN_PANEL: 'ADMIN',
};

const STATUS_ALIASES: Record<string, string> = {
  CONCLUIDO: 'COMPLETED',
  CONCLUÍDO: 'COMPLETED',
  FINALIZADO: 'COMPLETED',
  PAGO: 'COMPLETED',
  ENTREGUE: 'COMPLETED',
  CANCELADO: 'CANCELED',
  CANCELADA: 'CANCELED',
  ESTORNADO: 'REFUNDED',
  REEMBOLSADO: 'REFUNDED',
  PARCIALMENTE_ESTORNADO: 'PARTIALLY_REFUNDED',
  FALHOU: 'FAILED',
  FALHA: 'FAILED',
};

const PAYMENT_ALIASES: Record<string, string> = {
  CASH: 'DINHEIRO',
  DINHEIRO: 'DINHEIRO',
  DEBITO: 'CARTAO',
  DÉBITO: 'CARTAO',
  CREDITO: 'CARTAO',
  CRÉDITO: 'CARTAO',
  CARTAO: 'CARTAO',
  CARTÃO: 'CARTAO',
  CARD: 'CARTAO',
  MULTIPLO: 'MULTIPLO',
  MÚLTIPLO: 'MULTIPLO',
  MIXED: 'MULTIPLO',
  OUTRO: 'OUTRO',
  MOCK: 'MOCK',
};

const execFileAsync = promisify(execFile);

export function parseSalesHistoryCsv(content: string, now = new Date()): SalesHistoryParsedFile {
  const normalizedContent = content.replace(/^\uFEFF/, '').trim();
  if (!normalizedContent) {
    throw new BadRequestException('Arquivo vazio.');
  }

  const headerLine = normalizedContent.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(headerLine);
  const rows = parseCsv(normalizedContent, delimiter).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length < 2) {
    throw new BadRequestException('Arquivo sem linhas de venda.');
  }

  const columns = rows[0].map((header) => normalizeHeader(header));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missingColumns.length > 0) {
    throw new BadRequestException(`Colunas obrigatorias ausentes: ${missingColumns.join(', ')}.`);
  }

  const minDate = new Date(now);
  minDate.setMonth(minDate.getMonth() - 24);
  minDate.setHours(0, 0, 0, 0);
  const maxDate = new Date(now);
  maxDate.setHours(23, 59, 59, 999);

  const parsedRows = rows.slice(1).map((row, index) => {
    const raw = buildRaw(columns, row);
    return parseSalesRow(raw, index + 2, minDate, maxDate);
  });

  const validRows = parsedRows.filter((row) => row.valid).length;
  const invalidRows = parsedRows.length - validRows;
  return {
    delimiter,
    columns,
    rows: parsedRows,
    validRows,
    invalidRows,
    summary: buildSummary(parsedRows),
  };
}

export async function parseSalesHistoryXlsx(buffer: Buffer, now = new Date()): Promise<SalesHistoryParsedFile> {
  const tempDir = await mkdtemp(join(tmpdir(), 'menuhub-sales-history-'));
  const filePath = join(tempDir, 'upload.xlsx');
  try {
    await writeFile(filePath, buffer);
    const [sheetXml, sharedStringsXml] = await Promise.all([
      unzipEntry(filePath, 'xl/worksheets/sheet1.xml').then((content) => content || unzipEntry(filePath, 'xl\\worksheets\\sheet1.xml')),
      unzipEntry(filePath, 'xl/sharedStrings.xml').then((content) => content || unzipEntry(filePath, 'xl\\sharedStrings.xml')),
    ]);
    if (!sheetXml) {
      throw new BadRequestException('Nao foi possivel ler a primeira planilha do XLSX.');
    }
    const rows = normalizeXlsxDateColumns(parseXlsxRows(sheetXml, parseSharedStrings(sharedStringsXml)));
    const csv = rows.map((row) => row.map(escapeCsvCell).join(';')).join('\n');
    return { ...parseSalesHistoryCsv(csv, now), delimiter: 'XLSX' };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function salesHistoryTemplateCsv() {
  const header = [
    'sale_date',
    'order_number',
    'channel',
    'gross_amount',
    'net_amount',
    'payment_method',
    'status',
    'branch_name',
    'operator_name',
    'customer_name',
    'items_count',
    'discount_amount',
    'delivery_fee',
    'service_fee',
    'canceled_reason',
    'external_order_id',
    'waiter_name',
    'table_number',
    'tab_number',
    'notes',
    'product_id',
    'product_sku',
    'product_name',
    'item_quantity',
    'item_unit_price',
    'item_total',
    'item_notes',
  ];
  const sample = [
    '2026-05-01',
    'PED-1001',
    'DELIVERY',
    '89.90',
    '79.90',
    'PIX',
    'COMPLETED',
    'Loja Demo',
    'Operador Caixa',
    'Cliente Exemplo',
    '3',
    '10.00',
    '7.00',
    '0.00',
    '',
    'EXT-1001',
    '',
    '',
    '',
    'Linha de exemplo. Apague antes de importar.',
    '',
    'SKU-PASTEL-001',
    'Pastel exemplo',
    '2',
    '39.95',
    '79.90',
    'Item de exemplo para importacao operacional.',
  ];
  return `${header.join(';')}\n${sample.join(';')}\n`;
}

function parseSalesRow(
  raw: Record<string, string>,
  lineNumber: number,
  minDate: Date,
  maxDate: Date,
): SalesHistoryParsedRow {
  const messages: string[] = [];
  const saleDate = parseDate(raw.sale_date);
  if (!saleDate) messages.push('Data da venda invalida.');
  if (saleDate && saleDate < minDate) messages.push('Venda fora da janela dos ultimos 24 meses.');
  if (saleDate && saleDate > maxDate) messages.push('Venda com data futura.');

  const channel = normalizeEnum(raw.channel, CHANNEL_ALIASES);
  if (!channel || !CHANNELS.has(channel)) messages.push(`Canal invalido: ${raw.channel || '(vazio)'}.`);

  const status = normalizeEnum(raw.status, STATUS_ALIASES);
  if (!status || !STATUSES.has(status)) messages.push(`Status invalido: ${raw.status || '(vazio)'}.`);

  const paymentMethod = normalizeEnum(raw.payment_method, PAYMENT_ALIASES);
  if (!paymentMethod || !PAYMENT_METHODS.has(paymentMethod)) messages.push(`Forma de pagamento invalida: ${raw.payment_method || '(vazio)'}.`);

  const grossAmount = parseMoney(raw.gross_amount);
  const netAmount = parseMoney(raw.net_amount);
  const discountAmount = parseMoney(raw.discount_amount) ?? Math.max(0, (grossAmount ?? 0) - (netAmount ?? 0));
  const deliveryFee = parseMoney(raw.delivery_fee) ?? 0;
  const serviceFee = parseMoney(raw.service_fee) ?? 0;

  if (grossAmount === null) messages.push('Valor bruto invalido.');
  if (netAmount === null) messages.push('Valor liquido invalido.');
  if ((grossAmount ?? 0) < 0 || (netAmount ?? 0) < 0) messages.push('Valores nao podem ser negativos.');

  const itemsCount = parseInteger(raw.items_count);
  if (raw.items_count && itemsCount === null) messages.push('Quantidade de itens invalida.');
  const itemQuantity = parseDecimal(raw.item_quantity);
  if (raw.item_quantity && itemQuantity === null) messages.push('Quantidade do produto invalida.');
  const itemUnitPrice = parseMoney(raw.item_unit_price);
  if (raw.item_unit_price && itemUnitPrice === null) messages.push('Preco unitario do produto invalido.');
  const itemTotal = parseMoney(raw.item_total) ?? (
    itemQuantity !== null && itemUnitPrice !== null ? roundMoney(itemQuantity * itemUnitPrice) : null
  );
  if (raw.item_total && itemTotal === null) messages.push('Total do item invalido.');
  if ((itemQuantity ?? 0) < 0 || (itemUnitPrice ?? 0) < 0 || (itemTotal ?? 0) < 0) {
    messages.push('Campos do item nao podem ser negativos.');
  }

  const orderNumber = trimToNull(raw.order_number);
  const externalOrderId = trimToNull(raw.external_order_id);
  if (!orderNumber && !externalOrderId) messages.push('Informe order_number ou external_order_id.');

  const valid = messages.length === 0 && Boolean(saleDate && channel && status && paymentMethod);
  return {
    lineNumber,
    raw,
    messages,
    valid,
    normalized: valid
      ? {
          saleDate: saleDate!.toISOString(),
          orderNumber,
          externalOrderId,
          channel: channel as string,
          grossAmount: roundMoney(grossAmount ?? 0),
          netAmount: roundMoney(netAmount ?? 0),
          discountAmount: roundMoney(discountAmount),
          deliveryFee: roundMoney(deliveryFee),
          serviceFee: roundMoney(serviceFee),
          paymentMethod: paymentMethod as string,
          status: status as string,
          branchName: trimToNull(raw.branch_name),
          operatorName: trimToNull(raw.operator_name),
          waiterName: trimToNull(raw.waiter_name),
          customerName: trimToNull(raw.customer_name),
          itemsCount,
          canceledReason: trimToNull(raw.canceled_reason),
          tableNumber: trimToNull(raw.table_number),
          tabNumber: trimToNull(raw.tab_number),
          notes: trimToNull(raw.notes),
          productId: trimToNull(raw.product_id),
          productSku: trimToNull(raw.product_sku),
          productName: trimToNull(raw.product_name),
          itemQuantity,
          itemUnitPrice,
          itemTotal,
          itemNotes: trimToNull(raw.item_notes),
        }
      : null,
  };
}

function buildRaw(columns: string[], row: string[]) {
  return columns.reduce<Record<string, string>>((acc, column, index) => {
    if (!column) return acc;
    acc[column] = (row[index] ?? '').trim();
    return acc;
  }, {});
}

function buildSummary(rows: SalesHistoryParsedRow[]): SalesHistoryParsedFile['summary'] {
  const valid = rows.filter((row) => row.valid && row.normalized);
  const dates = valid.map((row) => row.normalized!.saleDate).sort();
  return valid.reduce<SalesHistoryParsedFile['summary']>(
    (acc, row) => {
      const normalized = row.normalized!;
      acc.grossAmount = roundMoney(acc.grossAmount + normalized.grossAmount);
      acc.netAmount = roundMoney(acc.netAmount + normalized.netAmount);
      acc.channels[normalized.channel] = (acc.channels[normalized.channel] ?? 0) + 1;
      acc.statuses[normalized.status] = (acc.statuses[normalized.status] ?? 0) + 1;
      acc.paymentMethods[normalized.paymentMethod] = (acc.paymentMethods[normalized.paymentMethod] ?? 0) + 1;
      return acc;
    },
    {
      periodStart: dates[0] ?? null,
      periodEnd: dates[dates.length - 1] ?? null,
      grossAmount: 0,
      netAmount: 0,
      channels: {},
      statuses: {},
      paymentMethods: {},
    },
  );
}

function detectDelimiter(header: string) {
  const candidates = [';', ',', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: header.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ';';
}

function parseCsv(content: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

async function unzipEntry(filePath: string, entry: string) {
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', filePath, entry], { maxBuffer: 30 * 1024 * 1024 });
    return stdout;
  } catch {
    return '';
  }
}

function parseSharedStrings(xml: string) {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)).map((match) => {
    const value = Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((textMatch) => textMatch[1])
      .join('');
    return decodeXml(value);
  });
}

function parseXlsxRows(sheetXml: string, sharedStrings: string[]) {
  return Array.from(sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
    .map((rowMatch) => {
      const row: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const reference = readXmlAttribute(attrs, 'r');
        const index = reference ? columnIndex(reference.replace(/\d+/g, '')) : row.length;
        row[index] = readXlsxCellValue(attrs, body, sharedStrings);
      }
      return row.map((cell) => cell ?? '');
    })
    .filter((row) => row.some((cell) => String(cell).trim()));
}

function readXlsxCellValue(attrs: string, body: string, sharedStrings: string[]) {
  const type = readXmlAttribute(attrs, 't');
  if (type === 'inlineStr') {
    return decodeXml(
      Array.from(body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
        .map((match) => match[1])
        .join(''),
    );
  }
  const rawValue = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type === 's') {
    return sharedStrings[Number(rawValue)] ?? '';
  }
  return decodeXml(rawValue);
}

function normalizeXlsxDateColumns(rows: string[][]) {
  const headers = rows[0] ?? [];
  const dateColumns = headers
    .map((header, index) => (normalizeHeader(header) === 'sale_date' ? index : -1))
    .filter((index) => index >= 0);
  if (!dateColumns.length) return rows;
  return rows.map((row, rowIndex) => {
    if (rowIndex === 0) return row;
    const next = [...row];
    for (const index of dateColumns) {
      const value = String(next[index] ?? '').trim();
      if (/^\d+(\.\d+)?$/.test(value)) {
        next[index] = excelSerialDateToIso(Number(value));
      }
    }
    return next;
  });
}

function excelSerialDateToIso(serial: number) {
  const millis = Math.round((serial - 25569) * 86400000);
  return new Date(millis).toISOString().slice(0, 10);
}

function readXmlAttribute(attrs: string, name: string) {
  return attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
}

function columnIndex(column: string) {
  return column
    .toUpperCase()
    .split('')
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeCsvCell(value: string) {
  const normalized = String(value ?? '');
  if (/[;"\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function normalizeHeader(value: string) {
  const normalized = normalizeToken(value);
  return HEADER_ALIASES[normalized] ?? normalized;
}

function normalizeEnum(value: string | undefined, aliases: Record<string, string>) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s-]+/g, '_');
  return aliases[upper] ?? upper;
}

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseDate(value: string | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, year, month, day, hour = '12', minute = '00', second = '00'] = iso;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }
  const br = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, day, month, year, hour = '12', minute = '00', second = '00'] = br;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMoney(value: string | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const sanitized = raw.replace(/[R$\s]/g, '');
  const decimalNormalized =
    sanitized.includes(',') && sanitized.includes('.')
      ? sanitized.replace(/\./g, '').replace(',', '.')
      : sanitized.replace(',', '.');
  const number = Number(decimalNormalized);
  return Number.isFinite(number) ? roundMoney(number) : null;
}

function parseInteger(value: string | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw.replace(/\D+/g, ''));
  return Number.isInteger(number) ? number : null;
}

function parseDecimal(value: string | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const sanitized = raw.replace(/\s/g, '');
  const decimalNormalized =
    sanitized.includes(',') && sanitized.includes('.')
      ? sanitized.replace(/\./g, '').replace(',', '.')
      : sanitized.replace(',', '.');
  const number = Number(decimalNormalized);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 1000) / 1000 : null;
}

function trimToNull(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
