import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import {
  Contact,
  ContactCategory,
  Entry,
  EntryType,
  Invoice,
  InvoiceKind,
  InvoiceLine,
  InventoryGroupMember,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventorySyncGroup,
  VoucherType,
  PaymentMode,
} from '../types';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
  'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

type LedgerProps = {
  userId: string;
  displayName: string;
};

type AppSection = 'dashboard' | 'inventory' | 'invoices' | 'reports';
type InventoryView = 'list' | 'group';
type ReportsView = 'hub' | 'daybook' | 'cashbook' | 'trial_balance' | 'profit_loss' | 'balance_sheet' | 'outstanding' | 'stock_summary';

type InvoiceLineDraft = {
  item_id: string;
  quantity: string;
  rate: string;
};

const INVENTORY_UNITS = [
  'NOS',
  'PCS',
  'KG',
  'G',
  'MG',
  'L',
  'ML',
  'MTR',
  'CM',
  'MM',
  'FT',
  'IN',
  'BOX',
  'PACK',
  'DOZEN',
  'SET',
  'BAG',
  'BOTTLE',
  'CAN',
  'JAR',
  'ROLL',
  'PAIR',
  'CARTON',
  'TON',
];

const CONTACT_CATEGORIES: Array<{ value: ContactCategory; label: string }> = [
  { value: 'sundry_creditor', label: 'Sundry Creditor' },
  { value: 'sundry_debitor', label: 'Sundry Debtor' },
  { value: 'cash_in_hand', label: 'Cash-in-Hand' },
  { value: 'capital_account', label: 'Capital Account' },
  { value: 'loans_liability', label: 'Loans (Liability)' },
  { value: 'current_liabilities', label: 'Current Liabilities' },
  { value: 'fixed_assets', label: 'Fixed Assets' },
  { value: 'investments', label: 'Investments' },
  { value: 'current_assets', label: 'Current Assets' },
  { value: 'misc_expenses_asset', label: 'Miscellaneous Expenses (Asset)' },
  { value: 'sales_accounts', label: 'Sales Accounts' },
  { value: 'purchase_accounts', label: 'Purchase Accounts' },
  { value: 'direct_income', label: 'Direct Income' },
  { value: 'indirect_income', label: 'Indirect Income' },
  { value: 'direct_expenses', label: 'Direct Expenses' },
  { value: 'indirect_expenses', label: 'Indirect Expenses' },
  { value: 'individual', label: 'Individual' },
];

function formatCompactQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
}


