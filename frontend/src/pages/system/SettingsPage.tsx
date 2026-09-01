import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FieldLabel,
  Feedback,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Tile,
} from '../../components/ui/PageShell';
import { DEFAULT_DEVELOPER_CREDIT_LINE } from '../../config/printCredit';
import { APP_DISPLAY_NAME, APP_INVOICE_FOOTER, APP_INVOICE_PREFIX, APP_TAGLINE, dispatchSettingsUpdated } from '../../config/brand';
import { DEFAULT_DEVELOPER_CONFIG, parseDeveloperConfig, type DeveloperPrintConfig } from '../../config/developerPrint';
import { PROTECTED_SETTINGS_FIELD_KEYS } from '../../config/protectedSettingsFields';
import { useTheme } from '../../contexts/ThemeContext';
import { useAccessComboListener } from '../../hooks/useAccessComboListener';
import { api, type BusinessSettings, type CustomLabelPreset, type CustomLabelStyle } from '../../lib/api';
import { confirmAction } from '../../lib/confirmAction';
import { LabelStyleDesigner } from '../../components/products/LabelStyleDesigner';
import {
  contrastingTextColor,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  normalizeHexColor,
} from '../../lib/brandColors';

const HARDCODED_LABEL_KEYS = ['58x40', '33x23', '40x30', '50x25', '50x30', 'a4'] as const;
const FREE_CUSTOM_SIZE_RE = /^(\d{2,3})x(\d{2,3})$/i;

const emptyForm = {
  businessName: APP_DISPLAY_NAME,
  tagline: APP_TAGLINE,
  ownerName: '',
  phoneLabel: 'M Arslan',
  phone: '03024979697',
  whatsappLabel: 'M Usman',
  whatsapp: '03006195469',
  address: 'Bano Bazar Al Nissa Road Near Taleem Un Nisa Madrasa Chishtian',
  developerCreditLine: DEFAULT_DEVELOPER_CREDIT_LINE,
  invoiceFooter: APP_INVOICE_FOOTER,
  returnPolicy:
    'Returns accepted within 7 days with original receipt. Items must be unused and in original condition.',
  invoicePrefix: APP_INVOICE_PREFIX,
  currency: 'PKR',
  receiptSize: 'THERMAL_80' as BusinessSettings['receiptSize'],
  a4InvoiceEnabled: true,
  printerName: '' as string,
  barcodeLabelSize: '58x40',
  barcodeLabelStyle: 'builtin:standard',
  lowStockLimit: 5,
  backupFolderPath: '',
  themeMode: 'light' as BusinessSettings['themeMode'],
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
};

