import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { resolveLogoDataUrl } from '../lib/electronPrint';
import type { ReportExportMeta } from '../lib/reportExport';

export function useBusinessReportMeta(): ReportExportMeta {
  const [meta, setMeta] = useState<ReportExportMeta>({});

  useEffect(() => {
    api
      .getSettings()
      .then(async (settings) => {
        const logoSrc = await resolveLogoDataUrl(settings.logoUrl);
        setMeta({
          businessName: settings.businessName,
          address: settings.address,
          phone: [settings.phoneLabel, settings.phone].filter(Boolean).join(' ').trim(),
          logoSrc,
        });
      })
      .catch(() => undefined);
  }, []);

  return meta;
}