export function Ledger({ userId, displayName }: LedgerProps) {
  const toast = useToast();
  const [section, setSection] = useState<AppSection>('dashboard');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceLinesData, setInvoiceLinesData] = useState<InvoiceLine[]>([]);
  const [activeInventoryGroup, setActiveInventoryGroup] = useState<InventorySyncGroup | null>(null);
  const [inventoryGroupMembers, setInventoryGroupMembers] = useState<InventoryGroupMember[]>([]);
  const [inventoryView, setInventoryView] = useState<InventoryView>('list');
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupJoinCode, setGroupJoinCode] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactCategory, setContactCategory] = useState<ContactCategory>('individual');
  const [searchText, setSearchText] = useState('');
  const [inventorySearchText, setInventorySearchText] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('ALL');
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>('purchase');
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [activeVoucherType, setActiveVoucherType] = useState<VoucherType | null>(null);
  const [voucherParty, setVoucherParty] = useState('');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [voucherNote, setVoucherNote] = useState('');
  const [voucherPaymentMode, setVoucherPaymentMode] = useState<PaymentMode>('cash');
  const [journalDebitLedger, setJournalDebitLedger] = useState('');
  const [journalCreditLedger, setJournalCreditLedger] = useState('');
  const [voucherPartySearch, setVoucherPartySearch] = useState('');
  const [voucherShowPartyList, setVoucherShowPartyList] = useState(false);
  const [journalDebitSearch, setJournalDebitSearch] = useState('');
  const [journalCreditSearch, setJournalCreditSearch] = useState('');
  const [journalShowDebitList, setJournalShowDebitList] = useState(false);
  const [journalShowCreditList, setJournalShowCreditList] = useState(false);
  const [invoiceParty, setInvoiceParty] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceSettlementAmount, setInvoiceSettlementAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineDraft[]>([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invoiceActionTargetId, setInvoiceActionTargetId] = useState<string | null>(null);
  const [invoiceLineDraft, setInvoiceLineDraft] = useState<InvoiceLineDraft>({
    item_id: '',
    quantity: '',
    rate: '',
  });
  const [showAddPartyForm, setShowAddPartyForm] = useState(false);
  const [showAddInventoryForm, setShowAddInventoryForm] = useState(false);
  const [inventoryCategoryCustom, setInventoryCategoryCustom] = useState('');
  const [editInventoryCategoryCustom, setEditInventoryCategoryCustom] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<
    | { kind: 'contact'; id: string; name: string }
    | { kind: 'entry'; id: string }
    | null
  >(null);
  const [editContactDraft, setEditContactDraft] = useState<{
    id: string;
    name: string;
    phone: string;
    category: ContactCategory;
  } | null>(null);
  const [editInventoryItemDraft, setEditInventoryItemDraft] = useState<{
    id: string;
    name: string;
    unit: string;
    category: string;
    barcode: string;
  } | null>(null);
  const [entryDraft, setEntryDraft] = useState<{
    type: EntryType;
    amount: string;
    note: string;
    entryDate: string;
  } | null>(null);
  const [inventoryDraft, setInventoryDraft] = useState<{
    type: InventoryMovementType;
    quantity: string;
    note: string;
    movementDate: string;
  } | null>(null);
  const [inventoryItemDraft, setInventoryItemDraft] = useState<{
    name: string;
    unit: string;
    category: string;
    barcode: string;
  }>({
    name: '',
    unit: 'NOS',
    category: '',
    barcode: '',
  });
  const [entryActionDraft, setEntryActionDraft] = useState<{
    id: string;
    amount: string;
    note: string;
    type: EntryType;
    entryDate: string;
  } | null>(null);
  const [movementActionDraft, setMovementActionDraft] = useState<{
    id: string;
    quantity: string;
    note: string;
    type: InventoryMovementType;
    movementDate: string;
  } | null>(null);
  const [barcodeScanTarget, setBarcodeScanTarget] = useState<'search' | 'add-item' | 'edit-item' | 'invoice-item' | null>(null);
  const [barcodeScanError, setBarcodeScanError] = useState<string | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const scannerImageInputRef = useRef<HTMLInputElement | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);

  // Reports state
  const [reportsView, setReportsView] = useState<ReportsView>('hub');
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportDateTo, setReportDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [outstandingTab, setOutstandingTab] = useState<'receivable' | 'payable'>('receivable');

  // Contra voucher state
  const [contraFromLedger, setContraFromLedger] = useState('');
  const [contraToLedger, setContraToLedger] = useState('');
  const [contraFromSearch, setContraFromSearch] = useState('');
  const [contraToSearch, setContraToSearch] = useState('');
  const [contraShowFromList, setContraShowFromList] = useState(false);
  const [contraShowToList, setContraShowToList] = useState(false);

  // Transaction history search/filter
  const [txnSearch, setTxnSearch] = useState('');

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.contact_id === selectedContactId),
    [entries, selectedContactId]
  );

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === selectedContactId) ?? null,
    [contacts, selectedContactId]
  );
  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => item.id === selectedInventoryItemId) ?? null,
    [inventoryItems, selectedInventoryItemId]
  );

  const contactBalances = useMemo(() => {
    return contacts.map((contact) => {
      const balance = entries
        .filter((entry) => entry.contact_id === contact.id)
        .reduce((total, entry) => {
          return entry.type === 'gave' ? total + entry.amount : total - entry.amount;
        }, 0);

      return { ...contact, balance };
    });
  }, [contacts, entries]);

  const totals = useMemo(() => {
    const youHaveToGet = contactBalances
      .filter((contact) => contact.balance > 0)
      .reduce((total, contact) => total + contact.balance, 0);

    const youHaveToGive = contactBalances
      .filter((contact) => contact.balance < 0)
      .reduce((total, contact) => total + Math.abs(contact.balance), 0);

    const totalBalance = youHaveToGet - youHaveToGive;
    return { totalBalance, youHaveToGet, youHaveToGive };
  }, [contactBalances]);

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return contactBalances;

    return contactBalances.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [contactBalances, searchText]);

  const selectedBalance = useMemo(
    () =>
      selectedEntries.reduce((total, entry) => {
        return entry.type === 'gave' ? total + entry.amount : total - entry.amount;
      }, 0),
    [selectedEntries]
  );

  const selectedEntriesWithBalance = useMemo(() => {
    const chronological = [...selectedEntries].sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let runningBalance = 0;
    const withBalance = chronological.map((entry) => {
      runningBalance += entry.type === 'gave' ? entry.amount : -entry.amount;
      return { ...entry, runningBalance };
    });

    return withBalance.reverse();
  }, [selectedEntries]);

  const inventoryItemsWithStock = useMemo(() => {
    return inventoryItems.map((item) => {
      const stock = inventoryMovements
        .filter((movement) => movement.item_id === item.id)
        .reduce((total, movement) => {
          return movement.type === 'in' ? total + movement.quantity : total - movement.quantity;
        }, 0);

      return { ...item, stock };
    });
  }, [inventoryItems, inventoryMovements]);

  const filteredInventoryItems = useMemo(() => {
    const query = inventorySearchText.trim().toLowerCase();
    return inventoryItemsWithStock.filter((item) => {
      const matchesText =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.barcode ?? '').toLowerCase().includes(query);
      const matchesCategory =
        inventoryCategoryFilter === 'ALL' ||
        (item.category ?? '').toLowerCase() === inventoryCategoryFilter.toLowerCase();
      return matchesText && matchesCategory;
    });
  }, [inventoryItemsWithStock, inventorySearchText, inventoryCategoryFilter]);

  const inventoryCategories = useMemo(() => {
    return [...new Set(inventoryItems.map((item) => (item.category ?? '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [inventoryItems]);

  const inventoryTotals = useMemo(() => {
    const totalUnits = inventoryItemsWithStock.reduce((total, item) => total + item.stock, 0);
    const lowStock = inventoryItemsWithStock.filter((item) => item.stock > 0 && item.stock <= 5).length;
    const outOfStock = inventoryItemsWithStock.filter((item) => item.stock <= 0).length;
    return {
      totalUnits,
      totalItems: inventoryItemsWithStock.length,
      lowStock,
      outOfStock,
    };
  }, [inventoryItemsWithStock]);

  const selectedInventoryMovements = useMemo(() => {
    return inventoryMovements.filter((movement) => movement.item_id === selectedInventoryItemId);
  }, [inventoryMovements, selectedInventoryItemId]);

  const selectedInventoryStock = useMemo(() => {
    return selectedInventoryMovements.reduce((total, movement) => {
      return movement.type === 'in' ? total + movement.quantity : total - movement.quantity;
    }, 0);
  }, [selectedInventoryMovements]);



  // Show all contacts — no category restriction
  const invoiceEligibleContacts = contacts;

  const [invoicePartySearch, setInvoicePartySearch] = useState('');
  const [invoicePartyDropdownOpen, setInvoicePartyDropdownOpen] = useState(false);
  const [invoiceItemSearch, setInvoiceItemSearch] = useState('');
  const [invoiceItemDropdownOpen, setInvoiceItemDropdownOpen] = useState(false);

  const filteredInvoiceParties = useMemo(() => {
    const q = invoicePartySearch.toLowerCase();
    if (!q) return invoiceEligibleContacts;
    return invoiceEligibleContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [invoiceEligibleContacts, invoicePartySearch]);

  const filteredInvoiceItems = useMemo(() => {
    const q = invoiceItemSearch.toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter(
      (item) => item.name.toLowerCase().includes(q) || (item.barcode ?? '').toLowerCase().includes(q)
    );
  }, [inventoryItems, invoiceItemSearch]);

  useEffect(() => {
    if (!showInvoiceForm) return;
    if (!invoiceParty) return;
    const allowed = contacts.some(
      (contact) => contact.name.trim().toLowerCase() === invoiceParty.trim().toLowerCase()
    );
    if (!allowed) {
      setInvoiceParty('');
    }
  }, [contacts, invoiceParty, showInvoiceForm]);

  const invoiceHistory = useMemo(() => {
    const linesByInvoiceId = new Map<string, InvoiceLine[]>();
    for (const line of invoiceLinesData) {
      const existing = linesByInvoiceId.get(line.invoice_id);
      if (existing) {
        existing.push(line);
      } else {
        linesByInvoiceId.set(line.invoice_id, [line]);
      }
    }

    return invoices
      .filter((invoice) => invoice.status === 'posted')
      .map((invoice) => {
        const invoiceLines = linesByInvoiceId.get(invoice.id) ?? [];
        const itemSummary = invoiceLines
          .map((line) => `${line.item_name} x ${formatCompactQuantity(line.quantity)}`)
          .join(', ');
        return {
          id: invoice.id,
          kind: invoice.kind,
          party: invoice.party_name,
          date: invoice.invoice_date,
          totalValue: invoice.total_amount,
          lineCount: invoiceLines.length,
          itemSummary,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoiceLinesData, invoices]);

  const selectedInvoiceDetails = useMemo(() => {
    if (!invoiceActionTargetId) return null;
    const invoice = invoices.find((entry) => entry.id === invoiceActionTargetId);
    if (!invoice) return null;

    const lines = invoiceLinesData
      .filter((line) => line.invoice_id === invoice.id)
      .map((line) => ({
        name: line.item_name,
        quantity: line.quantity,
        rate: line.rate,
      }));

    return {
      id: invoice.id,
      kind: invoice.kind,
      party: invoice.party_name,
      date: invoice.invoice_date,
      note: invoice.note ?? null,
      lines,
      totalValue: invoice.total_amount,
    };
  }, [invoiceActionTargetId, invoiceLinesData, invoices]);

  const invoiceTotal = useMemo(() => {
    return invoiceLines.reduce((sum, line) => {
      const qty = Number(line.quantity) || 0;
      const rate = Number(line.rate) || 0;
      return sum + qty * rate;
    }, 0);
  }, [invoiceLines]);

  // ─── Unified Transaction History (all voucher types) ───
  const unifiedTransactions = useMemo(() => {
    const txns: Array<{
      id: string;
      type: 'sale' | 'purchase' | 'payment' | 'receipt' | 'journal' | 'contra' | 'credit_note' | 'debit_note' | 'entry';
      party: string;
      date: string;
      amount: number;
      note: string;
      invoiceId?: string;
    }> = [];

    // Invoices
    for (const inv of invoiceHistory) {
      txns.push({
        id: inv.id,
        type: inv.kind === 'sale' ? 'sale' : 'purchase',
        party: inv.party,
        date: inv.date,
        amount: inv.totalValue,
        note: inv.itemSummary || '',
        invoiceId: inv.id,
      });
    }

    // Entries not tied to invoices
    for (const entry of entries) {
      if (entry.invoice_id) continue;
      const contact = contacts.find(c => c.id === entry.contact_id);
      const pName = contact?.name ?? 'Unknown';
      const note = entry.note ?? '';
      let eType: typeof txns[0]['type'] = 'entry';
      if (note.startsWith('Cash') || note.startsWith('Bank') || note.startsWith('Upi')) {
        eType = entry.type === 'gave' ? 'payment' : 'receipt';
      } else if (note.startsWith('Journal')) {
        eType = 'journal';
      } else if (note.startsWith('Contra')) {
        eType = 'contra';
      } else if (note.startsWith('Credit Note')) {
        eType = 'credit_note';
      } else if (note.startsWith('Debit Note')) {
        eType = 'debit_note';
      } else {
        eType = entry.type === 'gave' ? 'payment' : 'receipt';
      }
      txns.push({ id: entry.id, type: eType, party: pName, date: entry.entry_date, amount: entry.amount, note });
    }

    return txns
      .filter(t => {
        if (!txnSearch.trim()) return true;
        return t.party.toLowerCase().includes(txnSearch.toLowerCase()) || t.note.toLowerCase().includes(txnSearch.toLowerCase());
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoiceHistory, entries, contacts, txnSearch]);

  // ─── REPORTS: Day Book ───
  const dayBookEntries = useMemo(() => {
    return entries
      .filter(e => e.entry_date >= reportDateFrom && e.entry_date <= reportDateTo)
      .map(e => {
        const contact = contacts.find(c => c.id === e.contact_id);
        return { ...e, partyName: contact?.name ?? 'Unknown', category: contact?.category ?? 'individual' };
      })
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [entries, contacts, reportDateFrom, reportDateTo]);

  // ─── REPORTS: Cash/Bank Book ───
  const cashBankBookEntries = useMemo(() => {
    const cashBankCategories = new Set(['cash_in_hand', 'current_assets']);
    const cashBankContacts = contacts.filter(c => cashBankCategories.has(c.category));
    const cashBankContactIds = new Set(cashBankContacts.map(c => c.id));
    return entries
      .filter(e => cashBankContactIds.has(e.contact_id) && e.entry_date >= reportDateFrom && e.entry_date <= reportDateTo)
      .map(e => {
        const contact = contacts.find(c => c.id === e.contact_id);
        return { ...e, partyName: contact?.name ?? 'Unknown' };
      })
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  }, [entries, contacts, reportDateFrom, reportDateTo]);

  // ─── REPORTS: Trial Balance ───
  const trialBalance = useMemo(() => {
    const ledgerMap = new Map<string, { name: string; category: string; debit: number; credit: number }>();
    for (const contact of contacts) {
      ledgerMap.set(contact.id, { name: contact.name, category: contact.category, debit: 0, credit: 0 });
    }
    for (const entry of entries) {
      const ledger = ledgerMap.get(entry.contact_id);
      if (!ledger) continue;
      if (entry.type === 'gave') ledger.debit += entry.amount;
      else ledger.credit += entry.amount;
    }
    const rows = Array.from(ledgerMap.values()).filter(r => r.debit > 0 || r.credit > 0);
    const totalDr = rows.reduce((s, r) => s + r.debit, 0);
    const totalCr = rows.reduce((s, r) => s + r.credit, 0);
    return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), totalDr, totalCr };
  }, [contacts, entries]);

  // ─── REPORTS: Profit & Loss ───
  const profitLoss = useMemo(() => {
    const incomeCategories = new Set(['sales_accounts', 'direct_income', 'indirect_income']);
    const expenseCategories = new Set(['purchase_accounts', 'direct_expenses', 'indirect_expenses']);
    const income: Array<{ name: string; amount: number }> = [];
    const expenses: Array<{ name: string; amount: number }> = [];

    for (const contact of contacts) {
      const balance = entries
        .filter(e => e.contact_id === contact.id)
        .reduce((t, e) => e.type === 'gave' ? t + e.amount : t - e.amount, 0);
      if (balance === 0) continue;
      if (incomeCategories.has(contact.category)) {
        income.push({ name: contact.name, amount: Math.abs(balance) });
      } else if (expenseCategories.has(contact.category)) {
        expenses.push({ name: contact.name, amount: Math.abs(balance) });
      }
    }

    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
    const netProfit = totalIncome - totalExpenses;
    return { income, expenses, totalIncome, totalExpenses, netProfit };
  }, [contacts, entries]);

  // ─── REPORTS: Balance Sheet ───
  const balanceSheet = useMemo(() => {
    const assetCategories = new Set(['cash_in_hand', 'fixed_assets', 'investments', 'current_assets', 'misc_expenses_asset', 'sundry_debitor']);
    const liabilityCategories = new Set(['capital_account', 'loans_liability', 'current_liabilities', 'sundry_creditor']);

    const assets: Array<{ name: string; amount: number }> = [];
    const liabilities: Array<{ name: string; amount: number }> = [];

    for (const contact of contacts) {
      const balance = entries
        .filter(e => e.contact_id === contact.id)
        .reduce((t, e) => e.type === 'gave' ? t + e.amount : t - e.amount, 0);
      if (balance === 0) continue;
      if (assetCategories.has(contact.category)) {
        assets.push({ name: contact.name, amount: Math.abs(balance) });
      } else if (liabilityCategories.has(contact.category)) {
        liabilities.push({ name: contact.name, amount: Math.abs(balance) });
      }
    }

    const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
    return { assets, liabilities, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, plNetProfit: profitLoss.netProfit };
  }, [contacts, entries, profitLoss.netProfit]);

  // ─── REPORTS: Outstanding (Receivables & Payables) ───
  const outstanding = useMemo(() => {
    const receivables: Array<{ name: string; amount: number; phone: string | null }> = [];
    const payables: Array<{ name: string; amount: number; phone: string | null }> = [];
    for (const cb of contactBalances) {
      if (cb.category === 'sundry_debitor' || cb.category === 'individual') {
        if (cb.balance > 0) receivables.push({ name: cb.name, amount: cb.balance, phone: cb.phone });
        else if (cb.balance < 0) payables.push({ name: cb.name, amount: Math.abs(cb.balance), phone: cb.phone });
      } else if (cb.category === 'sundry_creditor') {
        if (cb.balance < 0) payables.push({ name: cb.name, amount: Math.abs(cb.balance), phone: cb.phone });
        else if (cb.balance > 0) receivables.push({ name: cb.name, amount: cb.balance, phone: cb.phone });
      }
    }
    const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);
    const totalPayable = payables.reduce((s, r) => s + r.amount, 0);
    return {
      receivables: receivables.sort((a, b) => b.amount - a.amount),
      payables: payables.sort((a, b) => b.amount - a.amount),
      totalReceivable,
      totalPayable,
    };
  }, [contactBalances]);

  // ─── REPORTS: Stock Summary ───
  const stockSummary = useMemo(() => {
    const byCategory = new Map<string, Array<{ name: string; unit: string; stock: number }>>();
    for (const item of inventoryItemsWithStock) {
      const cat = item.category || 'Uncategorized';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push({ name: item.name, unit: item.unit ?? 'NOS', stock: item.stock });
    }
    const categories = Array.from(byCategory.entries())
      .map(([category, items]) => ({ category, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.category.localeCompare(b.category));
    const totalItems = inventoryItemsWithStock.length;
    const totalStock = inventoryItemsWithStock.reduce((s, i) => s + i.stock, 0);
    return { categories, totalItems, totalStock };
  }, [inventoryItemsWithStock]);


  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const inventoryFilter = activeInventoryGroup?.id
      ? `group_id=eq.${activeInventoryGroup.id}`
      : `owner_id=eq.${userId}`;

    const channel = supabase
      .channel(`inventory-live-${userId}-${activeInventoryGroup?.id ?? 'personal'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_movements',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoice_lines',
          filter: inventoryFilter,
        },
        () => {
          void loadData(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_sync_group_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadData(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, activeInventoryGroup?.id]);

  async function loadData(silent = false) {
    if (!silent) {
      setLoading(true);
    }

    try {
      setLoadError(null);
      const [contactsRes, entriesRes, membershipsRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        supabase
          .from('entries')
          .select('*')
          .eq('owner_id', userId)
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('inventory_sync_group_members')
          .select(
            `
              group_id,
              inventory_sync_groups!inner (
                id,
                owner_id,
                name,
                join_code,
                created_at
              )
            `
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1),
      ]);

      const membershipGroupRaw = (membershipsRes.data?.[0] as { inventory_sync_groups?: InventorySyncGroup } | undefined)
        ?.inventory_sync_groups;
      const membershipGroup = membershipGroupRaw ?? null;
      setActiveInventoryGroup(membershipGroup);
      setGroupNameDraft(membershipGroup?.name ?? '');

      if (membershipGroup?.id) {
        const { data: membersData, error: membersError } = await supabase.rpc('get_inventory_group_members', {
          target_group_id: membershipGroup.id,
        });
        if (membersError) {
          setLoadError(membersError.message);
        } else {
          setInventoryGroupMembers((membersData ?? []) as InventoryGroupMember[]);
        }
      } else {
        setInventoryGroupMembers([]);
      }

      const itemsQuery = supabase.from('inventory_items').select('*').order('created_at', { ascending: false });
      const movementsQuery = supabase
        .from('inventory_movements')
        .select('*')
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false });
      const invoicesQuery = supabase
        .from('invoices')
        .select('*')
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });
      const invoiceLinesQuery = supabase.from('invoice_lines').select('*').order('created_at', { ascending: false });

      const [itemsRes, movementsRes, invoicesRes, invoiceLinesRes] = await Promise.all([
        membershipGroup?.id
          ? itemsQuery.eq('group_id', membershipGroup.id)
          : itemsQuery.eq('owner_id', userId).is('group_id', null),
        membershipGroup?.id
          ? movementsQuery.eq('group_id', membershipGroup.id)
          : movementsQuery.eq('owner_id', userId).is('group_id', null),
        membershipGroup?.id
          ? invoicesQuery.eq('group_id', membershipGroup.id)
          : invoicesQuery.eq('owner_id', userId).is('group_id', null),
        membershipGroup?.id
          ? invoiceLinesQuery.eq('group_id', membershipGroup.id)
          : invoiceLinesQuery.eq('owner_id', userId).is('group_id', null),
      ]);

      const message =
        contactsRes.error?.message ??
        entriesRes.error?.message ??
        membershipsRes.error?.message ??
        itemsRes.error?.message ??
        movementsRes.error?.message ??
        invoicesRes.error?.message ??
        invoiceLinesRes.error?.message ??
        null;

      if (message) {
        setLoadError(message);
        if (silent) {
          toast.show(message, 'error');
        }
        return;
      }

      const loadedContacts = (contactsRes.data ?? []) as Contact[];
      const loadedEntries = (entriesRes.data ?? []).map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
      })) as Entry[];
      const loadedItems = (itemsRes.data ?? []) as InventoryItem[];
      const loadedMovements = (movementsRes.data ?? []).map((movement) => ({
        ...movement,
        quantity: Number(movement.quantity),
      })) as InventoryMovement[];
      const loadedInvoices = (invoicesRes.data ?? []).map((invoice) => ({
        ...invoice,
        total_amount: Number(invoice.total_amount),
        settlement_amount: Number(invoice.settlement_amount),
      })) as Invoice[];
      const loadedInvoiceLines = (invoiceLinesRes.data ?? []).map((line) => ({
        ...line,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        amount: Number(line.amount),
      })) as InvoiceLine[];

      setContacts(loadedContacts);
      setEntries(loadedEntries);
      setInventoryItems(loadedItems);
      setInventoryMovements(loadedMovements);
      setInvoices(loadedInvoices);
      setInvoiceLinesData(loadedInvoiceLines);

      if (selectedContactId && !loadedContacts.some((contact) => contact.id === selectedContactId)) {
        setSelectedContactId('');
      }
      if (selectedInventoryItemId && !loadedItems.some((item) => item.id === selectedInventoryItemId)) {
        setSelectedInventoryItemId('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load data';
      setLoadError(message);
      if (silent) {
        toast.show(message, 'error');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const { error } = await supabase.from('contacts').insert({
      owner_id: userId,
      name: name.trim(),
      phone: phone.trim() || null,
      category: contactCategory,
    });

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setName('');
    setPhone('');
    setContactCategory('individual');
    setShowAddPartyForm(false);
    await loadData(true);
  }

  function startEntry(entryType: EntryType) {
    setEntryDraft({
      type: entryType,
      amount: '',
      note: '',
      entryDate: new Date().toISOString().slice(0, 10),
    });
  }

  function startInventoryMovement(type: InventoryMovementType) {
    if (!selectedInventoryItem) return;
    setInventoryDraft({
      type,
      quantity: '',
      note: '',
      movementDate: new Date().toISOString().slice(0, 10),
    });
  }

  async function leaveInventorySyncGroup() {
    if (!activeInventoryGroup) return;

    const { error } = await supabase
      .from('inventory_sync_group_members')
      .delete()
      .eq('group_id', activeInventoryGroup.id)
      .eq('user_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setSelectedInventoryItemId('');
    setInventoryView('list');
    await loadData(true);
  }

  function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async function createInventoryGroup() {
    const trimmedName = groupNameDraft.trim() || `${displayName}'s Group`;

    const { data: groupData, error: groupError } = await supabase
      .from('inventory_sync_groups')
      .insert({
        owner_id: userId,
        name: trimmedName,
        join_code: generateJoinCode(),
      })
      .select('*')
      .single();

    if (groupError || !groupData) {
      toast.show(groupError?.message ?? 'Failed to create group', 'error');
      return;
    }

    const { error: memberError } = await supabase.from('inventory_sync_group_members').insert({
      group_id: groupData.id,
      user_id: userId,
      role: 'owner',
    });

    if (memberError) {
      toast.show(memberError.message, 'error');
      return;
    }

    await loadData(true);
  }

  async function joinInventoryGroup() {
    const code = groupJoinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    if (!code) {
      toast.show('Enter a group code', 'error');
      return;
    }

    const { data, error } = await supabase.rpc('join_inventory_group_by_code', { input_code: code });
    if (error) {
      toast.show(error.message, 'error');
      return;
    }
    if (!data) {
      toast.show('Group code not found', 'error');
      return;
    }

    setGroupJoinCode('');
    await loadData(true);
  }

  async function saveGroupName() {
    if (!activeInventoryGroup) return;
    const trimmedName = groupNameDraft.trim();
    if (!trimmedName) {
      toast.show('Group name cannot be empty', 'error');
      return;
    }

    const { error } = await supabase
      .from('inventory_sync_groups')
      .update({ name: trimmedName })
      .eq('id', activeInventoryGroup.id)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }
    toast.show('Group name changed successfully', 'success');
    await loadData(true);
  }

  async function deleteGroup() {
    if (!activeInventoryGroup) return;
    const { error } = await supabase
      .from('inventory_sync_groups')
      .delete()
      .eq('id', activeInventoryGroup.id)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setInventoryView('list');
    await loadData(true);
  }

  async function addInventoryItem(e: FormEvent) {
    e.preventDefault();
    const trimmedName = inventoryItemDraft.name.trim();
    if (!trimmedName) {
      toast.show('Item name is required', 'error');
      return;
    }
    const resolvedCategory =
      inventoryItemDraft.category === '__custom__'
        ? inventoryCategoryCustom.trim()
        : inventoryItemDraft.category.trim();

    const { error } = await supabase.from('inventory_items').insert({
      owner_id: userId,
      group_id: activeInventoryGroup?.id ?? null,
      name: trimmedName,
      unit: inventoryItemDraft.unit.trim().toUpperCase() || null,
      category: resolvedCategory || null,
      barcode: inventoryItemDraft.barcode.trim() || null,
    });

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setInventoryItemDraft({ name: '', unit: 'NOS', category: '', barcode: '' });
    setInventoryCategoryCustom('');
    setShowAddInventoryForm(false);
    await loadData(true);
  }

  async function saveEntryDraft() {
    if (!selectedContactId || !entryDraft) return;

    const parsedAmount = Number(entryDraft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.show('Enter a valid amount', 'error');
      return;
    }

    const { error } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: selectedContactId,
      type: entryDraft.type,
      amount: parsedAmount,
      note: entryDraft.note.trim() || null,
      entry_date: entryDraft.entryDate,
    });

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setEntryDraft(null);
    await loadData(true);
  }

  async function saveInventoryDraft() {
    if (!inventoryDraft || !selectedInventoryItem) return;
    const quantity = Number(inventoryDraft.quantity);

    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.show('Enter a valid quantity', 'error');
      return;
    }

    const { error } = await supabase.from('inventory_movements').insert({
      owner_id: userId,
      group_id: selectedInventoryItem.group_id ?? null,
      item_id: selectedInventoryItem.id,
      type: inventoryDraft.type,
      quantity,
      note: inventoryDraft.note.trim() || null,
      movement_date: inventoryDraft.movementDate,
    });

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setInventoryDraft(null);
    await loadData(true);
  }

  function addInvoiceLine() {
    if (!invoiceLineDraft.item_id) {
      toast.show('Select an item', 'error');
      return;
    }
    const quantity = Number(invoiceLineDraft.quantity);
    const rate = Number(invoiceLineDraft.rate);
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.show('Enter valid quantity', 'error');
      return;
    }
    if (Number.isNaN(rate) || rate < 0) {
      toast.show('Enter valid rate', 'error');
      return;
    }

    setInvoiceLines((prev) => [...prev, { ...invoiceLineDraft }]);
    setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
  }

  function removeInvoiceLine(index: number) {
    setInvoiceLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function resetVoucherForm() {
    setVoucherParty('');
    setVoucherAmount('');
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setVoucherNote('');
    setVoucherPaymentMode('cash');
    setJournalDebitLedger('');
    setJournalCreditLedger('');
    setVoucherPartySearch('');
    setVoucherShowPartyList(false);
    setJournalDebitSearch('');
    setJournalCreditSearch('');
    setJournalShowDebitList(false);
    setJournalShowCreditList(false);
    setContraFromLedger('');
    setContraToLedger('');
    setContraFromSearch('');
    setContraToSearch('');
    setContraShowFromList(false);
    setContraShowToList(false);
  }

  async function submitPaymentReceipt() {
    if (!activeVoucherType || (activeVoucherType !== 'payment' && activeVoucherType !== 'receipt')) return;
    if (!voucherParty) { toast.show('Select a party', 'error'); return; }
    const parsedAmount = Number(voucherAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) { toast.show('Enter a valid amount', 'error'); return; }

    const entryType: EntryType = activeVoucherType === 'payment' ? 'gave' : 'got';
    const modeLabel = voucherPaymentMode.charAt(0).toUpperCase() + voucherPaymentMode.slice(1);
    const noteText = [modeLabel, voucherNote].filter(Boolean).join(' — ');

    const { error } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: voucherParty,
      type: entryType,
      amount: parsedAmount,
      note: noteText || null,
      entry_date: voucherDate,
    });
    if (error) { toast.show(error.message, 'error'); return; }
    toast.show(`${activeVoucherType === 'payment' ? 'Payment' : 'Receipt'} saved!`, 'success');
    setActiveVoucherType(null);
    resetVoucherForm();
    await loadData(true);
  }

  async function submitJournal() {
    if (!journalDebitLedger || !journalCreditLedger) { toast.show('Select both debit and credit ledgers', 'error'); return; }
    if (journalDebitLedger === journalCreditLedger) { toast.show('Debit and Credit ledgers must be different', 'error'); return; }
    const parsedAmount = Number(voucherAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) { toast.show('Enter a valid amount', 'error'); return; }

    const journalNote = voucherNote ? `Journal: ${voucherNote}` : 'Journal Entry';

    const { error: e1 } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: journalDebitLedger,
      type: 'gave' as EntryType,
      amount: parsedAmount,
      note: journalNote,
      entry_date: voucherDate,
    });
    if (e1) { toast.show(e1.message, 'error'); return; }

    const { error: e2 } = await supabase.from('entries').insert({
      owner_id: userId,
      contact_id: journalCreditLedger,
      type: 'got' as EntryType,
      amount: parsedAmount,
      note: journalNote,
      entry_date: voucherDate,
    });
    if (e2) { toast.show(e2.message, 'error'); return; }

    toast.show('Journal entry saved!', 'success');
    setActiveVoucherType(null);
    resetVoucherForm();
    await loadData(true);
  }

  async function submitContra() {
    if (!contraFromLedger || !contraToLedger) { toast.show('Select both From and To accounts', 'error'); return; }
    if (contraFromLedger === contraToLedger) { toast.show('From and To must be different', 'error'); return; }
    const parsedAmount = Number(voucherAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) { toast.show('Enter a valid amount', 'error'); return; }

    const contraNote = voucherNote ? `Contra: ${voucherNote}` : 'Contra Transfer';

    const { error: e1 } = await supabase.from('entries').insert({
      owner_id: userId, contact_id: contraFromLedger, type: 'gave' as EntryType,
      amount: parsedAmount, note: contraNote, entry_date: voucherDate,
    });
    if (e1) { toast.show(e1.message, 'error'); return; }

    const { error: e2 } = await supabase.from('entries').insert({
      owner_id: userId, contact_id: contraToLedger, type: 'got' as EntryType,
      amount: parsedAmount, note: contraNote, entry_date: voucherDate,
    });
    if (e2) { toast.show(e2.message, 'error'); return; }

    toast.show('Contra entry saved!', 'success');
    setActiveVoucherType(null);
    resetVoucherForm();
    await loadData(true);
  }

  async function submitCreditNote() {
    if (!voucherParty) { toast.show('Select a party', 'error'); return; }
    const parsedAmount = Number(voucherAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) { toast.show('Enter a valid amount', 'error'); return; }

    const cnNote = voucherNote ? `Credit Note: ${voucherNote}` : 'Credit Note';

    const { error } = await supabase.from('entries').insert({
      owner_id: userId, contact_id: voucherParty, type: 'got' as EntryType,
      amount: parsedAmount, note: cnNote, entry_date: voucherDate,
    });
    if (error) { toast.show(error.message, 'error'); return; }

    toast.show('Credit Note saved!', 'success');
    setActiveVoucherType(null);
    resetVoucherForm();
    await loadData(true);
  }

  async function submitDebitNote() {
    if (!voucherParty) { toast.show('Select a party', 'error'); return; }
    const parsedAmount = Number(voucherAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) { toast.show('Enter a valid amount', 'error'); return; }

    const dnNote = voucherNote ? `Debit Note: ${voucherNote}` : 'Debit Note';

    const { error } = await supabase.from('entries').insert({
      owner_id: userId, contact_id: voucherParty, type: 'gave' as EntryType,
      amount: parsedAmount, note: dnNote, entry_date: voucherDate,
    });
    if (error) { toast.show(error.message, 'error'); return; }

    toast.show('Debit Note saved!', 'success');
    setActiveVoucherType(null);
    resetVoucherForm();
    await loadData(true);
  }

  function openInvoiceEditor(invoiceId: string) {
    const targetInvoice = invoices.find((invoice) => invoice.id === invoiceId);
    if (!targetInvoice) {
      toast.show('Invoice details not found', 'error');
      return;
    }
    if (targetInvoice.status !== 'posted') {
      toast.show('Cancelled invoices cannot be edited.', 'error');
      return;
    }

    const lineDrafts: InvoiceLineDraft[] = invoiceLinesData
      .filter((line) => line.invoice_id === invoiceId)
      .map((line) => ({
        item_id: line.item_id,
        quantity: String(line.quantity),
        rate: String(line.rate),
      }));

    setInvoiceKind(targetInvoice.kind);
    setEditingInvoiceId(invoiceId);
    setInvoiceParty(targetInvoice.party_name);
    setInvoiceNote(targetInvoice.note ?? '');
    setInvoiceDate(targetInvoice.invoice_date);
    setInvoiceSettlementAmount(targetInvoice.settlement_amount > 0 ? targetInvoice.settlement_amount.toFixed(2) : '');
    setInvoiceLines(lineDrafts);
    setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
    setInvoiceActionTargetId(null);
    setShowInvoiceForm(true);
  }

  async function deleteInvoice(invoiceId: string) {
    if (!window.confirm('Cancel this invoice with reversal entries?')) return;
    const { error } = await supabase.rpc('cancel_invoice', {
      p_invoice_id: invoiceId,
      p_cancel_note: null,
    });
    if (error) {
      toast.show(error.message, 'error');
      return;
    }
    setInvoiceActionTargetId(null);
    await loadData(true);
  }

  async function saveInvoice() {
    if (invoiceLines.length === 0) {
      toast.show('Add at least one line', 'error');
      return;
    }
    const normalizedParty = invoiceParty.trim();
    if (!normalizedParty) {
      toast.show('Enter party name', 'error');
      return;
    }
    // Category check removed — allow any party for any invoice type

    const itemsById = new Map(inventoryItems.map((item) => [item.id, item]));
    const normalizedNote = invoiceNote.trim();
    let invoiceTotal = 0;
    const payload: Array<{ item_id: string; quantity: number; rate: number }> = [];
    for (const line of invoiceLines) {
      const quantity = Number(line.quantity);
      const rate = Number(line.rate);
      if (Number.isNaN(quantity) || quantity <= 0) {
        toast.show('Invalid quantity in invoice lines', 'error');
        return;
      }
      if (Number.isNaN(rate) || rate < 0) {
        toast.show('Invalid rate in invoice lines', 'error');
        return;
      }
      const item = itemsById.get(line.item_id);
      if (!item) {
        toast.show('Selected item not found', 'error');
        return;
      }

      invoiceTotal += quantity * rate;
      payload.push({
        item_id: item.id,
        quantity,
        rate,
      });
    }

    const settlementAmount = Number(invoiceSettlementAmount || '0');
    if (Number.isNaN(settlementAmount) || settlementAmount < 0) {
      toast.show('Enter valid paid/received amount', 'error');
      return;
    }
    if (settlementAmount > invoiceTotal) {
      toast.show('Paid/received amount cannot be more than invoice total', 'error');
      return;
    }

    const { data: newInvoiceId, error } = await supabase.rpc('post_invoice', {
      p_kind: invoiceKind,
      p_party_name: normalizedParty,
      p_invoice_date: invoiceDate,
      p_note: normalizedNote || null,
      p_settlement_amount: settlementAmount,
      p_lines: payload,
      p_group_id: activeInventoryGroup?.id ?? null,
      p_replace_invoice_id: editingInvoiceId,
    });
    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setInvoiceLines([]);
    setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
    setInvoiceParty('');
    setInvoiceNote('');
    setInvoiceSettlementAmount('');
    setEditingInvoiceId(null);
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setShowInvoiceForm(false);
    if (!newInvoiceId) {
      toast.show('Invoice posted, but no id returned.', 'error');
      return;
    }
    await loadData(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function closeBarcodeScanner() {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    if (scannerVideoRef.current?.srcObject) {
      const tracks = (scannerVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      scannerVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setBarcodeScanTarget(null);
    setManualBarcodeInput('');
    setBarcodeScanError(null);
  }

  function applyScannedBarcode(rawValue: string) {
    const barcode = rawValue.trim();
    if (!barcode) return;

    if (barcodeScanTarget === 'search') {
      setInventorySearchText(barcode);
      const matchedItem = inventoryItems.find((item) => (item.barcode ?? '').toLowerCase() === barcode.toLowerCase());
      if (matchedItem) {
        setSelectedInventoryItemId(matchedItem.id);
      }
      closeBarcodeScanner();
      return;
    }

    if (barcodeScanTarget === 'add-item') {
      setInventoryItemDraft((draft) => ({ ...draft, barcode }));
      closeBarcodeScanner();
      return;
    }

    if (barcodeScanTarget === 'edit-item') {
      setEditInventoryItemDraft((draft) => (draft ? { ...draft, barcode } : draft));
      closeBarcodeScanner();
    }

    if (barcodeScanTarget === 'invoice-item') {
      const matchedItem = inventoryItems.find((item) => (item.barcode ?? '').toLowerCase() === barcode.toLowerCase());
      if (matchedItem) {
        setInvoiceLineDraft((prev) => ({ ...prev, item_id: matchedItem.id }));
        setInvoiceItemSearch(matchedItem.name);
        setInvoiceItemDropdownOpen(false);
        toast.show(`Found: ${matchedItem.name}`, 'success');
      } else {
        toast.show('No item found with this barcode', 'error');
      }
      closeBarcodeScanner();
    }
  }

  async function openBarcodeScanner(target: 'search' | 'add-item' | 'edit-item' | 'invoice-item') {
    setBarcodeScanError(null);
    setManualBarcodeInput('');
    setCameraActive(false);
    setBarcodeScanTarget(target);
  }

  async function startLiveCamera() {
    setCameraActive(true);
    setBarcodeScanError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      // Short delay to let the video element mount
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!scannerVideoRef.current) {
        setBarcodeScanError('Video element not ready. Try again.');
        setCameraActive(false);
        return;
      }
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        scannerVideoRef.current,
        (result, error) => {
          if (result) {
            const text = result.getText();
            if (text) {
              toast.show(`Barcode scanned: ${text}`, 'success');
              applyScannedBarcode(text);
            }
          }
          if (error && !(error instanceof Error && error.message.includes('No MultiFormat Readers'))) {
            // Ignore continuous scan "not found" errors
          }
        }
      );
      scannerControlsRef.current = { stop: () => controls.stop() };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera';
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('notallowed')) {
        setBarcodeScanError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (message.toLowerCase().includes('notfound') || message.toLowerCase().includes('no video')) {
        setBarcodeScanError('No camera found on this device. Use manual entry or photo scan instead.');
      } else {
        setBarcodeScanError(message);
      }
      setCameraActive(false);
    }
  }

  function submitManualBarcode() {
    if (!manualBarcodeInput.trim()) {
      toast.show('Enter a barcode', 'error');
      return;
    }
    applyScannedBarcode(manualBarcodeInput.trim());
  }

  function openBarcodeImagePicker() {
    scannerImageInputRef.current?.click();
  }

  async function handleBarcodeImagePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    try {
      setBarcodeScanError(null);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(image);
      if (!result?.getText()) {
        throw new Error('No barcode detected');
      }
      applyScannedBarcode(result.getText());
    } catch {
      setBarcodeScanError('Could not read barcode from image. Try a clearer photo.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function editSelectedContact() {
    if (!selectedContact) return;

    setEditContactDraft({
      id: selectedContact.id,
      name: selectedContact.name,
      phone: selectedContact.phone ?? '',
      category: selectedContact.category,
    });
  }

  async function saveEditedContact() {
    if (!editContactDraft) return;

    const trimmedName = editContactDraft.name.trim();
    if (!trimmedName) {
      toast.show('Name cannot be empty', 'error');
      return;
    }

    const { error } = await supabase
      .from('contacts')
      .update({
        name: trimmedName,
        phone: editContactDraft.phone.trim() || null,
        category: editContactDraft.category,
      })
      .eq('id', editContactDraft.id)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setEditContactDraft(null);
    await loadData(true);
  }

  function editSelectedInventoryItem() {
    if (!selectedInventoryItem) return;

    setEditInventoryItemDraft({
      id: selectedInventoryItem.id,
      name: selectedInventoryItem.name,
      unit: selectedInventoryItem.unit ?? 'NOS',
      category: selectedInventoryItem.category ?? '',
      barcode: selectedInventoryItem.barcode ?? '',
    });
    setEditInventoryCategoryCustom('');
  }

  async function saveEditedInventoryItem() {
    if (!editInventoryItemDraft) return;

    const trimmedName = editInventoryItemDraft.name.trim();
    if (!trimmedName) {
      toast.show('Item name cannot be empty', 'error');
      return;
    }
    const resolvedCategory =
      editInventoryItemDraft.category === '__custom__'
        ? editInventoryCategoryCustom.trim()
        : editInventoryItemDraft.category.trim();

    const { error } = await supabase
      .from('inventory_items')
      .update({
        name: trimmedName,
        unit: editInventoryItemDraft.unit.trim().toUpperCase() || null,
        category: resolvedCategory || null,
        barcode: editInventoryItemDraft.barcode.trim() || null,
      })
      .eq('id', editInventoryItemDraft.id);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setEditInventoryCategoryCustom('');
    setEditInventoryItemDraft(null);
    await loadData(true);
  }

  async function deleteSelectedContact(contactId: string) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setSelectedContactId('');
    await loadData(true);
  }

  function openEntryActionForm(entry: Entry) {
    if (entry.invoice_id) {
      toast.show('Invoice postings are immutable. Cancel or edit the invoice instead.', 'info');
      return;
    }
    setEntryActionDraft({
      id: entry.id,
      amount: String(entry.amount),
      note: entry.note ?? '',
      type: entry.type,
      entryDate: entry.entry_date,
    });
  }

  async function submitEntryAction() {
    if (!entryActionDraft) return;

    const parsedAmount = Number(entryActionDraft.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.show('Enter a valid amount', 'error');
      return;
    }

    const { error } = await supabase
      .from('entries')
      .update({
        amount: parsedAmount,
        note: entryActionDraft.note.trim() || null,
        type: entryActionDraft.type,
        entry_date: entryActionDraft.entryDate,
      })
      .eq('id', entryActionDraft.id)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setEntryActionDraft(null);
    await loadData(true);
  }

  async function deleteEntry(entryId: string) {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', entryId)
      .eq('owner_id', userId);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    await loadData(true);
  }

  function openMovementActionForm(movement: InventoryMovement) {
    if (movement.invoice_id) {
      toast.show('Invoice stock postings are immutable. Cancel or edit the invoice instead.', 'info');
      return;
    }
    setMovementActionDraft({
      id: movement.id,
      quantity: String(movement.quantity),
      note: movement.note ?? '',
      type: movement.type,
      movementDate: movement.movement_date,
    });
  }

  async function submitMovementAction() {
    if (!movementActionDraft) return;

    const quantity = Number(movementActionDraft.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.show('Enter a valid quantity', 'error');
      return;
    }

    const { error } = await supabase
      .from('inventory_movements')
      .update({
        quantity,
        note: movementActionDraft.note.trim() || null,
        type: movementActionDraft.type,
        movement_date: movementActionDraft.movementDate,
      })
      .eq('id', movementActionDraft.id);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setMovementActionDraft(null);
    await loadData(true);
  }

  async function deleteMovement(movementId: string) {
    const { error } = await supabase.from('inventory_movements').delete().eq('id', movementId);
    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    await loadData(true);
  }

  async function confirmDeleteDialog() {
    if (!deleteDialog) return;

    if (deleteDialog.kind === 'contact') {
      await deleteSelectedContact(deleteDialog.id);
    } else {
      await deleteEntry(deleteDialog.id);
    }

    setDeleteDialog(null);
  }

  function formatRelativeTime(value: string): string {
    const diffMs = Date.now() - new Date(value).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    return `${days} days ago`;
  }

  function formatDateDDMMYY(value: string): string {
    const parts = value.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}-${month}-${year.slice(-2)}`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  }

  function formatContactCategory(value: ContactCategory): string {
    const match = CONTACT_CATEGORIES.find((c) => c.value === value);
    return match ? match.label : value;
  }

  function formatMovementNote(note: string | null): string {
    if (!note) return 'No note';
    if (!note.startsWith('INV:')) return note;

    const fields = Object.fromEntries(
      note
        .split('|')
        .map((part) => {
          const idx = part.indexOf(':');
          if (idx <= 0) return null;
          return [part.slice(0, idx), part.slice(idx + 1)];
        })
        .filter(Boolean) as Array<[string, string]>
    );

    const typeLabel = fields.TYPE === 'sale' ? 'Sale' : 'Purchase';
    const party = fields.PARTY?.trim() || 'Party';
    return `${typeLabel} • ${party}`;
  }



  function summarizeInvoiceLines(invoiceId: string): string | null {
    const relatedLines = invoiceLinesData.filter((line) => line.invoice_id === invoiceId);
    if (relatedLines.length === 0) return null;
    const summaryParts = relatedLines.map((line) => `${line.item_name} x ${formatCompactQuantity(line.quantity)}`);
    return summaryParts.join(', ');
  }

  function formatLedgerNote(note: string | null, invoiceId: string | null): string {
    if (!note) return 'No note';
    const normalized = note.trim();
    if (!normalized) return 'No note';

    if (invoiceId && /^purchase invoice/i.test(normalized)) {
      const summary = summarizeInvoiceLines(invoiceId);
      return summary ? `Purchase: ${summary}` : 'Purchase Invoice';
    }

    if (invoiceId && /^sales invoice/i.test(normalized)) {
      const summary = summarizeInvoiceLines(invoiceId);
      return summary ? `Sales: ${summary}` : 'Sales Invoice';
    }

    if (invoiceId && /^amount received/i.test(normalized)) {
      const summary = summarizeInvoiceLines(invoiceId);
      return summary ? `Received: ${summary}` : 'Amount Received';
    }

    if (invoiceId && /^amount paid/i.test(normalized)) {
      const summary = summarizeInvoiceLines(invoiceId);
      return summary ? `Paid: ${summary}` : 'Amount Paid';
    }

    return normalized;
  }

  const showFooter =
    section === 'invoices' ||
    section === 'reports' ||
    (section === 'dashboard' && !selectedContact) ||
    (section === 'inventory' && !selectedInventoryItem);

  if (loading) {
    return (
      <div className="card auth-card animate-fade-in">
        <div className="loading-spinner-wrapper">
          <div className="loading-spinner" />
          <p className="loading-text">Loading KhataPlus...</p>
        </div>
      </div>
    );
  }

  if (loadError && contacts.length === 0 && entries.length === 0 && inventoryItems.length === 0) {
    return (
      <div className="card auth-card stack">
        <h3>Could not load data</h3>
        <p className="muted">{loadError}</p>
        <button onClick={() => void loadData()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="ledger-shell">
      {section === 'dashboard' ? (
        !selectedContact ? (
          <section className="ledger-home">
            <div className="home-top">
              <div className="home-header-row">
                <div className="brand-row">
                  <h2>{displayName}</h2>
                </div>
                <button className="icon-btn" onClick={() => setShowSettingsMenu(true)} aria-label="Settings">
                  ⚙
                </button>
              </div>

              <div className="summary-card">
                <div className="summary-stats">
                  <div>
                    <p className="muted">You will give</p>
                    <strong className="gave">₹{totals.youHaveToGive.toFixed(0)}</strong>
                  </div>
                  <div>
                    <p className="muted">You will get</p>
                    <strong className="get-blue">₹{totals.youHaveToGet.toFixed(0)}</strong>
                  </div>
                </div>
                <div className="summary-net-row">
                  <span>Net Balance</span>
                  <strong className={totals.totalBalance >= 0 ? 'gave' : 'got'}>
                    ₹{Math.abs(totals.totalBalance).toFixed(0)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="home-body with-footer-space">
              <div className="search-row">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search Customer"
                  autoCapitalize="words"
                />
              </div>

              <div className="party-list">
                {filteredContacts.map((contact) => (
                  <button key={contact.id} className="party-row" onClick={() => setSelectedContactId(contact.id)}>
                    <div className="party-avatar" style={{ background: getAvatarGradient(contact.name) }}>{contact.name[0]?.toUpperCase() ?? '?'}</div>
                    <div className="party-main">
                      <strong>{contact.name}</strong>
                      <p className="muted">
                        {formatContactCategory(contact.category)} • {formatRelativeTime(contact.created_at)}
                      </p>
                    </div>
                    <div className="party-balance">
                      <strong className={contact.balance >= 0 ? 'gave' : 'got'}>
                        ₹{Math.abs(contact.balance).toFixed(0)}
                      </strong>
                      <p className="muted">{contact.balance >= 0 ? "You'll Get" : "You'll Give"}</p>
                    </div>
                  </button>
                ))}
                {filteredContacts.length === 0 && <p className="muted empty-text">No parties found.</p>}
              </div>

              {showAddPartyForm && (
                <div className="add-party-overlay">
                  <form onSubmit={addContact} className="add-party-sheet stack">
                    <h4>Add Party</h4>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Party name"
                      autoCapitalize="words"
                      required
                    />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (optional)"
                    />
                    <select value={contactCategory} onChange={(e) => setContactCategory(e.target.value as ContactCategory)}>
                      {CONTACT_CATEGORIES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <div className="row">
                      <button
                        type="button"
                        className="add-party-cancel-btn"
                        onClick={() => {
                          setShowAddPartyForm(false);
                          setContactCategory('individual');
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="add-party-save-btn">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <button className="fab-add with-footer" onClick={() => setShowAddPartyForm(true)}>
                + Add Party
              </button>
            </div>
          </section>
        ) : (
          <section className="ledger-detail">
            <div className="detail-top">
              <div className="detail-header-row">
                <button className="icon-btn detail-back" onClick={() => setSelectedContactId('')}>
                  ←
                </button>
                <div
                  className="detail-party detail-party-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => editSelectedContact()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      editSelectedContact();
                    }
                  }}
                >
                  <div className="party-avatar detail-avatar">{selectedContact.name[0]?.toUpperCase() ?? '?'}</div>
                  <div>
                    <h3>{selectedContact.name}</h3>
                    <p>{formatContactCategory(selectedContact.category)}</p>
                    {selectedContact.phone && <p>{selectedContact.phone}</p>}
                  </div>
                </div>
              </div>

              <div className="detail-balance-card">
                <span>{selectedBalance >= 0 ? 'You will get' : 'You will give'}</span>
                <strong className={selectedBalance >= 0 ? 'gave' : 'got'}>₹{Math.abs(selectedBalance).toFixed(0)}</strong>
              </div>
            </div>

            <div className="detail-body">
              <div className="entry-head-row">
                <span>Entries</span>
                <span>You gave</span>
                <span>You got</span>
              </div>

              <div className="entries detail-entries">
                {selectedEntriesWithBalance.map((entry) => (
                  <div key={entry.id} className="entry-grid-row">
                    <div className="entry-left">
                      <p className="entry-time">{formatDateDDMMYY(entry.entry_date)}</p>
                      <p className="entry-balance-tag">Bal. ₹{entry.runningBalance.toFixed(0)}</p>
                      <p className="entry-note">{formatLedgerNote(entry.note, entry.invoice_id)}</p>
                      <div className="entry-inline-actions">
                        {entry.invoice_id ? (
                          <button
                            type="button"
                            className="entry-invoice-badge"
                            onClick={() => setInvoiceActionTargetId(entry.invoice_id)}
                          >
                            📄 View Invoice →
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="entry-action-edit"
                              onClick={() => openEntryActionForm(entry)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="entry-action-delete"
                              onClick={() => {
                                if (confirm('Delete this entry?')) {
                                  void deleteEntry(entry.id);
                                }
                              }}
                            >
                              🗑️ Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="entry-mid">
                      {entry.type === 'gave' && <strong className="got">₹{entry.amount.toFixed(0)}</strong>}
                    </div>
                    <div className="entry-right">
                      {entry.type === 'got' && <strong className="gave">₹{entry.amount.toFixed(0)}</strong>}
                    </div>
                  </div>
                ))}
                {selectedEntriesWithBalance.length === 0 && <p className="muted empty-text">No previous entries.</p>}
              </div>
            </div>

            <div className="detail-action-bar">
              <button className="give-action-btn" onClick={() => startEntry('gave')}>
                YOU GAVE ₹
              </button>
              <button className="get-action-btn" onClick={() => startEntry('got')}>
                YOU GOT ₹
              </button>
            </div>
          </section>
        )
      ) : section === 'invoices' ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Invoices</h2>
              </div>
            </div>

            <div className="summary-card inventory-summary-card">
              <div className="summary-stats inventory-stats-three">
                <div>
                  <p className="muted">Type</p>
                  <strong>{invoiceKind === 'purchase' ? 'Purchase' : 'Sales'}</strong>
                </div>
                <div>
                  <p className="muted">Invoices</p>
                  <strong>{invoiceHistory.length}</strong>
                </div>
                <div>
                  <p className="muted">Lines</p>
                  <strong>{invoiceHistory.reduce((sum, item) => sum + item.lineCount, 0)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="home-body with-footer-space">
            <div className="voucher-type-grid">
              <button type="button" className="voucher-card voucher-sales" onClick={() => { setInvoiceKind('sale'); setActiveVoucherType('sales'); setShowInvoiceForm(true); }}>
                <span className="voucher-icon">↗</span>
                <span>Sales</span>
              </button>
              <button type="button" className="voucher-card voucher-purchase" onClick={() => { setInvoiceKind('purchase'); setActiveVoucherType('purchase'); setShowInvoiceForm(true); }}>
                <span className="voucher-icon">↙</span>
                <span>Purchase</span>
              </button>
              <button type="button" className="voucher-card voucher-payment" onClick={() => { setActiveVoucherType('payment'); resetVoucherForm(); }}>
                <span className="voucher-icon">💳</span>
                <span>Payment</span>
              </button>
              <button type="button" className="voucher-card voucher-receipt" onClick={() => { setActiveVoucherType('receipt'); resetVoucherForm(); }}>
                <span className="voucher-icon">📥</span>
                <span>Receipt</span>
              </button>
              <button type="button" className="voucher-card voucher-journal" onClick={() => { setActiveVoucherType('journal'); resetVoucherForm(); }}>
                <span className="voucher-icon">📓</span>
                <span>Journal</span>
              </button>
              <button type="button" className="voucher-card voucher-contra" onClick={() => { setActiveVoucherType('contra'); resetVoucherForm(); }}>
                <span className="voucher-icon">🔄</span>
                <span>Contra</span>
              </button>
              <button type="button" className="voucher-card voucher-creditnote" onClick={() => { setActiveVoucherType('credit_note'); resetVoucherForm(); }}>
                <span className="voucher-icon">📤</span>
                <span>Cr. Note</span>
              </button>
              <button type="button" className="voucher-card voucher-debitnote" onClick={() => { setActiveVoucherType('debit_note'); resetVoucherForm(); }}>
                <span className="voucher-icon">📥</span>
                <span>Dr. Note</span>
              </button>
            </div>

            {/* ─── Search bar ─── */}
            <div className="txn-search-bar">
              <input type="text" placeholder="Search transactions..." value={txnSearch} onChange={e => setTxnSearch(e.target.value)} className="txn-search-input" />
            </div>

            {unifiedTransactions.length > 0 && (
              <p className="txn-section-header">Recent Transactions ({unifiedTransactions.length})</p>
            )}
            <div className="invoice-history-list">
              {unifiedTransactions.map((txn) => {
                const typeConfig: Record<string, { icon: string; badge: string; cls: string; sign: string }> = {
                  sale: { icon: '↗', badge: 'Sale', cls: 'txn-type-sale', sign: '+' },
                  purchase: { icon: '↙', badge: 'Purchase', cls: 'txn-type-purchase', sign: '-' },
                  payment: { icon: '💳', badge: 'Payment', cls: 'txn-type-payment', sign: '-' },
                  receipt: { icon: '📥', badge: 'Receipt', cls: 'txn-type-receipt', sign: '+' },
                  journal: { icon: '📓', badge: 'Journal', cls: 'txn-type-journal', sign: '' },
                  contra: { icon: '🔄', badge: 'Contra', cls: 'txn-type-contra', sign: '' },
                  credit_note: { icon: '📤', badge: 'Cr. Note', cls: 'txn-type-creditnote', sign: '+' },
                  debit_note: { icon: '📥', badge: 'Dr. Note', cls: 'txn-type-debitnote', sign: '-' },
                  entry: { icon: '•', badge: 'Entry', cls: 'txn-type-entry', sign: '' },
                };
                const cfg = typeConfig[txn.type] || typeConfig.entry;
                return (
                  <div
                    key={txn.id}
                    className="invoice-history-card"
                    onClick={() => txn.invoiceId ? setInvoiceActionTargetId(txn.invoiceId) : null}
                  >
                    <div className="invoice-history-left" style={{ flex: 1 }}>
                      <div className={`txn-type-icon ${cfg.cls}`}>{cfg.icon}</div>
                      <div>
                        <p className="invoice-party">{txn.party}</p>
                        <p className="invoice-meta">
                          <span className={`txn-badge txn-badge-${txn.type}`}>{cfg.badge}</span>
                          {txn.note && <span className="invoice-items-preview">{txn.note}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="invoice-history-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <p className={cfg.sign === '+' ? 'amount-positive' : cfg.sign === '-' ? 'amount-negative' : ''}>
                        {cfg.sign}₹{txn.amount.toFixed(0)}
                      </p>
                      <p className="invoice-date">{formatDateDDMMYY(txn.date)}</p>
                    </div>
                    {txn.invoiceId && (
                      <button
                        className="icon-btn"
                        style={{ marginLeft: '8px', padding: '6px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openInvoiceEditor(txn.invoiceId!);
                        }}
                        aria-label="Edit Invoice"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                );
              })}
              {unifiedTransactions.length === 0 && <p className="muted empty-text">No transactions yet. Tap a voucher type above to create one!</p>}
            </div>


          </div>
        </section>
      ) : section === 'inventory' ? (inventoryView === 'group' ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Inventory Group</h2>
              </div>
              <button className="icon-btn" onClick={() => setInventoryView('list')} aria-label="Back to inventory">
                ←
              </button>
            </div>
          </div>

          <div className="home-body inventory-body with-footer-space">
            {activeInventoryGroup ? (
              <div className="inventory-group-card stack">
                <h4>Group Info</h4>
                <p className="muted">Code: {activeInventoryGroup.join_code}</p>
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="Group name"
                  autoCapitalize="words"
                  disabled={activeInventoryGroup.owner_id !== userId}
                />
                {activeInventoryGroup.owner_id === userId && (
                  <button type="button" onClick={() => void saveGroupName()}>
                    Save Group Name
                  </button>
                )}

                <h4>Users In Group</h4>
                <div className="inventory-group-members">
                  {inventoryGroupMembers.map((member) => (
                    <div key={member.user_id} className="inventory-group-member-row">
                      <strong>{member.display_name}</strong>
                      <span>{member.role}</span>
                    </div>
                  ))}
                </div>

                <div className="inventory-group-actions">
                  <button type="button" className="add-party-cancel-btn" onClick={() => void leaveInventorySyncGroup()}>
                    Leave Group
                  </button>
                  {activeInventoryGroup.owner_id === userId && (
                    <button type="button" className="danger-solid" onClick={() => void deleteGroup()}>
                      Delete Group
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="inventory-group-card stack">
                <h4>No Active Group</h4>
                <p className="muted">Create a new group or join with code.</p>
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="Group name"
                  autoCapitalize="words"
                />
                <button type="button" onClick={() => void createInventoryGroup()}>
                  Create Group
                </button>
                <div className="inventory-group-join-row">
                  <input
                    value={groupJoinCode}
                    onChange={(e) => setGroupJoinCode(e.target.value)}
                    placeholder="Enter code"
                    autoCapitalize="characters"
                  />
                  <button type="button" onClick={() => void joinInventoryGroup()}>
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : !selectedInventoryItem ? (
        <section className="ledger-home inventory-home">
          <div className="home-top inventory-top">
            <div className="home-header-row">
              <div className="brand-row">
                <h2>Inventory</h2>
              </div>
              <div className="inventory-header-actions">
                <button type="button" className="inventory-leave-btn" onClick={() => setInventoryView('group')}>
                  Group
                </button>
              </div>
            </div>

            <div className="summary-card inventory-summary-card">
              <div className="summary-stats inventory-stats-three">
                <div>
                  <p className="muted">Items</p>
                  <strong>{inventoryTotals.totalItems}</strong>
                </div>
                <div>
                  <p className="muted">Low Stock</p>
                  <strong className="got">{inventoryTotals.lowStock}</strong>
                </div>
                <div>
                  <p className="muted">Out Stock</p>
                  <strong className="got">{inventoryTotals.outOfStock}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="home-body inventory-body with-footer-space">
            <div className="search-row search-row-with-action">
              <input
                value={inventorySearchText}
                onChange={(e) => setInventorySearchText(e.target.value)}
                placeholder="Search item or barcode"
                autoCapitalize="words"
              />
              <button type="button" className="scan-inline-btn" onClick={() => void openBarcodeScanner('search')}>
                Scan
              </button>
            </div>
            <div className="inventory-category-strip">
              <button
                type="button"
                className={inventoryCategoryFilter === 'ALL' ? 'active' : ''}
                onClick={() => setInventoryCategoryFilter('ALL')}
              >
                All
              </button>
              {inventoryCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={inventoryCategoryFilter === category ? 'active' : ''}
                  onClick={() => setInventoryCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="party-list inventory-list">
              {filteredInventoryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="party-row inventory-row"
                  onClick={() => setSelectedInventoryItemId(item.id)}
                >
                  <div className="party-avatar">{item.name[0]?.toUpperCase() ?? '?'}</div>
                  <div className="party-main">
                    <strong>{item.name}</strong>
                    <p className="muted">
                      Unit: {item.unit ?? 'NOS'}
                      {item.category ? ` • ${item.category}` : ''}
                      {item.barcode ? ` • #${item.barcode}` : ''}
                    </p>
                  </div>
                  <div className="party-balance">
                    <strong className={item.stock > 0 ? 'gave' : 'got'}>{item.stock.toFixed(2)}</strong>
                    <p className="muted">In Stock</p>
                  </div>
                </button>
              ))}
              {filteredInventoryItems.length === 0 && <p className="muted empty-text">No inventory items found.</p>}
            </div>

            {showAddInventoryForm && (
              <div className="add-party-overlay">
                <form onSubmit={addInventoryItem} className="add-party-sheet stack">
                  <h4>Add Inventory Item</h4>
                  <input
                    value={inventoryItemDraft.name}
                    onChange={(e) =>
                      setInventoryItemDraft((draft) => ({ ...draft, name: e.target.value }))
                    }
                    placeholder="Item name"
                    autoCapitalize="words"
                    required
                  />
                  <div className="search-row search-row-with-action">
                    <input
                      value={inventoryItemDraft.barcode}
                      onChange={(e) =>
                        setInventoryItemDraft((draft) => ({ ...draft, barcode: e.target.value }))
                      }
                      placeholder="Barcode (optional)"
                    />
                    <button type="button" className="scan-inline-btn" onClick={() => void openBarcodeScanner('add-item')}>
                      Scan
                    </button>
                  </div>
                  <div className="inventory-form-row">
                    <select
                      value={inventoryItemDraft.unit}
                      onChange={(e) =>
                        setInventoryItemDraft((draft) => ({ ...draft, unit: e.target.value.toUpperCase() }))
                      }
                    >
                      {INVENTORY_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    <select
                      value={inventoryItemDraft.category}
                      onChange={(e) =>
                        setInventoryItemDraft((draft) => ({ ...draft, category: e.target.value }))
                      }
                    >
                      <option value="">Select Category</option>
                      {inventoryCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                      <option value="__custom__">+ Add New Category</option>
                    </select>
                  </div>
                  {inventoryItemDraft.category === '__custom__' && (
                    <input
                      value={inventoryCategoryCustom}
                      onChange={(e) => setInventoryCategoryCustom(e.target.value)}
                      placeholder="Type new category"
                      autoCapitalize="words"
                      required
                    />
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="add-party-cancel-btn"
                      onClick={() => {
                        setShowAddInventoryForm(false);
                        setInventoryCategoryCustom('');
                        setInventoryItemDraft((draft) => ({ ...draft, category: '', barcode: '' }));
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="add-party-save-btn">
                      Save
                    </button>
                  </div>
                </form>
              </div>
            )}

            <button className="fab-add with-footer" onClick={() => setShowAddInventoryForm(true)}>
              + Add Item
            </button>
          </div>
        </section>
      ) : (
        <section className="ledger-detail">
          <div className="detail-top inventory-top">
            <div className="detail-header-row">
              <button className="icon-btn detail-back" onClick={() => setSelectedInventoryItemId('')}>
                ←
              </button>
              <div
                className="detail-party detail-party-clickable"
                role="button"
                tabIndex={0}
                onClick={() => editSelectedInventoryItem()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    editSelectedInventoryItem();
                  }
                }}
              >
                <div className="party-avatar detail-avatar">
                  {selectedInventoryItem.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <h3>{selectedInventoryItem.name}</h3>
                  <p>{selectedInventoryItem.unit ?? 'NOS'}</p>
                  {selectedInventoryItem.barcode && <p>#{selectedInventoryItem.barcode}</p>}
                </div>
              </div>
            </div>

            <div className="detail-balance-card">
              <span>Current Stock</span>
              <strong className={selectedInventoryStock > 0 ? 'gave' : 'got'}>
                {selectedInventoryStock.toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="detail-body with-footer-space">
            <div className="entry-head-row inventory-entry-head-row">
              <span>Date & Note</span>
              <span>Stock In</span>
              <span>Stock Out</span>
            </div>

            <div className="entries detail-entries">
              {selectedInventoryMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="entry-grid-row inventory-entry-grid-row"
                  onClick={() => openMovementActionForm(movement)}
                >
                  <div className="entry-left">
                    <p className="entry-time">{formatDateDDMMYY(movement.movement_date)}</p>
                    <p className="entry-note">{formatMovementNote(movement.note)}</p>
                  </div>
                  <div className="entry-mid">
                    {movement.type === 'in' && <strong className="gave">{movement.quantity.toFixed(2)}</strong>}
                  </div>
                  <div className="entry-right">
                    {movement.type === 'out' && <strong className="got">{movement.quantity.toFixed(2)}</strong>}
                  </div>
                </div>
              ))}
              {selectedInventoryMovements.length === 0 && <p className="muted empty-text">No stock movement yet.</p>}
            </div>
          </div>

          <div className="detail-action-bar inventory-detail-action-bar">
            <button className="give-action-btn" onClick={() => startInventoryMovement('in')}>
              STOCK IN
            </button>
            <button className="get-action-btn" onClick={() => startInventoryMovement('out')}>
              STOCK OUT
            </button>
          </div>
        </section>
      )) : null}

      {/* ─── Reports Section ─── */}
      {section === 'reports' && (
        <section className="home-page animate-fade-in">
          <div className="home-header">
            <div className="home-header-inner">
              {reportsView !== 'hub' && (
                <button type="button" className="icon-btn" onClick={() => setReportsView('hub')}>←</button>
              )}
              <h2>{reportsView === 'hub' ? 'Reports' : reportsView === 'daybook' ? 'Day Book' : reportsView === 'cashbook' ? 'Cash/Bank Book' : reportsView === 'trial_balance' ? 'Trial Balance' : reportsView === 'profit_loss' ? 'Profit & Loss' : reportsView === 'balance_sheet' ? 'Balance Sheet' : reportsView === 'outstanding' ? 'Outstanding' : 'Stock Summary'}</h2>
              <button type="button" className="icon-btn" onClick={() => setShowSettingsMenu(true)}>⚙</button>
            </div>
          </div>

          <div className="home-body with-footer-space">
            {reportsView === 'hub' && (
              <div className="reports-hub-grid">
                <button className="report-card report-card-daybook" onClick={() => setReportsView('daybook')}>
                  <span className="report-card-icon">📅</span>
                  <span className="report-card-title">Day Book</span>
                  <span className="report-card-desc">All entries by date</span>
                </button>
                <button className="report-card report-card-cashbook" onClick={() => setReportsView('cashbook')}>
                  <span className="report-card-icon">💵</span>
                  <span className="report-card-title">Cash/Bank Book</span>
                  <span className="report-card-desc">Cash & bank movements</span>
                </button>
                <button className="report-card report-card-trial" onClick={() => setReportsView('trial_balance')}>
                  <span className="report-card-icon">⚖️</span>
                  <span className="report-card-title">Trial Balance</span>
                  <span className="report-card-desc">Dr & Cr totals</span>
                </button>
                <button className="report-card report-card-pl" onClick={() => setReportsView('profit_loss')}>
                  <span className="report-card-icon">📊</span>
                  <span className="report-card-title">Profit & Loss</span>
                  <span className="report-card-desc">Income vs Expenses</span>
                </button>
                <button className="report-card report-card-bs" onClick={() => setReportsView('balance_sheet')}>
                  <span className="report-card-icon">🏦</span>
                  <span className="report-card-title">Balance Sheet</span>
                  <span className="report-card-desc">Assets & Liabilities</span>
                </button>
                <button className="report-card report-card-outstanding" onClick={() => setReportsView('outstanding')}>
                  <span className="report-card-icon">💰</span>
                  <span className="report-card-title">Outstanding</span>
                  <span className="report-card-desc">Receivables & Payables</span>
                </button>
                <button className="report-card report-card-stock" onClick={() => setReportsView('stock_summary')}>
                  <span className="report-card-icon">📦</span>
                  <span className="report-card-title">Stock Summary</span>
                  <span className="report-card-desc">Inventory levels</span>
                </button>
              </div>
            )}

            {/* ─── Day Book ─── */}
            {reportsView === 'daybook' && (
              <div className="report-detail">
                <div className="report-date-filter">
                  <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} />
                  <span>to</span>
                  <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} />
                </div>
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Date</span><span>Party</span><span>Dr</span><span>Cr</span>
                  </div>
                  {dayBookEntries.length === 0 && <p className="muted empty-text">No entries in this period</p>}
                  {dayBookEntries.map(entry => (
                    <div key={entry.id} className="report-table-row">
                      <span>{formatDateDDMMYY(entry.entry_date)}</span>
                      <span>{entry.partyName}</span>
                      <span className="amount-dr">{entry.type === 'gave' ? `₹${entry.amount.toFixed(0)}` : ''}</span>
                      <span className="amount-cr">{entry.type === 'got' ? `₹${entry.amount.toFixed(0)}` : ''}</span>
                    </div>
                  ))}
                  {dayBookEntries.length > 0 && (
                    <div className="report-table-footer">
                      <span></span><span>Total</span>
                      <span className="amount-dr">₹{dayBookEntries.filter(e => e.type === 'gave').reduce((s, e) => s + e.amount, 0).toFixed(0)}</span>
                      <span className="amount-cr">₹{dayBookEntries.filter(e => e.type === 'got').reduce((s, e) => s + e.amount, 0).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Cash/Bank Book ─── */}
            {reportsView === 'cashbook' && (
              <div className="report-detail">
                <div className="report-date-filter">
                  <input type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)} />
                  <span>to</span>
                  <input type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)} />
                </div>
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Date</span><span>Account</span><span>In</span><span>Out</span>
                  </div>
                  {cashBankBookEntries.length === 0 && <p className="muted empty-text">No cash/bank entries in this period</p>}
                  {cashBankBookEntries.map(entry => (
                    <div key={entry.id} className="report-table-row">
                      <span>{formatDateDDMMYY(entry.entry_date)}</span>
                      <span>{entry.partyName}</span>
                      <span className="amount-cr">{entry.type === 'got' ? `₹${entry.amount.toFixed(0)}` : ''}</span>
                      <span className="amount-dr">{entry.type === 'gave' ? `₹${entry.amount.toFixed(0)}` : ''}</span>
                    </div>
                  ))}
                  {cashBankBookEntries.length > 0 && (
                    <div className="report-table-footer">
                      <span></span><span>Total</span>
                      <span className="amount-cr">₹{cashBankBookEntries.filter(e => e.type === 'got').reduce((s, e) => s + e.amount, 0).toFixed(0)}</span>
                      <span className="amount-dr">₹{cashBankBookEntries.filter(e => e.type === 'gave').reduce((s, e) => s + e.amount, 0).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Trial Balance ─── */}
            {reportsView === 'trial_balance' && (
              <div className="report-detail">
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Ledger</span><span>Debit ₹</span><span>Credit ₹</span>
                  </div>
                  {trialBalance.rows.length === 0 && <p className="muted empty-text">No transactions yet</p>}
                  {trialBalance.rows.map(row => (
                    <div key={row.name} className="report-table-row">
                      <span>{row.name}</span>
                      <span className="amount-dr">{row.debit > 0 ? `₹${row.debit.toFixed(0)}` : ''}</span>
                      <span className="amount-cr">{row.credit > 0 ? `₹${row.credit.toFixed(0)}` : ''}</span>
                    </div>
                  ))}
                  <div className="report-table-footer">
                    <span>Total</span>
                    <span className="amount-dr">₹{trialBalance.totalDr.toFixed(0)}</span>
                    <span className="amount-cr">₹{trialBalance.totalCr.toFixed(0)}</span>
                  </div>
                  {Math.abs(trialBalance.totalDr - trialBalance.totalCr) < 0.01 && trialBalance.rows.length > 0 && (
                    <p className="report-balanced-badge">✓ Trial Balance is balanced</p>
                  )}
                </div>
              </div>
            )}

            {/* ─── Profit & Loss ─── */}
            {reportsView === 'profit_loss' && (
              <div className="report-detail">
                <div className="report-pl-section">
                  <h4 className="report-section-title income-title">Income</h4>
                  {profitLoss.income.length === 0 && <p className="muted empty-text">No income recorded</p>}
                  {profitLoss.income.map(item => (
                    <div key={item.name} className="report-pl-row">
                      <span>{item.name}</span>
                      <span className="amount-positive">₹{item.amount.toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="report-pl-subtotal">
                    <span>Total Income</span>
                    <span className="amount-positive">₹{profitLoss.totalIncome.toFixed(0)}</span>
                  </div>
                </div>
                <div className="report-pl-section">
                  <h4 className="report-section-title expense-title">Expenses</h4>
                  {profitLoss.expenses.length === 0 && <p className="muted empty-text">No expenses recorded</p>}
                  {profitLoss.expenses.map(item => (
                    <div key={item.name} className="report-pl-row">
                      <span>{item.name}</span>
                      <span className="amount-negative">₹{item.amount.toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="report-pl-subtotal">
                    <span>Total Expenses</span>
                    <span className="amount-negative">₹{profitLoss.totalExpenses.toFixed(0)}</span>
                  </div>
                </div>
                <div className={`report-pl-net ${profitLoss.netProfit >= 0 ? 'net-profit' : 'net-loss'}`}>
                  <span>{profitLoss.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span>₹{Math.abs(profitLoss.netProfit).toFixed(0)}</span>
                </div>
              </div>
            )}

            {/* ─── Balance Sheet ─── */}
            {reportsView === 'balance_sheet' && (
              <div className="report-detail">
                <div className="report-bs-section">
                  <h4 className="report-section-title asset-title">Assets</h4>
                  {balanceSheet.assets.length === 0 && <p className="muted empty-text">No assets</p>}
                  {balanceSheet.assets.map(item => (
                    <div key={item.name} className="report-pl-row">
                      <span>{item.name}</span>
                      <span>₹{item.amount.toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="report-pl-subtotal">
                    <span>Total Assets</span>
                    <span>₹{balanceSheet.totalAssets.toFixed(0)}</span>
                  </div>
                </div>
                <div className="report-bs-section">
                  <h4 className="report-section-title liability-title">Liabilities</h4>
                  {balanceSheet.liabilities.length === 0 && <p className="muted empty-text">No liabilities</p>}
                  {balanceSheet.liabilities.map(item => (
                    <div key={item.name} className="report-pl-row">
                      <span>{item.name}</span>
                      <span>₹{item.amount.toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="report-pl-subtotal">
                    <span>Total Liabilities</span>
                    <span>₹{balanceSheet.totalLiabilities.toFixed(0)}</span>
                  </div>
                </div>
                {balanceSheet.plNetProfit !== 0 && (
                  <div className="report-bs-pl-carry">
                    <span>{balanceSheet.plNetProfit >= 0 ? 'P&L (Net Profit)' : 'P&L (Net Loss)'}</span>
                    <span>₹{Math.abs(balanceSheet.plNetProfit).toFixed(0)}</span>
                  </div>
                )}
                <div className="report-bs-networth">
                  <span>Net Worth</span>
                  <span>₹{balanceSheet.netWorth.toFixed(0)}</span>
                </div>
              </div>
            )}

            {/* ─── Outstanding ─── */}
            {reportsView === 'outstanding' && (
              <div className="report-detail">
                <div className="report-tabs">
                  <button className={outstandingTab === 'receivable' ? 'active' : ''} onClick={() => setOutstandingTab('receivable')}>
                    Receivable ({outstanding.receivables.length})
                  </button>
                  <button className={outstandingTab === 'payable' ? 'active' : ''} onClick={() => setOutstandingTab('payable')}>
                    Payable ({outstanding.payables.length})
                  </button>
                </div>

                {outstandingTab === 'receivable' && (
                  <div className="report-outstanding-list">
                    {outstanding.receivables.length === 0 && <p className="muted empty-text">No outstanding receivables</p>}
                    {outstanding.receivables.map(item => (
                      <div key={item.name} className="report-outstanding-row">
                        <div>
                          <p className="outstanding-party">{item.name}</p>
                          {item.phone && <p className="outstanding-phone">{item.phone}</p>}
                        </div>
                        <span className="amount-positive">₹{item.amount.toFixed(0)}</span>
                      </div>
                    ))}
                    <div className="report-outstanding-total">
                      <span>Total Receivable</span>
                      <span className="amount-positive">₹{outstanding.totalReceivable.toFixed(0)}</span>
                    </div>
                  </div>
                )}

                {outstandingTab === 'payable' && (
                  <div className="report-outstanding-list">
                    {outstanding.payables.length === 0 && <p className="muted empty-text">No outstanding payables</p>}
                    {outstanding.payables.map(item => (
                      <div key={item.name} className="report-outstanding-row">
                        <div>
                          <p className="outstanding-party">{item.name}</p>
                          {item.phone && <p className="outstanding-phone">{item.phone}</p>}
                        </div>
                        <span className="amount-negative">₹{item.amount.toFixed(0)}</span>
                      </div>
                    ))}
                    <div className="report-outstanding-total">
                      <span>Total Payable</span>
                      <span className="amount-negative">₹{outstanding.totalPayable.toFixed(0)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── Stock Summary ─── */}
            {reportsView === 'stock_summary' && (
              <div className="report-detail">
                <div className="report-stock-summary-header">
                  <span>{stockSummary.totalItems} items</span>
                  <span>Total stock: {stockSummary.totalStock.toFixed(0)}</span>
                </div>
                {stockSummary.categories.map(cat => (
                  <div key={cat.category} className="report-stock-category">
                    <h4 className="report-stock-cat-title">{cat.category}</h4>
                    {cat.items.map(item => (
                      <div key={item.name} className="report-stock-row">
                        <span>{item.name}</span>
                        <span className={item.stock <= 0 ? 'stock-zero' : 'stock-positive'}>{item.stock.toFixed(0)} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {showFooter && (
        <div className="app-footer-nav">
          <button
            type="button"
            className={section === 'dashboard' ? 'active' : ''}
            aria-label="Home"
            onClick={() => {
              setSelectedInventoryItemId('');
              setSection('dashboard');
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M3.5 10.5 12 3.5l8.5 7v9.5a.5.5 0 0 1-.5.5h-5.5v-6h-5v6H4a.5.5 0 0 1-.5-.5z" />
              </svg>
            </span>
            <span className="nav-label">Home</span>
          </button>
          <button
            type="button"
            className={section === 'inventory' ? 'active' : ''}
            aria-label="Inventories"
            onClick={() => {
              setSelectedContactId('');
              setSelectedInventoryItemId('');
              setSection('inventory');
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 4v16" />
                <path d="M7 4v16" />
                <path d="M10 4v16" />
                <path d="M14 4v16" />
                <path d="M18 4v16" />
                <path d="M20 4v16" />
              </svg>
            </span>
            <span className="nav-label">Stock</span>
          </button>
          <button
            type="button"
            className={section === 'invoices' ? 'active' : ''}
            aria-label="Invoices"
            onClick={() => {
              setSelectedContactId('');
              setSelectedInventoryItemId('');
              setSection('invoices');
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M6.5 2.5h9l3.5 3.5V19a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 19V5A2.5 2.5 0 0 1 6.5 2.5z" />
                <path d="M15.5 2.5V6h3.5" />
                <path d="M8 10h8" />
                <path d="M8 13h8" />
                <path d="M8 16h6" />
              </svg>
            </span>
            <span className="nav-label">Bills</span>
          </button>
          <button
            type="button"
            className={section === 'reports' ? 'active' : ''}
            aria-label="Reports"
            onClick={() => {
              setSelectedContactId('');
              setSelectedInventoryItemId('');
              setSection('reports');
              setReportsView('hub');
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 20V10l4-6h8l4 6v10z" />
                <path d="M8 14h8" />
                <path d="M8 17h5" />
              </svg>
            </span>
            <span className="nav-label">Reports</span>
          </button>
        </div>
      )}

      {/* ─── Payment / Receipt Voucher Fullpage ─── */}
      {(activeVoucherType === 'payment' || activeVoucherType === 'receipt') && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header">
            <button type="button" className="icon-btn" onClick={() => { setActiveVoucherType(null); resetVoucherForm(); }}>←</button>
            <h3>{activeVoucherType === 'payment' ? '💳 Payment Voucher' : '📥 Receipt Voucher'}</h3>
          </div>
          <div className="invoice-fp-body">
            <div className="invoice-fp-section">
              {/* Party */}
              <div className="invoice-fp-field">
                <span className="input-label">Party</span>
                <div className="combobox">
                  <input
                    type="text"
                    placeholder="Search party..."
                    value={voucherPartySearch}
                    onChange={(e) => { setVoucherPartySearch(e.target.value); setVoucherShowPartyList(true); }}
                    onFocus={() => setVoucherShowPartyList(true)}
                  />
                  {voucherShowPartyList && (
                    <div className="combobox-list">
                      {contacts
                        .filter((c) => c.name.toLowerCase().includes(voucherPartySearch.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="combobox-option"
                            onClick={() => {
                              setVoucherParty(c.id);
                              setVoucherPartySearch(c.name);
                              setVoucherShowPartyList(false);
                            }}
                          >
                            <span className="combobox-option-main">{c.name}</span>
                            <span className="combobox-option-sub">{formatContactCategory(c.category)}</span>
                          </button>
                        ))}
                      {contacts.filter((c) => c.name.toLowerCase().includes(voucherPartySearch.toLowerCase())).length === 0 && (
                        <p className="combobox-empty">No parties found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Date + Note */}
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <span className="input-label">Date</span>
                  <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
                </div>
                <div className="invoice-fp-field">
                  <span className="input-label">Note</span>
                  <input type="text" placeholder="Narration" value={voucherNote} onChange={(e) => setVoucherNote(e.target.value)} />
                </div>
              </div>
              {/* Amount */}
              <div className="invoice-fp-field">
                <span className="input-label">Amount ₹</span>
                <input type="number" inputMode="decimal" placeholder="0" value={voucherAmount} onChange={(e) => setVoucherAmount(e.target.value)} />
              </div>
              {/* Payment Mode */}
              <div className="invoice-fp-field">
                <span className="input-label">Payment Mode</span>
                <div className="payment-mode-pills">
                  {(['cash', 'bank', 'upi'] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`payment-mode-pill ${voucherPaymentMode === mode ? 'active' : ''}`}
                      onClick={() => setVoucherPaymentMode(mode)}
                    >
                      {mode === 'cash' ? '💵 Cash' : mode === 'bank' ? '🏦 Bank' : '📱 UPI'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Total</span>
              <strong>₹{Number(voucherAmount || 0).toFixed(0)}</strong>
            </div>
            <button type="button" className="invoice-fp-save-btn" onClick={() => void submitPaymentReceipt()}>
              {activeVoucherType === 'payment' ? 'Save Payment' : 'Save Receipt'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Journal Voucher Fullpage ─── */}
      {activeVoucherType === 'journal' && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}>
            <button type="button" className="icon-btn" onClick={() => { setActiveVoucherType(null); resetVoucherForm(); }}>←</button>
            <h3>📓 Journal Voucher</h3>
          </div>
          <div className="invoice-fp-body">
            <div className="invoice-fp-section">
              {/* Debit Ledger */}
              <div className="invoice-fp-field">
                <span className="input-label">Debit Ledger (Dr)</span>
                <div className="combobox">
                  <input
                    type="text"
                    placeholder="Search debit party..."
                    value={journalDebitSearch}
                    onChange={(e) => { setJournalDebitSearch(e.target.value); setJournalShowDebitList(true); }}
                    onFocus={() => setJournalShowDebitList(true)}
                  />
                  {journalShowDebitList && (
                    <div className="combobox-list">
                      {contacts
                        .filter((c) => c.name.toLowerCase().includes(journalDebitSearch.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="combobox-option"
                            onClick={() => {
                              setJournalDebitLedger(c.id);
                              setJournalDebitSearch(c.name);
                              setJournalShowDebitList(false);
                            }}
                          >
                            <span className="combobox-option-main">{c.name}</span>
                            <span className="combobox-option-sub">{formatContactCategory(c.category)}</span>
                          </button>
                        ))}
                      {contacts.filter((c) => c.name.toLowerCase().includes(journalDebitSearch.toLowerCase())).length === 0 && (
                        <p className="combobox-empty">No parties found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Credit Ledger */}
              <div className="invoice-fp-field">
                <span className="input-label">Credit Ledger (Cr)</span>
                <div className="combobox">
                  <input
                    type="text"
                    placeholder="Search credit party..."
                    value={journalCreditSearch}
                    onChange={(e) => { setJournalCreditSearch(e.target.value); setJournalShowCreditList(true); }}
                    onFocus={() => setJournalShowCreditList(true)}
                  />
                  {journalShowCreditList && (
                    <div className="combobox-list">
                      {contacts
                        .filter((c) => c.name.toLowerCase().includes(journalCreditSearch.toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="combobox-option"
                            onClick={() => {
                              setJournalCreditLedger(c.id);
                              setJournalCreditSearch(c.name);
                              setJournalShowCreditList(false);
                            }}
                          >
                            <span className="combobox-option-main">{c.name}</span>
                            <span className="combobox-option-sub">{formatContactCategory(c.category)}</span>
                          </button>
                        ))}
                      {contacts.filter((c) => c.name.toLowerCase().includes(journalCreditSearch.toLowerCase())).length === 0 && (
                        <p className="combobox-empty">No parties found</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Date + Amount */}
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <span className="input-label">Date</span>
                  <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
                </div>
                <div className="invoice-fp-field">
                  <span className="input-label">Amount ₹</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={voucherAmount} onChange={(e) => setVoucherAmount(e.target.value)} />
                </div>
              </div>
              {/* Narration */}
              <div className="invoice-fp-field">
                <span className="input-label">Narration</span>
                <input type="text" placeholder="Journal note..." value={voucherNote} onChange={(e) => setVoucherNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Journal Amount</span>
              <strong>₹{Number(voucherAmount || 0).toFixed(0)}</strong>
            </div>
            <button type="button" className="invoice-fp-save-btn" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }} onClick={() => void submitJournal()}>
              Save Journal Entry
            </button>
          </div>
        </div>
      )}

      {/* ─── Contra Voucher Fullpage ─── */}
      {activeVoucherType === 'contra' && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header" style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' }}>
            <button type="button" className="icon-btn" onClick={() => { setActiveVoucherType(null); resetVoucherForm(); }}>←</button>
            <h3>🔄 Contra Voucher</h3>
          </div>
          <div className="invoice-fp-body">
            <div className="invoice-fp-section">
              <div className="invoice-fp-field">
                <span className="input-label">From Account (Dr)</span>
                <div className="combobox">
                  <input type="text" placeholder="Search account..." value={contraFromSearch} onChange={e => { setContraFromSearch(e.target.value); setContraShowFromList(true); }} onFocus={() => setContraShowFromList(true)} />
                  {contraShowFromList && (
                    <div className="combobox-list">
                      {contacts.filter(c => c.name.toLowerCase().includes(contraFromSearch.toLowerCase())).map(c => (
                        <button key={c.id} type="button" className="combobox-option" onClick={() => { setContraFromLedger(c.id); setContraFromSearch(c.name); setContraShowFromList(false); }}>
                          <span className="combobox-option-main">{c.name}</span>
                          <span className="combobox-option-sub">{formatContactCategory(c.category)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="invoice-fp-field">
                <span className="input-label">To Account (Cr)</span>
                <div className="combobox">
                  <input type="text" placeholder="Search account..." value={contraToSearch} onChange={e => { setContraToSearch(e.target.value); setContraShowToList(true); }} onFocus={() => setContraShowToList(true)} />
                  {contraShowToList && (
                    <div className="combobox-list">
                      {contacts.filter(c => c.name.toLowerCase().includes(contraToSearch.toLowerCase())).map(c => (
                        <button key={c.id} type="button" className="combobox-option" onClick={() => { setContraToLedger(c.id); setContraToSearch(c.name); setContraShowToList(false); }}>
                          <span className="combobox-option-main">{c.name}</span>
                          <span className="combobox-option-sub">{formatContactCategory(c.category)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <span className="input-label">Date</span>
                  <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} />
                </div>
                <div className="invoice-fp-field">
                  <span className="input-label">Amount ₹</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} />
                </div>
              </div>
              <div className="invoice-fp-field">
                <span className="input-label">Narration</span>
                <input type="text" placeholder="Contra note..." value={voucherNote} onChange={e => setVoucherNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Transfer Amount</span>
              <strong>₹{Number(voucherAmount || 0).toFixed(0)}</strong>
            </div>
            <button type="button" className="invoice-fp-save-btn" style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' }} onClick={() => void submitContra()}>
              Save Contra Entry
            </button>
          </div>
        </div>
      )}

      {/* ─── Credit Note Fullpage ─── */}
      {activeVoucherType === 'credit_note' && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}>
            <button type="button" className="icon-btn" onClick={() => { setActiveVoucherType(null); resetVoucherForm(); }}>←</button>
            <h3>📤 Credit Note</h3>
          </div>
          <div className="invoice-fp-body">
            <div className="invoice-fp-section">
              <div className="invoice-fp-field">
                <span className="input-label">Party</span>
                <div className="combobox">
                  <input type="text" placeholder="Search party..." value={voucherPartySearch} onChange={e => { setVoucherPartySearch(e.target.value); setVoucherShowPartyList(true); }} onFocus={() => setVoucherShowPartyList(true)} />
                  {voucherShowPartyList && (
                    <div className="combobox-list">
                      {contacts.filter(c => c.name.toLowerCase().includes(voucherPartySearch.toLowerCase())).map(c => (
                        <button key={c.id} type="button" className="combobox-option" onClick={() => { setVoucherParty(c.id); setVoucherPartySearch(c.name); setVoucherShowPartyList(false); }}>
                          <span className="combobox-option-main">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <span className="input-label">Date</span>
                  <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} />
                </div>
                <div className="invoice-fp-field">
                  <span className="input-label">Amount ₹</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} />
                </div>
              </div>
              <div className="invoice-fp-field">
                <span className="input-label">Reason</span>
                <input type="text" placeholder="Credit note reason..." value={voucherNote} onChange={e => setVoucherNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Credit Note Amount</span>
              <strong>₹{Number(voucherAmount || 0).toFixed(0)}</strong>
            </div>
            <button type="button" className="invoice-fp-save-btn" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }} onClick={() => void submitCreditNote()}>
              Save Credit Note
            </button>
          </div>
        </div>
      )}

      {/* ─── Debit Note Fullpage ─── */}
      {activeVoucherType === 'debit_note' && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}>
            <button type="button" className="icon-btn" onClick={() => { setActiveVoucherType(null); resetVoucherForm(); }}>←</button>
            <h3>📥 Debit Note</h3>
          </div>
          <div className="invoice-fp-body">
            <div className="invoice-fp-section">
              <div className="invoice-fp-field">
                <span className="input-label">Party</span>
                <div className="combobox">
                  <input type="text" placeholder="Search party..." value={voucherPartySearch} onChange={e => { setVoucherPartySearch(e.target.value); setVoucherShowPartyList(true); }} onFocus={() => setVoucherShowPartyList(true)} />
                  {voucherShowPartyList && (
                    <div className="combobox-list">
                      {contacts.filter(c => c.name.toLowerCase().includes(voucherPartySearch.toLowerCase())).map(c => (
                        <button key={c.id} type="button" className="combobox-option" onClick={() => { setVoucherParty(c.id); setVoucherPartySearch(c.name); setVoucherShowPartyList(false); }}>
                          <span className="combobox-option-main">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <span className="input-label">Date</span>
                  <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} />
                </div>
                <div className="invoice-fp-field">
                  <span className="input-label">Amount ₹</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} />
                </div>
              </div>
              <div className="invoice-fp-field">
                <span className="input-label">Reason</span>
                <input type="text" placeholder="Debit note reason..." value={voucherNote} onChange={e => setVoucherNote(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Debit Note Amount</span>
              <strong>₹{Number(voucherAmount || 0).toFixed(0)}</strong>
            </div>
            <button type="button" className="invoice-fp-save-btn" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }} onClick={() => void submitDebitNote()}>
              Save Debit Note
            </button>
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <div className="invoice-fullpage">
          {/* ─── Header ─── */}
          <div className="invoice-fp-header">
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setShowInvoiceForm(false);
                setEditingInvoiceId(null);
                setInvoiceLines([]);
                setInvoiceLineDraft({ item_id: '', quantity: '', rate: '' });
                setInvoiceSettlementAmount('');
              }}
            >
              ←
            </button>
            <h3>
              {editingInvoiceId
                ? `Edit ${invoiceKind === 'purchase' ? 'Purchase' : 'Sales'} Invoice`
                : invoiceKind === 'purchase'
                  ? 'New Purchase Invoice'
                  : 'New Sales Invoice'}
            </h3>
          </div>

          {/* ─── Form Body ─── */}
          <div className="invoice-fp-body">
            {/* Party & Date */}
            <div className="invoice-fp-section">
              <div className="invoice-fp-field">
                <label className="input-label">
                  {invoiceKind === 'purchase' ? 'Supplier' : 'Customer'}
                </label>
                <div className="combobox">
                  <input
                    value={invoicePartySearch || invoiceParty}
                    onChange={(e) => {
                      setInvoicePartySearch(e.target.value);
                      setInvoiceParty('');
                      setInvoicePartyDropdownOpen(true);
                    }}
                    onFocus={() => setInvoicePartyDropdownOpen(true)}
                    placeholder="Search or type party name..."
                    autoComplete="off"
                  />
                  {invoicePartyDropdownOpen && (invoicePartySearch || !invoiceParty) && (
                    <div className="combobox-list">
                      {filteredInvoiceParties.length > 0 ? (
                        filteredInvoiceParties.map((contact) => (
                          <button
                            key={contact.id}
                            type="button"
                            className="combobox-option"
                            onClick={() => {
                              setInvoiceParty(contact.name);
                              setInvoicePartySearch('');
                              setInvoicePartyDropdownOpen(false);
                            }}
                          >
                            <strong>{contact.name}</strong>
                            <span className="muted">{formatContactCategory(contact.category)}</span>
                          </button>
                        ))
                      ) : (
                        <div className="combobox-empty">No matches — name will be used as-is</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="invoice-fp-row-2">
                <div className="invoice-fp-field">
                  <label className="input-label">Date</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
                </div>
                <div className="invoice-fp-field">
                  <label className="input-label">Note (optional)</label>
                  <input
                    value={invoiceNote}
                    onChange={(e) => setInvoiceNote(e.target.value)}
                    placeholder="e.g. Bill #123"
                  />
                </div>
              </div>
              <div className="invoice-fp-field">
                <label className="input-label">{invoiceKind === 'sale' ? 'Received ₹' : 'Paid ₹'}</label>
                <input
                  value={invoiceSettlementAmount}
                  onChange={(e) => setInvoiceSettlementAmount(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* ─── Items Table ─── */}
            <div className="invoice-fp-section">
              <label className="input-label">Line Items</label>

              {/* Added items */}
              {invoiceLines.length > 0 && (
                <div className="invoice-fp-table">
                  <div className="invoice-fp-table-head">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span></span>
                  </div>
                  {invoiceLines.map((line, index) => {
                    const item = inventoryItems.find((entry) => entry.id === line.item_id);
                    const qty = Number(line.quantity);
                    const rate = Number(line.rate);
                    return (
                      <div key={`${line.item_id}-${index}`} className="invoice-fp-table-row">
                        <span className="invoice-fp-item-name">{item?.name ?? '—'}</span>
                        <span>{qty.toFixed(2)}</span>
                        <span>₹{rate.toFixed(0)}</span>
                        <span className="invoice-fp-amt">₹{(qty * rate).toFixed(0)}</span>
                        <button type="button" className="icon-btn invoice-fp-remove" onClick={() => removeInvoiceLine(index)}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add-item row with search + barcode */}
              <div className="invoice-fp-item-picker">
                <div className="combobox">
                  <div className="combobox-input-row">
                    <input
                      value={invoiceItemSearch}
                      onChange={(e) => {
                        setInvoiceItemSearch(e.target.value);
                        setInvoiceLineDraft((prev) => ({ ...prev, item_id: '' }));
                        setInvoiceItemDropdownOpen(true);
                      }}
                      onFocus={() => setInvoiceItemDropdownOpen(true)}
                      placeholder="Search item or scan barcode..."
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="combobox-scan-btn"
                      onClick={() => openBarcodeScanner('invoice-item')}
                      title="Scan barcode"
                    >
                      📷
                    </button>
                  </div>
                  {invoiceItemDropdownOpen && invoiceItemSearch && (
                    <div className="combobox-list">
                      {filteredInvoiceItems.length > 0 ? (
                        filteredInvoiceItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="combobox-option"
                            onClick={() => {
                              setInvoiceLineDraft((prev) => ({ ...prev, item_id: item.id }));
                              setInvoiceItemSearch(item.name);
                              setInvoiceItemDropdownOpen(false);
                            }}
                          >
                            <div className="combobox-option-main">{item.name}</div>
                            <div className="combobox-option-sub">{item.unit ?? 'NOS'}{item.barcode ? ` • ${item.barcode}` : ''}</div>
                          </button>
                        ))
                      ) : (
                        <div className="combobox-empty">No items found</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="invoice-fp-item-picker-inputs">
                  <input
                    value={invoiceLineDraft.quantity}
                    onChange={(e) => setInvoiceLineDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Qty"
                    className="invoice-fp-qty-input"
                  />
                  <input
                    value={invoiceLineDraft.rate}
                    onChange={(e) => setInvoiceLineDraft((prev) => ({ ...prev, rate: e.target.value }))}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rate ₹"
                    className="invoice-fp-rate-input"
                  />
                  <button type="button" onClick={() => { addInvoiceLine(); setInvoiceItemSearch(''); }} className="invoice-fp-add-btn">
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Sticky Bottom ─── */}
          <div className="invoice-fp-footer">
            <div className="invoice-fp-total-row">
              <span>Total ({invoiceLines.length} item{invoiceLines.length !== 1 ? 's' : ''})</span>
              <strong>₹{invoiceTotal.toFixed(2)}</strong>
            </div>
            <button
              type="button"
              className="invoice-fp-save-btn"
              onClick={() => void saveInvoice()}
            >
              {editingInvoiceId ? '✓ Update Invoice' : '✓ Save Invoice'}
            </button>
          </div>
        </div>
      )}

      {invoiceActionTargetId && (
        <div className="invoice-fullpage">
          <div className="invoice-fp-header">
            <button type="button" className="icon-btn" onClick={() => setInvoiceActionTargetId(null)}>
              ←
            </button>
            <h3>
              {selectedInvoiceDetails
                ? `${selectedInvoiceDetails.kind === 'purchase' ? 'Purchase' : 'Sales'} Invoice`
                : 'Invoice'}
            </h3>
          </div>

          {selectedInvoiceDetails ? (
            <div className="invoice-fp-body">
              <div className="invoice-fp-section">
                <div className="invoice-fp-info-row">
                  <span className="input-label">{selectedInvoiceDetails.kind === 'purchase' ? 'Supplier' : 'Customer'}</span>
                  <strong>{selectedInvoiceDetails.party}</strong>
                </div>
                <div className="invoice-fp-info-row">
                  <span className="input-label">Date</span>
                  <strong>{formatDateDDMMYY(selectedInvoiceDetails.date)}</strong>
                </div>
                {selectedInvoiceDetails.note && (
                  <div className="invoice-fp-info-row">
                    <span className="input-label">Note</span>
                    <span>{selectedInvoiceDetails.note}</span>
                  </div>
                )}
              </div>

              <div className="invoice-fp-section">
                <label className="input-label">Items</label>
                <div className="invoice-fp-table">
                  <div className="invoice-fp-table-head">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span></span>
                  </div>
                  {selectedInvoiceDetails.lines.map((line, index) => (
                    <div key={`${line.name}-${index}`} className="invoice-fp-table-row">
                      <span className="invoice-fp-item-name">{line.name}</span>
                      <span>{formatCompactQuantity(line.quantity)}</span>
                      <span>₹{line.rate.toFixed(0)}</span>
                      <span className="invoice-fp-amt">₹{(line.quantity * line.rate).toFixed(0)}</span>
                      <span></span>
                    </div>
                  ))}
                </div>

                <div className="invoice-fp-total-row" style={{ marginTop: '12px' }}>
                  <span>Total</span>
                  <strong>₹{selectedInvoiceDetails.totalValue.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="invoice-fp-body">
              <p className="muted" style={{ padding: '20px' }}>Invoice details not found.</p>
            </div>
          )}

          <div className="invoice-fp-footer">
            <div className="invoice-fp-actions-row">
              <button type="button" onClick={() => openInvoiceEditor(invoiceActionTargetId)} disabled={!selectedInvoiceDetails}>
                ✏️ Edit
              </button>
              <button
                type="button"
                className="danger-solid"
                onClick={() => void deleteInvoice(invoiceActionTargetId)}
                disabled={!selectedInvoiceDetails}
              >
                🗑 Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {entryDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEntryDraft();
            }}
          >
            <h4>{entryDraft.type === 'gave' ? 'Add You Gave Entry' : 'Add You Got Entry'}</h4>
            <input
              value={entryDraft.amount}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))}
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              required
            />
            <input
              value={entryDraft.note}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))}
              placeholder="Note (optional)"
              autoCapitalize="sentences"
            />
            <input
              type="date"
              value={entryDraft.entryDate}
              onChange={(e) => setEntryDraft((draft) => (draft ? { ...draft, entryDate: e.target.value } : draft))}
              required
            />
            <div className="row">
              <button type="button" className="link" onClick={() => setEntryDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {inventoryDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInventoryDraft();
            }}
          >
            <h4>{inventoryDraft.type === 'in' ? 'Stock In' : 'Stock Out'}</h4>
            <p className="muted">{selectedInventoryItem?.name ?? 'Selected item'}</p>
            <input
              value={inventoryDraft.quantity}
              onChange={(e) =>
                setInventoryDraft((draft) => (draft ? { ...draft, quantity: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Quantity"
              required
            />
            <input
              value={inventoryDraft.note}
              onChange={(e) => setInventoryDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))}
              placeholder="Note (optional)"
            />
            <input
              type="date"
              value={inventoryDraft.movementDate}
              onChange={(e) =>
                setInventoryDraft((draft) => (draft ? { ...draft, movementDate: e.target.value } : draft))
              }
              required
            />
            <div className="row">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setInventoryDraft(null);
                }}
              >
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {entryActionDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEntryAction();
            }}
          >
            <h4>Entry Action</h4>
            <input
              value={entryActionDraft.amount}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              required
            />
            <input
              value={entryActionDraft.note}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))
              }
              placeholder="Note (optional)"
              autoCapitalize="sentences"
            />
            <select
              value={entryActionDraft.type}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, type: e.target.value as EntryType } : draft))
              }
            >
              <option value="gave">You gave</option>
              <option value="got">You got</option>
            </select>
            <input
              type="date"
              value={entryActionDraft.entryDate}
              onChange={(e) =>
                setEntryActionDraft((draft) => (draft ? { ...draft, entryDate: e.target.value } : draft))
              }
              required
            />
            <div className="row">
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!entryActionDraft) return;
                  if (!window.confirm('Delete this entry permanently?')) return;
                  void deleteEntry(entryActionDraft.id);
                  setEntryActionDraft(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setEntryActionDraft(null)}>
                Cancel
              </button>
              <button type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {movementActionDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMovementAction();
            }}
          >
            <h4>Stock Movement Action</h4>
            <input
              value={movementActionDraft.quantity}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, quantity: e.target.value } : draft))
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="Quantity"
              required
            />
            <input
              value={movementActionDraft.note}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, note: e.target.value } : draft))
              }
              placeholder="Note (optional)"
            />
            <select
              value={movementActionDraft.type}
              onChange={(e) =>
                setMovementActionDraft((draft) =>
                  draft ? { ...draft, type: e.target.value as InventoryMovementType } : draft
                )
              }
            >
              <option value="in">Stock In</option>
              <option value="out">Stock Out</option>
            </select>
            <input
              type="date"
              value={movementActionDraft.movementDate}
              onChange={(e) =>
                setMovementActionDraft((draft) => (draft ? { ...draft, movementDate: e.target.value } : draft))
              }
              required
            />

            <div className="row">
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!movementActionDraft) return;
                  if (!window.confirm('Delete this stock movement permanently?')) return;
                  void deleteMovement(movementActionDraft.id);
                  setMovementActionDraft(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setMovementActionDraft(null)}>
                Cancel
              </button>
              <button type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {editContactDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditedContact();
            }}
          >
            <h4>Edit Customer</h4>
            <input
              value={editContactDraft.name}
              onChange={(e) =>
                setEditContactDraft((draft) => (draft ? { ...draft, name: e.target.value } : draft))
              }
              placeholder="Customer name"
              autoCapitalize="words"
              required
            />
            <input
              value={editContactDraft.phone}
              onChange={(e) =>
                setEditContactDraft((draft) => (draft ? { ...draft, phone: e.target.value } : draft))
              }
              placeholder="Mobile number (optional)"
            />
            <select
              value={editContactDraft.category}
              onChange={(e) =>
                setEditContactDraft((draft) =>
                  draft ? { ...draft, category: e.target.value as ContactCategory } : draft
                )
              }
            >
              {CONTACT_CATEGORIES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <div className="row">
              <button
                type="button"
                className="danger-solid"
                onClick={() => {
                  if (!editContactDraft) return;
                  if (!window.confirm('Delete this customer and all related entries?')) return;
                  const targetId = editContactDraft.id;
                  setEditContactDraft(null);
                  void deleteSelectedContact(targetId);
                }}
              >
                Delete
              </button>
              <button type="button" className="link" onClick={() => setEditContactDraft(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {editInventoryItemDraft && (
        <div className="entry-edit-overlay">
          <form
            className="entry-edit-modal stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditedInventoryItem();
            }}
          >
            <h4>Edit Item</h4>
            <input
              value={editInventoryItemDraft.name}
              onChange={(e) =>
                setEditInventoryItemDraft((draft) => (draft ? { ...draft, name: e.target.value } : draft))
              }
              placeholder="Item name"
              autoCapitalize="words"
              required
            />
            <div className="search-row search-row-with-action">
              <input
                value={editInventoryItemDraft.barcode}
                onChange={(e) =>
                  setEditInventoryItemDraft((draft) => (draft ? { ...draft, barcode: e.target.value } : draft))
                }
                placeholder="Barcode (optional)"
              />
              <button type="button" className="scan-inline-btn" onClick={() => void openBarcodeScanner('edit-item')}>
                Scan
              </button>
            </div>
            <div className="inventory-form-row">
              <select
                value={editInventoryItemDraft.unit}
                onChange={(e) =>
                  setEditInventoryItemDraft((draft) =>
                    draft ? { ...draft, unit: e.target.value.toUpperCase() } : draft
                  )
                }
              >
                {!INVENTORY_UNITS.includes(editInventoryItemDraft.unit) && (
                  <option value={editInventoryItemDraft.unit}>{editInventoryItemDraft.unit}</option>
                )}
                {INVENTORY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <select
                value={editInventoryItemDraft.category}
                onChange={(e) =>
                  setEditInventoryItemDraft((draft) =>
                    draft ? { ...draft, category: e.target.value } : draft
                  )
                }
              >
                <option value="">Select Category</option>
                {inventoryCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value="__custom__">+ Add New Category</option>
              </select>
            </div>
            {editInventoryItemDraft.category === '__custom__' && (
              <input
                value={editInventoryCategoryCustom}
                onChange={(e) => setEditInventoryCategoryCustom(e.target.value)}
                placeholder="Type new category"
                autoCapitalize="words"
                required
              />
            )}
            <div className="row">
              <button
                type="button"
                className="link"
                onClick={() => {
                  setEditInventoryCategoryCustom('');
                  setEditInventoryItemDraft(null);
                }}
              >
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {barcodeScanTarget && (
        <div className="barcode-scan-overlay">
          <div className="entry-edit-modal stack">
            <h4>Scan Barcode</h4>
            {barcodeScanError && <p className="muted" style={{ color: 'var(--danger)' }}>{barcodeScanError}</p>}

            {cameraActive && (
              <video
                ref={scannerVideoRef}
                className="barcode-video"
                autoPlay
                playsInline
                muted
              />
            )}

            {!cameraActive && (
              <p className="muted">Scan with live camera or enter barcode manually.</p>
            )}

            <input
              value={manualBarcodeInput}
              onChange={(e) => setManualBarcodeInput(e.target.value)}
              placeholder="Enter barcode manually"
              autoFocus={false}
            />
            <div className="row">
              <button type="button" className="link" onClick={() => closeBarcodeScanner()}>
                Close
              </button>
              <button type="button" onClick={() => submitManualBarcode()}>
                Use Barcode
              </button>
              {!cameraActive ? (
                <button type="button" onClick={() => void startLiveCamera()}>
                  📷 Open Camera
                </button>
              ) : (
                <button type="button" className="link" onClick={() => openBarcodeImagePicker()}>
                  📁 From Photo
                </button>
              )}
            </div>
            <input
              ref={scannerImageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleBarcodeImagePick}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="entry-edit-overlay">
          <div className="entry-edit-modal stack">
            <h4>Delete {deleteDialog.kind === 'contact' ? 'Customer' : 'Entry'}?</h4>
            <p className="muted">
              {deleteDialog.kind === 'contact'
                ? `Delete "${deleteDialog.name}" and all related entries?`
                : 'This entry will be removed permanently.'}
            </p>
            <div className="row">
              <button type="button" className="link" onClick={() => setDeleteDialog(null)}>
                Cancel
              </button>
              <button type="button" className="danger-solid" onClick={() => void confirmDeleteDialog()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="add-party-overlay" style={{ zIndex: 60 }}>
          <div className="add-party-sheet stack" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <h3 style={{ marginBottom: '8px' }}>Log Out</h3>
            <p className="muted" style={{ marginBottom: '24px' }}>Are you sure you want to sign out of KhataPlus?</p>
            <div className="row" style={{ marginTop: 0 }}>
              <button type="button" className="link" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="add-party-save-btn"
                style={{ background: 'var(--danger)' }}
                onClick={() => {
                  setShowLogoutConfirm(false);
                  void signOut();
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsMenu && (
        <div className="add-party-overlay" style={{ zIndex: 50 }}>
          <div className="settings-sheet">
            <div className="settings-header">
              <h3>Settings</h3>
              <button type="button" className="icon-btn" onClick={() => setShowSettingsMenu(false)}>✕</button>
            </div>

            <div className="settings-menu">
              <button type="button" className="settings-item" onClick={() => {
                setShowSettingsMenu(false);
                toast.show('Profile settings coming soon', 'info');
              }}>
                <span className="settings-item-icon">👤</span>
                <span>My Profile</span>
              </button>

              <button type="button" className="settings-item" onClick={() => {
                setShowSettingsMenu(false);
                toast.show('Export functionality coming soon', 'info');
              }}>
                <span className="settings-item-icon">📄</span>
                <span>Export Data</span>
              </button>

              <button type="button" className="settings-item settings-item-danger" onClick={() => {
                setShowSettingsMenu(false);
                setShowLogoutConfirm(true);
              }}>
                <span className="settings-item-icon">🚪</span>
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