export function SettingsPage() {
  const { theme, setTheme, refreshThemeFromServer, applyBrandTheme } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [identityEditActive, setIdentityEditActive] = useState(false);
  const [accessPromptOpen, setAccessPromptOpen] = useState(false);
  const [accessInput, setAccessInput] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessBusy, setAccessBusy] = useState(false);
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [passphraseMessage, setPassphraseMessage] = useState('');
  const [themeDraftPrimary, setThemeDraftPrimary] = useState(DEFAULT_PRIMARY_COLOR);
  const [themeDraftSecondary, setThemeDraftSecondary] = useState(DEFAULT_SECONDARY_COLOR);
  const [themeBusy, setThemeBusy] = useState(false);
  const [customLabelPresets, setCustomLabelPresets] = useState<CustomLabelPreset[]>([]);
  const [customLabelStyles, setCustomLabelStyles] = useState<CustomLabelStyle[]>([]);
  const [presetRollType, setPresetRollType] = useState('');
  const [presetWidthMm, setPresetWidthMm] = useState('33');
  const [presetHeightMm, setPresetHeightMm] = useState('23');
  const [presetRollWidthMm, setPresetRollWidthMm] = useState('');
  const [presetRollHeightMm, setPresetRollHeightMm] = useState('');
  const [presetRollGapMm, setPresetRollGapMm] = useState('');
  const [presetLabelsAcross, setPresetLabelsAcross] = useState('1');
  const [presetAcrossGapMm, setPresetAcrossGapMm] = useState('0');
  const [styleDesignerOpen, setStyleDesignerOpen] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const [developerConfig, setDeveloperConfig] = useState<DeveloperPrintConfig>(DEFAULT_DEVELOPER_CONFIG);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | ''>('');
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  const knownLabelKeys = useMemo(
    () => [...HARDCODED_LABEL_KEYS, ...customLabelPresets.map((p) => p.key)],
    [customLabelPresets],
  );
  const isFreeCustomSize =
    !knownLabelKeys.includes(form.barcodeLabelSize) &&
    FREE_CUSTOM_SIZE_RE.test(form.barcodeLabelSize);

  const refreshCustomLabelPresets = useCallback(async () => {
    try {
      const rows = await api.listCustomLabelPresets();
      setCustomLabelPresets(rows);
    } catch {
      setCustomLabelPresets([]);
    }
  }, []);

  const refreshCustomLabelStyles = useCallback(async () => {
    try {
      const rows = await api.listCustomLabelStyles();
      setCustomLabelStyles(rows);
    } catch {
      setCustomLabelStyles([]);
    }
  }, []);

  const refreshAccessStatus = useCallback(async () => {
    try {
      const status = await api.getIdentityAccessStatus();
      setIdentityEditActive(status.active);
    } catch {
      setIdentityEditActive(false);
    }
  }, []);

  useAccessComboListener({
    enabled: !loading && !identityEditActive,
    onMatch: () => {
      setAccessError('');
      setAccessInput('');
      setAccessPromptOpen(true);
    },
  });

  useEffect(() => {
    void refreshAccessStatus();
    return () => {
      void api.endIdentityAccess().catch(() => undefined);
    };
  }, [refreshAccessStatus]);

  useEffect(() => {
    if (!identityEditActive) return;

    function onActivity() {
      void api
        .touchIdentityAccess()
        .then((status) => setIdentityEditActive(status.active))
        .catch(() => setIdentityEditActive(false));
    }

    const timer = window.setInterval(onActivity, 60_000);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [identityEditActive]);

  async function submitAccessPrompt(event: FormEvent) {
    event.preventDefault();
    setAccessBusy(true);
    setAccessError('');
    try {
      const result = await api.verifyIdentityAccess(accessInput);
      if (!result.ok) {
        setAccessError('Incorrect passphrase.');
        return;
      }
      setIdentityEditActive(true);
      setAccessPromptOpen(false);
      setAccessInput('');
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setAccessBusy(false);
    }
  }

  async function onChangePassphrase(event: FormEvent) {
    event.preventDefault();
    setPassphraseMessage('');
    setError('');
    try {
      await api.changeIdentityPassphrase(currentPassphrase, newPassphrase);
      setPassphraseMessage('Passphrase updated.');
      setCurrentPassphrase('');
      setNewPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update passphrase');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;
        setForm({
          businessName: settings.businessName,
          tagline: settings.tagline,
          ownerName: settings.ownerName,
          phoneLabel: settings.phoneLabel ?? '',
          phone: settings.phone,
          whatsappLabel: settings.whatsappLabel ?? '',
          whatsapp: settings.whatsapp,
          address: settings.address,
          developerCreditLine: settings.developerCreditLine || DEFAULT_DEVELOPER_CREDIT_LINE,
          invoiceFooter: settings.invoiceFooter,
          returnPolicy: settings.returnPolicy,
          invoicePrefix: settings.invoicePrefix,
          currency: settings.currency,
          receiptSize: settings.receiptSize,
          a4InvoiceEnabled: settings.a4InvoiceEnabled,
          printerName: settings.printerName ?? '',
          barcodeLabelSize: settings.barcodeLabelSize,
          barcodeLabelStyle: settings.barcodeLabelStyle || 'builtin:standard',
          lowStockLimit: settings.lowStockLimit,
          backupFolderPath: settings.backupFolderPath,
          themeMode: settings.themeMode,
          primaryColor: settings.primaryColor || DEFAULT_PRIMARY_COLOR,
          secondaryColor: settings.secondaryColor || DEFAULT_SECONDARY_COLOR,
        });
        setThemeDraftPrimary(settings.primaryColor || DEFAULT_PRIMARY_COLOR);
        setThemeDraftSecondary(settings.secondaryColor || DEFAULT_SECONDARY_COLOR);
        setLogoUrl(settings.logoUrl);
        setDeveloperConfig(parseDeveloperConfig(settings.developerConfig));
        try {
          setCategories(await api.listProductCategories());
        } catch {
          setCategories([]);
        }
        await refreshCustomLabelPresets();
        await refreshCustomLabelStyles();
        if (settings.themeMode !== theme) {
          await refreshThemeFromServer();
        } else {
          applyBrandTheme(
            settings.primaryColor || DEFAULT_PRIMARY_COLOR,
            settings.secondaryColor || DEFAULT_SECONDARY_COLOR,
          );
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patchField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        invoiceFooter: form.invoiceFooter,
        returnPolicy: form.returnPolicy,
        invoicePrefix: form.invoicePrefix,
        currency: form.currency,
        receiptSize: form.receiptSize,
        a4InvoiceEnabled: form.a4InvoiceEnabled,
        printerName: form.printerName.trim() ? form.printerName.trim() : null,
        barcodeLabelSize: form.barcodeLabelSize,
        barcodeLabelStyle: form.barcodeLabelStyle,
        lowStockLimit: form.lowStockLimit,
        backupFolderPath: form.backupFolderPath,
        themeMode: theme,
      };

      if (identityEditActive) {
        for (const key of PROTECTED_SETTINGS_FIELD_KEYS) {
          if (key === 'logoPath' || key === 'primaryColor' || key === 'secondaryColor' || key === 'developerConfig') continue;
          if (key in form) {
            payload[key] = form[key as keyof typeof form];
          }
        }
        payload.developerConfig = developerConfig;
      }

      const saved = await api.updateSettings(payload as Parameters<typeof api.updateSettings>[0]);
      setForm((prev) => ({
        ...prev,
        businessName: saved.businessName,
        tagline: saved.tagline,
        ownerName: saved.ownerName,
        phoneLabel: saved.phoneLabel ?? '',
        phone: saved.phone,
        whatsappLabel: saved.whatsappLabel ?? '',
        whatsapp: saved.whatsapp,
        address: saved.address,
        developerCreditLine: saved.developerCreditLine || DEFAULT_DEVELOPER_CREDIT_LINE,
        invoiceFooter: saved.invoiceFooter,
        returnPolicy: saved.returnPolicy,
        invoicePrefix: saved.invoicePrefix,
        currency: saved.currency,
        receiptSize: saved.receiptSize,
        a4InvoiceEnabled: saved.a4InvoiceEnabled,
        printerName: saved.printerName ?? '',
        barcodeLabelSize: saved.barcodeLabelSize,
        barcodeLabelStyle: saved.barcodeLabelStyle || 'builtin:standard',
        lowStockLimit: saved.lowStockLimit,
        backupFolderPath: saved.backupFolderPath,
        themeMode: saved.themeMode,
        primaryColor: saved.primaryColor || DEFAULT_PRIMARY_COLOR,
        secondaryColor: saved.secondaryColor || DEFAULT_SECONDARY_COLOR,
      }));
      setThemeDraftPrimary(saved.primaryColor || DEFAULT_PRIMARY_COLOR);
      setThemeDraftSecondary(saved.secondaryColor || DEFAULT_SECONDARY_COLOR);
      if (saved.primaryColor && saved.secondaryColor) {
        applyBrandTheme(saved.primaryColor, saved.secondaryColor);
      }
      setLogoUrl(saved.logoUrl);
      if (saved.developerConfig) setDeveloperConfig(parseDeveloperConfig(saved.developerConfig));
      setMessage('Settings saved.');
      dispatchSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function addCustomLabelPreset() {
    setError('');
    setMessage('');
    const rollType = presetRollType.trim();
    const widthMm = Number(presetWidthMm);
    const heightMm = Number(presetHeightMm);
    if (!rollType) {
      setError('Roll type / name is required');
      return;
    }
    if (!Number.isInteger(widthMm) || widthMm < 10 || widthMm > 200) {
      setError('Print width must be an integer between 10 and 200 mm');
      return;
    }
    if (!Number.isInteger(heightMm) || heightMm < 10 || heightMm > 200) {
      setError('Print height must be an integer between 10 and 200 mm');
      return;
    }

    const optionalInt = (raw: string, label: string, min: number, max: number) => {
      const t = raw.trim();
      if (t === '') return undefined;
      const n = Number(t);
      if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(`${label} must be an integer between ${min} and ${max} mm`);
      }
      return n;
    };

    setPresetBusy(true);
    try {
      const rollWidthMm = optionalInt(presetRollWidthMm, 'Roll width', 10, 200);
      const rollHeightMm = optionalInt(presetRollHeightMm, 'Roll height', 10, 200);
      const rollGapMm = optionalInt(presetRollGapMm, 'Roll gap', 0, 20);
      const labelsAcross = optionalInt(presetLabelsAcross, 'Labels across', 1, 6);
      const acrossGapMm = optionalInt(presetAcrossGapMm, 'Gap between labels', 0, 50);
      const created = await api.createCustomLabelPreset({
        rollType,
        widthMm,
        heightMm,
        ...(rollWidthMm !== undefined ? { rollWidthMm } : {}),
        ...(rollHeightMm !== undefined ? { rollHeightMm } : {}),
        ...(rollGapMm !== undefined ? { rollGapMm } : {}),
        ...(labelsAcross !== undefined && labelsAcross > 1 ? { labelsAcross } : {}),
        ...(acrossGapMm !== undefined && acrossGapMm > 0 ? { acrossGapMm } : {}),
      });
      await refreshCustomLabelPresets();
      patchField('barcodeLabelSize', created.key);
      setPresetRollType('');
      setPresetWidthMm('33');
      setPresetHeightMm('23');
      setPresetRollWidthMm('');
      setPresetRollHeightMm('');
      setPresetRollGapMm('');
      setPresetLabelsAcross('1');
      setPresetAcrossGapMm('0');
      setMessage(`Added label preset: ${created.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add label preset');
    } finally {
      setPresetBusy(false);
    }
  }

  async function removeCustomLabelPreset(preset: CustomLabelPreset) {
    const ok = await confirmAction(`Delete label preset “${preset.label}”?`, {
      title: 'Delete preset',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setPresetBusy(true);
    setError('');
    try {
      await api.deleteCustomLabelPreset(preset.id);
      await refreshCustomLabelPresets();
      if (form.barcodeLabelSize === preset.key) {
        patchField('barcodeLabelSize', '58x40');
      }
      setMessage(`Deleted label preset: ${preset.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete label preset');
    } finally {
      setPresetBusy(false);
    }
  }

  async function onApplyTheme() {
    if (!identityEditActive) return;
    const primary = normalizeHexColor(themeDraftPrimary);
    const secondary = normalizeHexColor(themeDraftSecondary);
    if (!primary || !secondary) {
      setError('Primary and secondary colors must be hex values like #111111');
      return;
    }
    setThemeBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.updateSettings({ primaryColor: primary, secondaryColor: secondary });
      patchField('primaryColor', saved.primaryColor || primary);
      patchField('secondaryColor', saved.secondaryColor || secondary);
      applyBrandTheme(saved.primaryColor || primary, saved.secondaryColor || secondary);
      setMessage('Theme colors applied.');
      dispatchSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply theme');
    } finally {
      setThemeBusy(false);
    }
  }

  async function onResetTheme() {
    if (!identityEditActive) return;
    setThemeDraftPrimary(DEFAULT_PRIMARY_COLOR);
    setThemeDraftSecondary(DEFAULT_SECONDARY_COLOR);
    setThemeBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.updateSettings({
        primaryColor: DEFAULT_PRIMARY_COLOR,
        secondaryColor: DEFAULT_SECONDARY_COLOR,
      });
      patchField('primaryColor', saved.primaryColor || DEFAULT_PRIMARY_COLOR);
      patchField('secondaryColor', saved.secondaryColor || DEFAULT_SECONDARY_COLOR);
      applyBrandTheme(
        saved.primaryColor || DEFAULT_PRIMARY_COLOR,
        saved.secondaryColor || DEFAULT_SECONDARY_COLOR,
      );
      setMessage('Theme reset to default black and red.');
      dispatchSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset theme');
    } finally {
      setThemeBusy(false);
    }
  }

  async function onLogoChange(file: File | null) {
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const saved = await api.uploadLogo(file);
      setLogoUrl(saved.logoUrl);
      setMessage('Logo uploaded.');
      dispatchSettingsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed');
    }
  }

  function onThemeChange(next: 'light' | 'dark') {
    setTheme(next);
    patchField('themeMode', next);
  }

  if (loading) {
    return (
      <PageShell title="Settings" subtitle="Business settings">
        <p className="text-sm text-textMuted">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Settings" subtitle="Invoice, printer, inventory, and appearance">
      {identityEditActive ? (
        <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-950 dark:text-amber-100">
          Developer Edit Mode active — Business Info is editable for this session.
        </div>
      ) : null}

      {accessPromptOpen ? (
        <div data-page-modal="open" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Panel className="w-full max-w-sm">
            <form onSubmit={submitAccessPrompt} className="space-y-3">
              <TextInput
                type="password"
                autoFocus
                value={accessInput}
                onChange={(e) => setAccessInput(e.target.value)}
              />
              {accessError ? <Feedback variant="error">{accessError}</Feedback> : null}
              <div className="flex justify-end gap-2">
                <SecondaryButton type="button" onClick={() => setAccessPromptOpen(false)}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={accessBusy || !accessInput}>
                  {accessBusy ? 'Checking…' : 'Continue'}
                </PrimaryButton>
              </div>
            </form>
          </Panel>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSave}>
        <Panel className={`max-w-3xl space-y-4 ${identityEditActive ? 'ring-2 ring-amber-500/40' : ''}`}>
          {identityEditActive ? (
            <Tile>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Business Info</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel>Business name</FieldLabel>
                  <TextInput
                    value={form.businessName}
                    onChange={(e) => patchField('businessName', e.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Tagline</FieldLabel>
                  <TextInput value={form.tagline} onChange={(e) => patchField('tagline', e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Owner name</FieldLabel>
                  <TextInput value={form.ownerName} onChange={(e) => patchField('ownerName', e.target.value)} />
                </div>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Phone contact name</FieldLabel>
                    <TextInput
                      value={form.phoneLabel}
                      onChange={(e) => patchField('phoneLabel', e.target.value)}
                      placeholder="e.g. M Arslan"
                    />
                  </div>
                  <div>
                    <FieldLabel>Phone number</FieldLabel>
                    <TextInput
                      value={form.phone}
                      onChange={(e) => patchField('phone', e.target.value)}
                      placeholder="03024979697"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>WhatsApp contact name</FieldLabel>
                    <TextInput
                      value={form.whatsappLabel}
                      onChange={(e) => patchField('whatsappLabel', e.target.value)}
                      placeholder="e.g. M Usman"
                    />
                  </div>
                  <div>
                    <FieldLabel>WhatsApp number</FieldLabel>
                    <TextInput
                      value={form.whatsapp}
                      onChange={(e) => patchField('whatsapp', e.target.value)}
                      placeholder="03006195469"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Address</FieldLabel>
                  <TextInput value={form.address} onChange={(e) => patchField('address', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Developer credit line</FieldLabel>
                  <TextInput
                    value={form.developerCreditLine}
                    onChange={(e) => patchField('developerCreditLine', e.target.value)}
                  />
                  <p className="mt-1 text-xs text-textMuted">Shown as a small footer on invoices, receipts, and labels.</p>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Shop logo</FieldLabel>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-surface1 text-lg font-semibold text-textPrimary">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Shop logo" className="h-full w-full object-cover" />
                      ) : (
                        (form.businessName.trim().charAt(0) || 'I').toUpperCase()
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
                      className="text-sm text-textSecondary"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 rounded-lg border border-border bg-surface1 p-3">
                  <h3 className="mb-2 text-sm font-semibold">Brand colors</h3>
                  <p className="mb-3 text-xs text-textMuted">
                    Primary is the dark chrome (sidebar). Brand color is the red accent used on buttons, highlights, and headers.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Chrome / nav color</FieldLabel>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeHexColor(themeDraftPrimary) ?? DEFAULT_PRIMARY_COLOR}
                          onChange={(e) => setThemeDraftPrimary(e.target.value.toUpperCase())}
                          className="h-10 w-12 cursor-pointer rounded border border-border bg-transparent"
                        />
                        <TextInput
                          value={themeDraftPrimary}
                          onChange={(e) => setThemeDraftPrimary(e.target.value)}
                          placeholder="#0A0A0A"
                        />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Brand color</FieldLabel>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeHexColor(themeDraftSecondary) ?? DEFAULT_SECONDARY_COLOR}
                          onChange={(e) => setThemeDraftSecondary(e.target.value.toUpperCase())}
                          className="h-10 w-12 cursor-pointer rounded border border-border bg-transparent"
                        />
                        <TextInput
                          value={themeDraftSecondary}
                          onChange={(e) => setThemeDraftSecondary(e.target.value)}
                          placeholder="#C8102E"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div
                      className="flex h-12 min-w-[140px] items-center justify-center rounded px-3 text-sm font-medium"
                      style={{
                        backgroundColor: normalizeHexColor(themeDraftPrimary) ?? DEFAULT_PRIMARY_COLOR,
                        color: contrastingTextColor(themeDraftPrimary),
                      }}
                    >
                      Primary preview
                    </div>
                    <div
                      className="flex h-12 min-w-[140px] items-center justify-center rounded px-3 text-sm font-medium"
                      style={{
                        backgroundColor: normalizeHexColor(themeDraftSecondary) ?? DEFAULT_SECONDARY_COLOR,
                        color: contrastingTextColor(themeDraftSecondary),
                      }}
                    >
                      Secondary preview
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryButton type="button" onClick={() => void onApplyTheme()} disabled={themeBusy}>
                      {themeBusy ? 'Applying…' : 'Apply Theme'}
                    </PrimaryButton>
                    <SecondaryButton type="button" onClick={() => void onResetTheme()} disabled={themeBusy}>
                      Reset to Default
                    </SecondaryButton>
                  </div>
                </div>

              <div className="sm:col-span-2 rounded-lg border border-border bg-surface1 p-3">
                <h3 className="mb-2 text-sm font-semibold">Developer Settings</h3>
                <p className="mb-3 text-xs text-textMuted">
                  Hidden from shop-owner users. Controls what prints on invoices and barcode labels, including
                  field labels (paraphrase keys).
                </p>
                <div className="mb-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={developerConfig.showLogoOnInvoice}
                      onChange={(e) =>
                        setDeveloperConfig((prev) => ({
                          ...prev,
                          showLogoOnInvoice: e.target.checked,
                          invoiceFields: prev.invoiceFields.map((f) =>
                            f.key === 'logo' ? { ...f, enabled: e.target.checked } : f,
                          ),
                        }))
                      }
                    />
                    Show logo on invoice
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={developerConfig.showLogoOnBarcode}
                      onChange={(e) =>
                        setDeveloperConfig((prev) => ({
                          ...prev,
                          showLogoOnBarcode: e.target.checked,
                          barcodeFields: prev.barcodeFields.map((f) =>
                            f.key === 'logo' ? { ...f, enabled: e.target.checked } : f,
                          ),
                        }))
                      }
                    />
                    Show logo on barcode label
                  </label>
                </div>
                <div className="mb-3">
                  <FieldLabel>Tax info line (optional)</FieldLabel>
                  <TextInput
                    value={developerConfig.taxInfo}
                    onChange={(e) => setDeveloperConfig((prev) => ({ ...prev, taxInfo: e.target.value }))}
                    placeholder="NTN / STRN / tax registration"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ['Invoice fields', 'invoiceFields'] as const,
                      ['Barcode label fields', 'barcodeFields'] as const,
                    ]
                  ).map(([title, group]) => (
                    <div key={group}>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">{title}</h4>
                      <div className="space-y-2">
                        {developerConfig[group].map((field, idx) => (
                          <div key={field.key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.enabled}
                              onChange={(e) => {
                                const next = [...developerConfig[group]];
                                next[idx] = { ...field, enabled: e.target.checked };
                                setDeveloperConfig((prev) => {
                                  const patch = { ...prev, [group]: next };
                                  if (field.key === 'logo') {
                                    if (group === 'invoiceFields') patch.showLogoOnInvoice = e.target.checked;
                                    else patch.showLogoOnBarcode = e.target.checked;
                                  }
                                  return patch;
                                });
                              }}
                            />
                            <TextInput
                              value={field.label}
                              onChange={(e) => {
                                const next = [...developerConfig[group]];
                                next[idx] = { ...field, label: e.target.value };
                                setDeveloperConfig((prev) => ({ ...prev, [group]: next }));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-border bg-surface2 p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
                    Barcode label display
                  </h4>
                  <p className="mb-3 text-xs text-textMuted">
                    Use a shorter shop name on small labels, or add extra custom lines (e.g. branch, phone).
                  </p>
                  <div className="mb-3">
                    <FieldLabel>Barcode shop name (optional override)</FieldLabel>
                    <TextInput
                      value={developerConfig.barcodeBusinessName}
                      onChange={(e) =>
                        setDeveloperConfig((prev) => ({ ...prev, barcodeBusinessName: e.target.value }))
                      }
                      placeholder="Leave empty to use full business name from settings"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Custom label lines</FieldLabel>
                    {developerConfig.barcodeCustomLines.map((line, idx) => (
                      <div key={line.id} className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={line.enabled}
                          onChange={(e) => {
                            const next = [...developerConfig.barcodeCustomLines];
                            next[idx] = { ...line, enabled: e.target.checked };
                            setDeveloperConfig((prev) => ({ ...prev, barcodeCustomLines: next }));
                          }}
                        />
                        <TextInput
                          className="min-w-[12rem] flex-1"
                          value={line.text}
                          onChange={(e) => {
                            const next = [...developerConfig.barcodeCustomLines];
                            next[idx] = { ...line, text: e.target.value };
                            setDeveloperConfig((prev) => ({ ...prev, barcodeCustomLines: next }));
                          }}
                          placeholder="Custom text on label"
                        />
                        <SecondaryButton
                          type="button"
                          onClick={() => {
                            setDeveloperConfig((prev) => ({
                              ...prev,
                              barcodeCustomLines: prev.barcodeCustomLines.filter((row) => row.id !== line.id),
                            }));
                          }}
                        >
                          Remove
                        </SecondaryButton>
                      </div>
                    ))}
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setDeveloperConfig((prev) => ({
                          ...prev,
                          barcodeCustomLines: [
                            ...prev.barcodeCustomLines,
                            { id: `custom-${Date.now()}`, text: '', enabled: true },
                          ],
                        }));
                      }}
                    >
                      + Add custom line
                    </SecondaryButton>
                  </div>
                </div>
              </div>
              </div>
            </Tile>
          ) : null}

          <Tile>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Product categories</h2>
            <p className="mb-3 text-xs text-textMuted">
              Starter categories ship as defaults only — add, rename, or delete freely for this business. Nothing is a fixed enum.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <TextInput
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
              />
              <PrimaryButton
                type="button"
                disabled={categoryBusy || !newCategoryName.trim()}
                onClick={async () => {
                  setCategoryBusy(true);
                  setError('');
                  try {
                    const created = await api.createProductCategory(newCategoryName.trim());
                    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                    setNewCategoryName('');
                    setMessage('Category added.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add category');
                  } finally {
                    setCategoryBusy(false);
                  }
                }}
              >
                Add
              </PrimaryButton>
            </div>
            <ul className="space-y-2">
              {categories.map((cat) => (
                <li key={cat.id} className="flex flex-wrap items-center gap-2">
                  {editingCategoryId === cat.id ? (
                    <>
                      <TextInput
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                      />
                      <PrimaryButton
                        type="button"
                        disabled={categoryBusy || !editingCategoryName.trim()}
                        onClick={async () => {
                          setCategoryBusy(true);
                          setError('');
                          try {
                            const updated = await api.updateProductCategory(cat.id, editingCategoryName.trim());
                            setCategories((prev) =>
                              prev.map((c) => (c.id === cat.id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)),
                            );
                            setEditingCategoryId('');
                            setEditingCategoryName('');
                            setMessage('Category renamed.');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to rename category');
                          } finally {
                            setCategoryBusy(false);
                          }
                        }}
                      >
                        Save
                      </PrimaryButton>
                      <SecondaryButton type="button" onClick={() => setEditingCategoryId('')}>
                        Cancel
                      </SecondaryButton>
                    </>
                  ) : (
                    <>
                      <span className="min-w-[8rem] flex-1 text-sm">{cat.name}</span>
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setEditingCategoryId(cat.id);
                          setEditingCategoryName(cat.name);
                        }}
                      >
                        Rename
                      </SecondaryButton>
                      <SecondaryButton
                        type="button"
                        disabled={categoryBusy}
                        onClick={async () => {
                          const ok = await confirmAction(`Delete category “${cat.name}”? Products must be reassigned first.`, {
                            title: 'Delete category',
                            confirmLabel: 'Delete',
                          });
                          if (!ok) return;
                          setCategoryBusy(true);
                          setError('');
                          try {
                            await api.deleteProductCategory(cat.id);
                            setCategories((prev) => prev.filter((c) => c.id !== cat.id));
                            setMessage('Category removed.');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to delete category');
                          } finally {
                            setCategoryBusy(false);
                          }
                        }}
                      >
                        Delete
                      </SecondaryButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Tile>

          <Tile>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Invoice</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Invoice footer</FieldLabel>
                <TextInput value={form.invoiceFooter} onChange={(e) => patchField('invoiceFooter', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Return and exchange policy</FieldLabel>
                <textarea
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={3}
                  value={form.returnPolicy}
                  onChange={(e) => patchField('returnPolicy', e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Invoice prefix</FieldLabel>
                <TextInput
                  value={form.invoicePrefix}
                  onChange={(e) => patchField('invoicePrefix', e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Currency</FieldLabel>
                <TextInput
                  value={form.currency}
                  onChange={(e) => patchField('currency', e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Receipt size</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={form.receiptSize}
                  onChange={(e) => patchField('receiptSize', e.target.value as typeof form.receiptSize)}
                >
                  <option value="THERMAL_58">Thermal 58mm</option>
                  <option value="THERMAL_80">Thermal 78–80mm receipt (recommended)</option>
                  <option value="A4">A4</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-textPrimary">
                  <input
                    type="checkbox"
                    checked={form.a4InvoiceEnabled}
                    onChange={(e) => patchField('a4InvoiceEnabled', e.target.checked)}
                  />
                  Enable A4 invoice option
                </label>
              </div>
            </div>
          </Tile>

          <Tile>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Printer</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Printer name</FieldLabel>
                <TextInput
                  value={form.printerName}
                  onChange={(e) => patchField('printerName', e.target.value)}
                  placeholder="Exact Windows printer name (Devices & Printers)"
                />
                <p className="mt-1 text-xs text-textMuted">
                  Used for silent barcode/invoice printing in the desktop app. Leave blank to use the print dialog.
                  For 58×40 stickers, set the printer driver to gap/label sensing and 58×40 mm media.
                </p>
              </div>
              <div>
                <FieldLabel>Barcode label size</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
                  value={
                    knownLabelKeys.includes(form.barcodeLabelSize)
                      ? form.barcodeLabelSize
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      const current = form.barcodeLabelSize;
                      const keepFree =
                        FREE_CUSTOM_SIZE_RE.test(current) && !knownLabelKeys.includes(current);
                      patchField('barcodeLabelSize', keepFree ? current : '60x40');
                    } else {
                      patchField('barcodeLabelSize', e.target.value);
                    }
                  }}
                >
                  <option value="58x40">58 × 40 mm (sticker roll)</option>
                  <option value="33x23">33 × 23 mm (short roll)</option>
                  <option value="40x30">40 × 30 mm (thermal)</option>
                  <option value="50x25">50 × 25 mm (thermal)</option>
                  <option value="50x30">50 × 30 mm (thermal)</option>
                  <option value="a4">A4 sheet (grid)</option>
                  {customLabelPresets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom size…</option>
                </select>
                {isFreeCustomSize ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Width (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={20}
                        max={200}
                        value={String(Number(form.barcodeLabelSize.split('x')[0]) || 58)}
                        onChange={(e) => {
                          const w = Math.max(20, Math.min(200, Number(e.target.value) || 58));
                          const h = Number(form.barcodeLabelSize.split('x')[1]) || 40;
                          patchField('barcodeLabelSize', `${w}x${h}`);
                        }}
                      />
                    </div>
                    <div>
                      <FieldLabel>Height (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={15}
                        max={200}
                        value={String(Number(form.barcodeLabelSize.split('x')[1]) || 40)}
                        onChange={(e) => {
                          const h = Math.max(15, Math.min(200, Number(e.target.value) || 40));
                          const w = Number(form.barcodeLabelSize.split('x')[0]) || 58;
                          patchField('barcodeLabelSize', `${w}x${h}`);
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-textMuted">
                  Default size for bulk and single label printing. Override per print if needed.
                </p>
              </div>
              <div>
                <FieldLabel>Barcode label style</FieldLabel>
                <select
                  className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
                  value={form.barcodeLabelStyle}
                  onChange={(e) => patchField('barcodeLabelStyle', e.target.value)}
                >
                  <optgroup label="Built-in layouts">
                    <option value="builtin:standard">Standard</option>
                    <option value="builtin:priceFocus">Price focus</option>
                    <option value="builtin:compact">Compact</option>
                    <option value="builtin:minimal">Minimal</option>
                  </optgroup>
                  {customLabelStyles.length > 0 ? (
                    <optgroup label="Custom styles">
                      {customLabelStyles.map((style) => (
                        <option key={style.key} value={`custom:${style.key}`}>
                          {style.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <p className="mt-1 text-xs text-textMuted">
                  Default layout for bulk and single label printing. Override per print if needed.
                </p>
              </div>
              {identityEditActive ? (
                <div className="sm:col-span-2 space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <h3 className="text-sm font-semibold text-textPrimary">
                    Add custom label size (developer)
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FieldLabel>Roll type / name</FieldLabel>
                      <TextInput
                        value={presetRollType}
                        onChange={(e) => setPresetRollType(e.target.value)}
                        placeholder="e.g. Short roll, Thermal, Sticker roll"
                        maxLength={40}
                      />
                    </div>
                    <div>
                      <FieldLabel>Print width (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={10}
                        max={200}
                        step={1}
                        value={presetWidthMm}
                        onChange={(e) => setPresetWidthMm(e.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Print height (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={10}
                        max={200}
                        step={1}
                        value={presetHeightMm}
                        onChange={(e) => setPresetHeightMm(e.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Roll width (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={10}
                        max={200}
                        step={1}
                        value={presetRollWidthMm}
                        onChange={(e) => setPresetRollWidthMm(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <FieldLabel>Roll height (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={10}
                        max={200}
                        step={1}
                        value={presetRollHeightMm}
                        onChange={(e) => setPresetRollHeightMm(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <FieldLabel>Gap between labels (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={0}
                        max={20}
                        step={1}
                        value={presetRollGapMm}
                        onChange={(e) => setPresetRollGapMm(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <FieldLabel>Labels across</FieldLabel>
                      <TextInput
                        type="number"
                        min={1}
                        max={6}
                        step={1}
                        value={presetLabelsAcross}
                        onChange={(e) => setPresetLabelsAcross(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <FieldLabel>Gap between side-by-side labels (mm)</FieldLabel>
                      <TextInput
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={presetAcrossGapMm}
                        onChange={(e) => setPresetAcrossGapMm(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton
                      type="button"
                      disabled={presetBusy}
                      onClick={() => void addCustomLabelPreset()}
                    >
                      {presetBusy ? 'Saving…' : 'Add preset'}
                    </SecondaryButton>
                  </div>
                  <p className="text-xs text-textMuted">
                    Saved presets appear in the Barcode label size dropdown immediately, no app
                    update needed.
                  </p>
                  {customLabelPresets.length > 0 ? (
                    <ul className="space-y-2 border-t border-border/60 pt-3">
                      {customLabelPresets.map((preset) => (
                        <li
                          key={preset.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-textPrimary">{preset.label}</span>
                          <SecondaryButton
                            type="button"
                            disabled={presetBusy}
                            onClick={() => void removeCustomLabelPreset(preset)}
                          >
                            Delete
                          </SecondaryButton>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {identityEditActive ? (
                <div className="sm:col-span-2 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <h3 className="text-sm font-semibold text-textPrimary">
                    Custom label style (developer)
                  </h3>
                  <p className="text-xs text-textMuted">
                    Place shop name, price, barcode, and custom text anywhere on the label. Saved
                    styles appear in the print dialog and in the default style dropdown above.
                  </p>
                  <SecondaryButton type="button" onClick={() => setStyleDesignerOpen(true)}>
                    Design custom label style
                  </SecondaryButton>
                </div>
              ) : null}
            </div>
          </Tile>

          <Tile>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Inventory</h2>
            <div className="max-w-xs">
              <FieldLabel>Low-stock limit</FieldLabel>
              <TextInput
                type="number"
                min={1}
                value={String(form.lowStockLimit)}
                onChange={(e) => patchField('lowStockLimit', Number(e.target.value) || 1)}
                required
              />
            </div>
          </Tile>

          <Tile>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Backup</h2>
            <div>
              <FieldLabel>Backup folder path</FieldLabel>
              <TextInput
                value={form.backupFolderPath}
                onChange={(e) => patchField('backupFolderPath', e.target.value)}
                placeholder="e.g. D:\INAAM-Autos\Backups"
              />
              <p className="mt-1 text-xs text-textMuted">
                Manual backups are stored here when set; otherwise defaults to the app data folder. See{' '}
                <Link to="/system/health" className="text-brand underline">
                  System Health
                </Link>{' '}
                for backup history and restore.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SecondaryButton
                type="button"
                disabled={backupBusy}
                onClick={async () => {
                  setBackupBusy(true);
                  setMessage('');
                  try {
                    await api.createBackup(form.backupFolderPath || undefined);
                    setMessage('Backup created successfully.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Backup failed');
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                {backupBusy ? 'Backing up…' : 'Create backup now'}
              </SecondaryButton>
            </div>
          </Tile>

          <Tile>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-textPrimary">Appearance</p>
                <p className="mt-1 text-xs text-textMuted">Light or dark. Saved to business settings and cached locally.</p>
              </div>
              <div className="flex rounded-lg border border-border bg-surface1 p-1">
                <button
                  type="button"
                  onClick={() => onThemeChange('light')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    theme === 'light' ? 'bg-accent text-onAccent' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => onThemeChange('dark')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    theme === 'dark' ? 'bg-accent text-onAccent' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>
          </Tile>

          {identityEditActive ? (
            <Tile>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-textMuted">Access passphrase</h2>
              <form className="grid max-w-md gap-3" onSubmit={onChangePassphrase}>
                <div>
                  <FieldLabel>Current passphrase</FieldLabel>
                  <TextInput
                    type="password"
                    value={currentPassphrase}
                    onChange={(e) => setCurrentPassphrase(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>New passphrase</FieldLabel>
                  <TextInput
                    type="password"
                    value={newPassphrase}
                    onChange={(e) => setNewPassphrase(e.target.value)}
                    minLength={4}
                    required
                  />
                </div>
                {passphraseMessage ? <Feedback variant="success">{passphraseMessage}</Feedback> : null}
                <PrimaryButton type="submit">Update passphrase</PrimaryButton>
              </form>
            </Tile>
          ) : null}

          {error ? <Feedback variant="error">{error}</Feedback> : null}
          {message ? <Feedback variant="success">{message}</Feedback> : null}

          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => window.location.reload()}>
              Reset
            </SecondaryButton>
          </div>
        </Panel>
      </form>
      {styleDesignerOpen ? (
        <LabelStyleDesigner
          onClose={() => {
            setStyleDesignerOpen(false);
            void refreshCustomLabelStyles();
          }}
          onUseAsLabelSize={({ widthMm, heightMm }) => {
            setPresetWidthMm(String(widthMm));
            setPresetHeightMm(String(heightMm));
            setStyleDesignerOpen(false);
            setMessage(
              `Canvas ${widthMm}×${heightMm} mm copied into Add custom label size — name the roll and click Add preset.`,
            );
          }}
        />
      ) : null}
    </PageShell>
  );
}
